-- M2d: profession (category group) is permanent once a worker has submitted.
CREATE OR REPLACE FUNCTION public.node_category(_slug text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _slug IS NULL THEN NULL ELSE split_part(_slug,'--',1) || '--' || split_part(_slug,'--',2) END $$;

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS locked_category text;
-- backfill for anyone already submitted
SELECT set_config('meiyiyal.trusted','on',true);
UPDATE public.workers SET locked_category = public.node_category(primary_node) WHERE submitted_at IS NOT NULL AND locked_category IS NULL;
SELECT set_config('meiyiyal.trusted','off',true);

CREATE OR REPLACE FUNCTION public.guard_worker_profession() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- lock is set on first submit and can never be cleared or changed (not even by admin, to protect history/ratings)
    IF OLD.locked_category IS NOT NULL AND NEW.locked_category IS DISTINCT FROM OLD.locked_category THEN
      RAISE EXCEPTION 'profession is locked (%)', OLD.locked_category; END IF;
    IF OLD.locked_category IS NULL AND NEW.locked_category IS NOT NULL AND NOT public.trusted() THEN
      RAISE EXCEPTION 'locked_category is server-controlled'; END IF;
    IF NEW.submitted_at IS NOT NULL AND NEW.locked_category IS NULL THEN NEW.locked_category := public.node_category(NEW.primary_node); END IF;
  ELSIF NEW.locked_category IS NOT NULL AND NOT public.trusted() THEN
    NEW.locked_category := NULL;
  END IF;
  IF NEW.locked_category IS NOT NULL AND public.node_category(NEW.primary_node) <> NEW.locked_category THEN
    RAISE EXCEPTION 'profession is locked (%): cannot switch to %', NEW.locked_category, public.node_category(NEW.primary_node); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_worker_profession ON public.workers;
CREATE TRIGGER trg_guard_worker_profession BEFORE INSERT OR UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.guard_worker_profession();

-- practice areas must stay inside the worker's profession
CREATE OR REPLACE FUNCTION public.guard_worker_nodes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cat text;
BEGIN
  SELECT COALESCE(locked_category, public.node_category(primary_node)) INTO _cat FROM public.workers WHERE id = NEW.worker_id;
  IF _cat IS NOT NULL AND public.node_category(NEW.node_slug) <> _cat THEN RAISE EXCEPTION 'area % is outside profession %', NEW.node_slug, _cat; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_worker_nodes ON public.worker_nodes;
CREATE TRIGGER trg_guard_worker_nodes BEFORE INSERT OR UPDATE ON public.worker_nodes FOR EACH ROW EXECUTE FUNCTION public.guard_worker_nodes();

-- worker_register: one worker profile per user (UNIQUE user_id); refuse a different profession once locked
CREATE OR REPLACE FUNCTION public.worker_register_guard(_node text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _lc text;
BEGIN
  SELECT locked_category INTO _lc FROM public.workers WHERE user_id = auth.uid();
  IF _lc IS NOT NULL AND public.node_category(_node) <> _lc THEN
    RAISE EXCEPTION 'already registered as % — profession cannot be changed', _lc USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.worker_register(_node text, _extra_nodes text[], _display_name text, _years int, _about text, _reg jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _loc record; _cat text; n text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  PERFORM public.worker_register_guard(_node);
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug=_node AND is_active AND kind IN ('subcategory','specialty')) THEN RAISE EXCEPTION 'pick a sub-category'; END IF;
  _cat := split_part(_node,'--',1) || '--' || split_part(_node,'--',2);
  IF COALESCE(array_length(_extra_nodes,1),0) > 5 THEN RAISE EXCEPTION 'max 5 extra areas'; END IF;
  FOREACH n IN ARRAY COALESCE(_extra_nodes,'{}') LOOP
    IF n NOT LIKE _cat || '--%' OR NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug=n AND is_active) THEN RAISE EXCEPTION 'extra area % not in same profession', n; END IF;
  END LOOP;
  SELECT * INTO _w FROM public.workers WHERE user_id = auth.uid();
  IF FOUND AND _w.status IN ('pending','approved','blocked') THEN RAISE EXCEPTION 'registration is locked while %', _w.status; END IF;
  SELECT l.geog, l.district_slug INTO _loc FROM public.user_locations l WHERE l.user_id=auth.uid() AND l.is_current;
  PERFORM set_config('meiyiyal.trusted','on',true);
  INSERT INTO public.workers(user_id, category, primary_node, display_name, years_experience, about, reg_data, base_geog, district_slug, status, is_active, is_verified)
  VALUES (auth.uid(), 'professional', _node, btrim(_display_name), _years, left(_about,1000), COALESCE(_reg,'{}'), _loc.geog, _loc.district_slug, 'draft', false, false)
  ON CONFLICT (user_id) DO UPDATE SET primary_node=EXCLUDED.primary_node, display_name=EXCLUDED.display_name, years_experience=EXCLUDED.years_experience,
    about=EXCLUDED.about, reg_data=EXCLUDED.reg_data, base_geog=COALESCE(EXCLUDED.base_geog, workers.base_geog), district_slug=COALESCE(EXCLUDED.district_slug, workers.district_slug)
  RETURNING * INTO _w;
  DELETE FROM public.worker_nodes WHERE worker_id=_w.id;
  INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) VALUES (_w.id,_node,true);
  INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT _w.id, x, false FROM unnest(COALESCE(_extra_nodes,'{}')) x WHERE x <> _node ON CONFLICT DO NOTHING;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN _w.id;
END $$;

