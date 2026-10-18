-- M11: a professional's searchable location follows where they actually are (found by the location scenarios).
-- Before: base_geog was copied once at registration, so a doctor who moved or travelled kept being shown (and
-- ranked by distance) at the old place. Now going online, and confirming a new location while online, moves it.
-- Clients still only ever see a rounded distance (public_km) and the district, never these coordinates.
CREATE OR REPLACE FUNCTION public.worker_set_online(_online boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _w public.workers; _loc record;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id=auth.uid();
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'not approved yet' USING ERRCODE='42501'; END IF;
  IF _online AND public.worker_is_blocked(_w) THEN RAISE EXCEPTION 'temporarily blocked until %', to_char(_w.blocked_until AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY HH24:MI') USING ERRCODE='42501'; END IF;
  SELECT l.geog, l.district_slug INTO _loc FROM public.user_locations l WHERE l.user_id = auth.uid() AND l.is_current ORDER BY l.created_at DESC LIMIT 1;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET is_online=_online, last_seen_at=now(),
    photo_url=COALESCE((SELECT avatar_url FROM public.profiles WHERE user_id=auth.uid()), photo_url),
    base_geog = CASE WHEN _online AND _loc.geog IS NOT NULL THEN _loc.geog ELSE base_geog END,
    district_slug = CASE WHEN _online AND _loc.geog IS NOT NULL THEN COALESCE(_loc.district_slug, district_slug) ELSE district_slug END
  WHERE id=_w.id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN _online;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_worker_follow_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_current AND EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id = NEW.user_id AND w.is_online AND w.status = 'approved') THEN
    PERFORM set_config('meiyiyal.trusted','on',true);
    UPDATE public.workers SET base_geog = NEW.geog, district_slug = COALESCE(NEW.district_slug, district_slug)
    WHERE user_id = NEW.user_id AND is_online;
    PERFORM set_config('meiyiyal.trusted','off',true);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_worker_follow_location() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS worker_follow_location ON public.user_locations;
CREATE TRIGGER worker_follow_location AFTER INSERT OR UPDATE OF is_current, geog ON public.user_locations
  FOR EACH ROW EXECUTE FUNCTION public.trg_worker_follow_location();
