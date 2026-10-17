-- M4: feedback (1 per session), server-side rating aggregates, config-driven reward milestones + certificates,
-- complaint flags (auto-clear after N good sessions), auto temporary blocks, admin moderation + rate editing, public worker profile.

INSERT INTO public.app_settings(key,value) VALUES
  ('good_rating_min','4'), ('negative_rating_max','2'),
  ('flag_clear_good_sessions','3'),
  ('block_negatives','3'), ('block_window_days','30'), ('block_days','7'),
  ('feedback_tags', '{
    "positive":[{"key":"clear_advice","en":"Clear advice","ta":"தெளிவான ஆலோசனை"},{"key":"patient","en":"Patient listener","ta":"பொறுமையாக கேட்டார்"},
                {"key":"on_time","en":"On time","ta":"சரியான நேரம்"},{"key":"knowledgeable","en":"Knowledgeable","ta":"நல்ல அறிவு"},{"key":"friendly","en":"Friendly","ta":"நட்பானவர்"}],
    "negative":[{"key":"rude","en":"Rude behaviour","ta":"மரியாதையற்ற நடத்தை"},{"key":"unhelpful","en":"Not helpful","ta":"உதவவில்லை"},
                {"key":"late","en":"Kept me waiting","ta":"காக்க வைத்தார்"},{"key":"poor_connection","en":"Poor connection","ta":"மோசமான இணைப்பு"},{"key":"overcharged","en":"Wasted time","ta":"நேரம் வீணானது"}],
    "complaint":[{"key":"misconduct","en":"Misconduct","ta":"தவறான நடத்தை"},{"key":"fake_profile","en":"Not a real professional","ta":"போலி நிபுணர்"},
                 {"key":"wrong_advice","en":"Harmful / wrong advice","ta":"தவறான ஆலோசனை"},{"key":"abuse","en":"Abuse or harassment","ta":"துன்புறுத்தல்"},{"key":"other","en":"Other","ta":"மற்றவை"}]}')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.setting_num(_k text, _d numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public.setting(_k)#>>'{}')::numeric, _d) $$;
CREATE OR REPLACE FUNCTION public.feedback_config() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('tags', public.setting('feedback_tags'), 'good_rating_min', public.setting_num('good_rating_min',4),
    'flag_clear_good_sessions', public.setting_num('flag_clear_good_sessions',3), 'block_negatives', public.setting_num('block_negatives',3),
    'block_window_days', public.setting_num('block_window_days',30), 'block_days', public.setting_num('block_days',7)) $$;

-- ---------- worker moderation state ----------
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS flag_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_good_needed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS block_reason text,
  ADD COLUMN IF NOT EXISTS strikes_reset_at timestamptz NOT NULL DEFAULT '-infinity';

CREATE OR REPLACE FUNCTION public.guard_worker_moderation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.trusted() OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.flag_active := false; NEW.flag_good_needed := 0; NEW.flag_reason := NULL; NEW.flagged_at := NULL; NEW.blocked_until := NULL; NEW.block_reason := NULL;
    NEW.strikes_reset_at := '-infinity'; RETURN NEW;
  END IF;
  IF (NEW.flag_active, NEW.flag_good_needed, NEW.flag_reason, NEW.flagged_at, NEW.blocked_until, NEW.block_reason, NEW.strikes_reset_at)
     IS DISTINCT FROM (OLD.flag_active, OLD.flag_good_needed, OLD.flag_reason, OLD.flagged_at, OLD.blocked_until, OLD.block_reason, OLD.strikes_reset_at) THEN
    RAISE EXCEPTION 'moderation fields can only be changed by the server' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_worker_moderation ON public.workers;
CREATE TRIGGER guard_worker_moderation BEFORE INSERT OR UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.guard_worker_moderation();

CREATE OR REPLACE FUNCTION public.worker_is_blocked(_w public.workers) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _w.blocked_until IS NOT NULL AND _w.blocked_until > now() $$;

-- ---------- feedback ----------
CREATE TABLE public.consult_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.consult_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags text[] NOT NULL DEFAULT '{}',
  comment text CHECK (char_length(comment) <= 500),
  is_complaint boolean NOT NULL DEFAULT false,
  complaint_reason text,
  is_good boolean NOT NULL,
  is_negative boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consult_feedback_worker_idx ON public.consult_feedback(worker_id, created_at DESC);
ALTER TABLE public.consult_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "author reads own feedback" ON public.consult_feedback FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admin reads feedback" ON public.consult_feedback FOR SELECT USING (public.has_role(auth.uid(),'admin'));
-- no insert/update/delete policies: writes only via feedback_submit()

-- ---------- reward milestones (config) + awards ----------
CREATE TABLE public.reward_milestones (
  slug text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('sessions_served','rating_avg','positive_streak','five_stars')),
  threshold numeric NOT NULL CHECK (threshold > 0),
  min_reviews int NOT NULL DEFAULT 0,
  title_i18n jsonb NOT NULL, desc_i18n jsonb NOT NULL,
  icon text NOT NULL DEFAULT 'award', color text NOT NULL DEFAULT 'amber',
  sort int NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.reward_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read milestones" ON public.reward_milestones FOR SELECT USING (true);
CREATE POLICY "admin write milestones" ON public.reward_milestones FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.reward_milestones(slug,kind,threshold,min_reviews,title_i18n,desc_i18n,icon,color,sort) VALUES
 ('first_consult','sessions_served',1,0,'{"en":"First Consultation","ta":"முதல் ஆலோசனை"}','{"en":"Completed the first consultation on Meiyiyal","ta":"மெய்யியலில் முதல் ஆலோசனையை நிறைவு செய்தார்"}','sparkles','sky',10),
 ('first_five_star','five_stars',1,0,'{"en":"First 5-Star Review","ta":"முதல் 5 நட்சத்திர மதிப்பீடு"}','{"en":"Received a 5-star rating from a client","ta":"வாடிக்கையாளரிடமிருந்து 5 நட்சத்திரம் பெற்றார்"}','star','amber',20),
 ('sessions_10','sessions_served',10,0,'{"en":"10 Clients Served","ta":"10 பேருக்கு சேவை"}','{"en":"Completed 10 consultations","ta":"10 ஆலோசனைகளை நிறைவு செய்தார்"}','users','emerald',30),
 ('streak_5','positive_streak',5,0,'{"en":"Trusted Streak","ta":"நம்பிக்கை தொடர்"}','{"en":"5 positive reviews in a row","ta":"தொடர்ந்து 5 நேர்மறை மதிப்பீடுகள்"}','flame','orange',40),
 ('top_rated','rating_avg',4.5,10,'{"en":"Top Rated","ta":"சிறந்த மதிப்பீடு"}','{"en":"Average rating 4.5+ over 10+ reviews","ta":"10+ மதிப்பீடுகளில் சராசரி 4.5+"}','trophy','violet',50),
 ('sessions_50','sessions_served',50,0,'{"en":"50 Clients Served","ta":"50 பேருக்கு சேவை"}','{"en":"Completed 50 consultations","ta":"50 ஆலோசனைகளை நிறைவு செய்தார்"}','medal','emerald',60),
 ('streak_20','positive_streak',20,0,'{"en":"Community Champion","ta":"சமூக சாம்பியன்"}','{"en":"20 positive reviews in a row","ta":"தொடர்ந்து 20 நேர்மறை மதிப்பீடுகள்"}','crown','rose',70),
 ('sessions_100','sessions_served',100,0,'{"en":"Century of Care","ta":"நூறு சேவைகள்"}','{"en":"Completed 100 consultations","ta":"100 ஆலோசனைகளை நிறைவு செய்தார்"}','gem','fuchsia',80),
 ('excellence','rating_avg',4.8,25,'{"en":"Excellence Award","ta":"சிறப்பு விருது"}','{"en":"Average rating 4.8+ over 25+ reviews","ta":"25+ மதிப்பீடுகளில் சராசரி 4.8+"}','badge-check','teal',90)
ON CONFLICT (slug) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.certificate_seq START 1001;
CREATE TABLE public.worker_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  milestone text NOT NULL REFERENCES public.reward_milestones(slug) ON UPDATE CASCADE,
  cert_no text NOT NULL UNIQUE DEFAULT ('MYL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.certificate_seq')::text, 6, '0')),
  metric numeric,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, milestone)
);
ALTER TABLE public.worker_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read rewards" ON public.worker_rewards FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.worker_stats(_wid uuid) RETURNS TABLE(sessions_served int, users_served int, avg_rating numeric, reviews int, five_stars int, streak int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*)::int FROM public.consult_sessions s WHERE s.worker_id=_wid AND s.status='ended' AND s.credits_used > 0),
         (SELECT count(DISTINCT s.user_id)::int FROM public.consult_sessions s WHERE s.worker_id=_wid AND s.status='ended' AND s.credits_used > 0),
         (SELECT round(avg(rating)::numeric, 2) FROM public.consult_feedback f WHERE f.worker_id=_wid),
         (SELECT count(*)::int FROM public.consult_feedback f WHERE f.worker_id=_wid),
         (SELECT count(*)::int FROM public.consult_feedback f WHERE f.worker_id=_wid AND rating=5),
         (SELECT count(*)::int FROM (SELECT is_good, row_number() OVER (ORDER BY created_at DESC) rn FROM public.consult_feedback f WHERE f.worker_id=_wid) x
           WHERE x.rn < COALESCE((SELECT min(rn) FROM (SELECT is_good, row_number() OVER (ORDER BY created_at DESC) rn FROM public.consult_feedback f2 WHERE f2.worker_id=_wid) y WHERE NOT y.is_good), 2147483647))
$$;

-- Recompute aggregates + award newly reached milestones. Returns slugs newly awarded.
CREATE OR REPLACE FUNCTION public.worker_refresh(_wid uuid) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; m record; _new text[] := '{}'; _val numeric; _prev text := current_setting('meiyiyal.trusted', true);
BEGIN
  SELECT * INTO st FROM public.worker_stats(_wid);
  FOR m IN SELECT * FROM public.reward_milestones WHERE active ORDER BY sort LOOP
    _val := CASE m.kind WHEN 'sessions_served' THEN st.sessions_served WHEN 'rating_avg' THEN st.avg_rating WHEN 'positive_streak' THEN st.streak WHEN 'five_stars' THEN st.five_stars END;
    IF _val IS NOT NULL AND _val >= m.threshold AND COALESCE(st.reviews,0) >= m.min_reviews THEN
      INSERT INTO public.worker_rewards(worker_id, milestone, metric) VALUES (_wid, m.slug, _val) ON CONFLICT DO NOTHING;
      IF FOUND THEN _new := _new || m.slug; END IF;
    END IF;
  END LOOP;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET rating = COALESCE(st.avg_rating,0), total_reviews = COALESCE(st.reviews,0),
    rewards_count = (SELECT count(*) FROM public.worker_rewards r WHERE r.worker_id=_wid) WHERE id=_wid;
  PERFORM set_config('meiyiyal.trusted', COALESCE(NULLIF(_prev,''),'off'), true);
  RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.worker_refresh(uuid), public.worker_stats(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_session_ended() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status <> 'ended' THEN PERFORM public.worker_refresh(NEW.worker_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_session_ended ON public.consult_sessions;
CREATE TRIGGER on_session_ended AFTER UPDATE OF status ON public.consult_sessions FOR EACH ROW EXECUTE FUNCTION public.on_session_ended();

-- ---------- submit feedback ----------
CREATE OR REPLACE FUNCTION public.feedback_submit(_sid uuid, _rating int, _tags text[] DEFAULT '{}', _comment text DEFAULT NULL,
  _complaint boolean DEFAULT false, _complaint_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.consult_sessions; _w public.workers; _cfg jsonb := public.setting('feedback_tags'); _allowed text[]; _good boolean; _neg boolean;
  _negs int; _awarded text[]; _blocked boolean := false; _flag_cleared boolean := false; _reason text;
BEGIN
  SELECT * INTO _s FROM public.consult_sessions WHERE id=_sid FOR UPDATE;
  IF NOT FOUND OR _s.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'only the client of this session can leave feedback' USING ERRCODE='42501'; END IF;
  IF _s.status <> 'ended' THEN RAISE EXCEPTION 'session is still active'; END IF;
  IF EXISTS (SELECT 1 FROM public.consult_feedback WHERE session_id=_sid) THEN RAISE EXCEPTION 'feedback already submitted'; END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'rating must be 1-5'; END IF;
  _tags := COALESCE(_tags,'{}');
  SELECT array_agg(t->>'key') INTO _allowed FROM jsonb_array_elements(COALESCE(_cfg->'positive','[]') || COALESCE(_cfg->'negative','[]')) t;
  IF array_length(_tags,1) > 6 OR NOT (_tags <@ COALESCE(_allowed,'{}')) THEN RAISE EXCEPTION 'invalid tags'; END IF;
  _comment := NULLIF(btrim(_comment),'');
  IF char_length(_comment) > 500 THEN RAISE EXCEPTION 'comment too long'; END IF;
  IF _complaint AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_cfg->'complaint','[]')) t WHERE t->>'key' = _complaint_reason) THEN RAISE EXCEPTION 'choose a complaint reason'; END IF;
  _good := NOT _complaint AND _rating >= public.setting_num('good_rating_min',4);
  _neg := _complaint OR _rating <= public.setting_num('negative_rating_max',2);
  INSERT INTO public.consult_feedback(session_id,user_id,worker_id,rating,tags,comment,is_complaint,complaint_reason,is_good,is_negative)
  VALUES (_sid, auth.uid(), _s.worker_id, _rating, _tags, _comment, COALESCE(_complaint,false), CASE WHEN _complaint THEN _complaint_reason END, _good, _neg);

  SELECT * INTO _w FROM public.workers WHERE id=_s.worker_id FOR UPDATE;
  PERFORM set_config('meiyiyal.trusted','on',true);
  IF _neg THEN
    _reason := CASE WHEN _complaint THEN 'complaint:' || _complaint_reason ELSE 'low_rating:' || _rating END;
    UPDATE public.workers SET flag_active=true, flag_good_needed=public.setting_num('flag_clear_good_sessions',3)::int, flag_reason=_reason, flagged_at=now() WHERE id=_w.id;
    SELECT count(*) INTO _negs FROM public.consult_feedback f WHERE f.worker_id=_w.id AND f.is_negative
      AND f.created_at > GREATEST(_w.strikes_reset_at, now() - make_interval(days => public.setting_num('block_window_days',30)::int));
    IF _negs >= public.setting_num('block_negatives',3) AND NOT public.worker_is_blocked(_w) THEN
      UPDATE public.workers SET blocked_until = now() + make_interval(days => public.setting_num('block_days',7)::int),
        block_reason = 'auto:' || _negs || '_negatives', is_online=false, strikes_reset_at=now() WHERE id=_w.id;
      INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'worker.auto_block',_w.id,'auto: '||_negs||' negative reviews', jsonb_build_object('negatives',_negs));
      _blocked := true;
    END IF;
  ELSIF _good AND _w.flag_active THEN
    UPDATE public.workers SET flag_good_needed = GREATEST(flag_good_needed - 1, 0),
      flag_active = flag_good_needed - 1 > 0, flag_reason = CASE WHEN flag_good_needed - 1 > 0 THEN flag_reason END,
      flagged_at = CASE WHEN flag_good_needed - 1 > 0 THEN flagged_at END WHERE id=_w.id RETURNING NOT flag_active INTO _flag_cleared;
    IF _flag_cleared THEN INSERT INTO public.admin_audit(actor,action,target,note) VALUES (auth.uid(),'worker.flag_auto_cleared',_w.id,'cleared after good sessions'); END IF;
  END IF;
  PERFORM set_config('meiyiyal.trusted','off',true);
  _awarded := public.worker_refresh(_w.id);
  RETURN jsonb_build_object('good',_good,'negative',_neg,'blocked',_blocked,'flag_cleared',_flag_cleared,'awarded',to_jsonb(_awarded));
END $$;

CREATE OR REPLACE FUNCTION public.my_feedback(_sid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(f) - 'user_id' FROM public.consult_feedback f WHERE f.session_id=_sid AND f.user_id=auth.uid() $$;

-- ---------- availability: blocked workers are hidden and can't go online / be requested ----------
CREATE OR REPLACE FUNCTION public.worker_set_online(_online boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id=auth.uid();
  IF NOT FOUND OR _w.status <> 'approved' OR NOT _w.is_active THEN RAISE EXCEPTION 'not approved yet' USING ERRCODE='42501'; END IF;
  IF _online AND public.worker_is_blocked(_w) THEN RAISE EXCEPTION 'temporarily blocked until %', to_char(_w.blocked_until AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY HH24:MI') USING ERRCODE='42501'; END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET is_online=_online, last_seen_at=now(),
    photo_url=COALESCE((SELECT avatar_url FROM public.profiles WHERE user_id=auth.uid()), photo_url) WHERE id=_w.id;
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN _online;
END $$;
CREATE OR REPLACE FUNCTION public.worker_heartbeat() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers SET last_seen_at = now() WHERE user_id = auth.uid() AND is_online AND status='approved' AND (blocked_until IS NULL OR blocked_until <= now());
  PERFORM set_config('meiyiyal.trusted','off',true);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.request_block_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workers w WHERE w.id=NEW.worker_id AND w.blocked_until > now()) THEN RAISE EXCEPTION 'worker unavailable'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS request_block_guard ON public.consult_requests;
CREATE TRIGGER request_block_guard BEFORE INSERT ON public.consult_requests FOR EACH ROW EXECUTE FUNCTION public.request_block_guard();

DROP FUNCTION IF EXISTS public.search_workers(text,double precision,double precision,double precision,boolean,int);
CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, is_busy boolean, distance_km double precision, district_slug text, district_name jsonb, rates jsonb, badges jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography g)
  SELECT w.id, w.display_name, w.photo_url, w.rating, w.total_reviews, w.rewards_count, w.years_experience,
    w.primary_node, t.name_i18n,
    (w.is_online AND w.last_seen_at > now() - public.presence_window()) AS online,
    EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id=w.id AND s.status='active'),
    round((ST_Distance(w.base_geog, p.g)/1000)::numeric, 1)::double precision,
    w.district_slug, d.name_i18n, public.rates_for(w.primary_node),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('slug',m.slug,'icon',m.icon,'color',m.color,'title',m.title_i18n) ORDER BY m.sort DESC)
              FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug=r.milestone WHERE r.worker_id=w.id), '[]')
  FROM public.workers w CROSS JOIN p
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = w.district_slug
  WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
    AND (w.blocked_until IS NULL OR w.blocked_until <= now())
    AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
    AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000))
  ORDER BY online DESC, w.flag_active, ST_Distance(w.base_geog, p.g), w.rating DESC
  LIMIT LEAST(GREATEST(_limit,1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.search_workers(text,double precision,double precision,double precision,boolean,int) TO anon, authenticated;

-- ---------- public worker profile ----------
CREATE OR REPLACE FUNCTION public.worker_public(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; st record;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE id=_id AND status='approved' AND is_active;
  IF NOT FOUND OR (public.worker_is_blocked(_w) AND _w.user_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RETURN NULL; END IF;
  SELECT * INTO st FROM public.worker_stats(_id);
  RETURN jsonb_build_object('id',_w.id,'display_name',_w.display_name,'photo_url',_w.photo_url,'about',_w.about,'years_experience',_w.years_experience,
    'primary_node',_w.primary_node,'specialty',(SELECT name_i18n FROM public.taxonomy_nodes WHERE slug=_w.primary_node),
    'category',(SELECT name_i18n FROM public.taxonomy_nodes WHERE slug=public.node_category(_w.primary_node)),
    'district',(SELECT name_i18n FROM public.tn_districts WHERE slug=_w.district_slug),
    'is_online',(_w.is_online AND _w.last_seen_at > now() - public.presence_window()),
    'is_busy',EXISTS (SELECT 1 FROM public.consult_sessions s WHERE s.worker_id=_w.id AND s.status='active'),
    'joined_at',COALESCE(_w.decided_at,_w.created_at),'rating',_w.rating,'reviews',_w.total_reviews,
    'sessions_served',st.sessions_served,'users_served',st.users_served,'rates',public.rates_for(_w.primary_node),
    'council',COALESCE(_w.reg_data->>'council',_w.reg_data->>'bar_council'),
    'rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object('slug',m.slug,'icon',m.icon,'color',m.color,'title',m.title_i18n,'desc',m.desc_i18n,'cert_no',r.cert_no,'awarded_at',r.awarded_at) ORDER BY r.awarded_at DESC)
      FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug=r.milestone WHERE r.worker_id=_w.id),'[]'),
    'feedback',COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT f.rating, f.tags, f.comment, f.created_at, COALESCE(NULLIF(split_part(p.full_name,' ',1),''),'User') AS by_name
      FROM public.consult_feedback f LEFT JOIN public.profiles p ON p.user_id=f.user_id
      WHERE f.worker_id=_w.id AND NOT f.is_complaint ORDER BY f.created_at DESC LIMIT 10) x),'[]'));
END $$;

-- own moderation/reward view for the worker
CREATE OR REPLACE FUNCTION public.my_worker_standing() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers; _negs int;
BEGIN
  SELECT * INTO _w FROM public.workers WHERE user_id=auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO _negs FROM public.consult_feedback f WHERE f.worker_id=_w.id AND f.is_negative
    AND f.created_at > GREATEST(_w.strikes_reset_at, now() - make_interval(days => public.setting_num('block_window_days',30)::int));
  RETURN jsonb_build_object('worker_id',_w.id,'flag_active',_w.flag_active,'flag_good_needed',_w.flag_good_needed,'flag_reason',_w.flag_reason,
    'blocked',public.worker_is_blocked(_w),'blocked_until',_w.blocked_until,'block_reason',_w.block_reason,
    'negatives',_negs,'block_negatives',public.setting_num('block_negatives',3),
    'rewards',COALESCE((SELECT jsonb_agg(jsonb_build_object('slug',m.slug,'icon',m.icon,'color',m.color,'title',m.title_i18n,'desc',m.desc_i18n,'cert_no',r.cert_no,'awarded_at',r.awarded_at) ORDER BY r.awarded_at DESC)
      FROM public.worker_rewards r JOIN public.reward_milestones m ON m.slug=r.milestone WHERE r.worker_id=_w.id),'[]'));
END $$;

-- ---------- admin moderation ----------
CREATE OR REPLACE FUNCTION public.admin_moderation() RETURNS TABLE(id uuid, display_name text, photo_url text, primary_node text, node_name jsonb,
  flag_active boolean, flag_good_needed int, flag_reason text, blocked_until timestamptz, block_reason text, blocked boolean, negatives int, rating numeric, reviews int, recent jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT w.id, w.display_name, w.photo_url, w.primary_node, t.name_i18n, w.flag_active, w.flag_good_needed, w.flag_reason, w.blocked_until, w.block_reason,
    public.worker_is_blocked(w),
    (SELECT count(*)::int FROM public.consult_feedback f WHERE f.worker_id=w.id AND f.is_negative AND f.created_at > now() - make_interval(days => public.setting_num('block_window_days',30)::int)),
    w.rating, w.total_reviews,
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT f.rating, f.is_complaint, f.complaint_reason, f.tags, f.comment, f.created_at FROM public.consult_feedback f
      WHERE f.worker_id=w.id AND f.is_negative ORDER BY f.created_at DESC LIMIT 5) x),'[]')
  FROM public.workers w LEFT JOIN public.taxonomy_nodes t ON t.slug=w.primary_node
  WHERE w.flag_active OR w.blocked_until IS NOT NULL
  ORDER BY public.worker_is_blocked(w) DESC, w.blocked_until DESC NULLS LAST, w.flagged_at DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.admin_moderate(_worker uuid, _action text, _note text, _days int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workers;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'note required'; END IF;
  SELECT * INTO _w FROM public.workers WHERE id=_worker FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'worker not found'; END IF;
  PERFORM set_config('meiyiyal.trusted','on',true);
  IF _action = 'unblock' THEN
    UPDATE public.workers SET blocked_until=NULL, block_reason=NULL, strikes_reset_at=now() WHERE id=_worker;
  ELSIF _action = 'extend' THEN
    IF _days IS NULL OR _days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'days must be 1-365'; END IF;
    UPDATE public.workers SET blocked_until = GREATEST(COALESCE(blocked_until, now()), now()) + make_interval(days => _days),
      block_reason = COALESCE(block_reason, 'admin'), is_online=false WHERE id=_worker;
  ELSIF _action = 'clear_flag' THEN
    UPDATE public.workers SET flag_active=false, flag_good_needed=0, flag_reason=NULL, flagged_at=NULL WHERE id=_worker;
  ELSE RAISE EXCEPTION 'bad action'; END IF;
  PERFORM set_config('meiyiyal.trusted','off',true);
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'worker.'||_action,_worker,_note, jsonb_build_object('days',_days));
  SELECT * INTO _w FROM public.workers WHERE id=_worker;
  RETURN jsonb_build_object('blocked_until',_w.blocked_until,'flag_active',_w.flag_active);
END $$;

CREATE OR REPLACE FUNCTION public.admin_audit_log(_limit int DEFAULT 50) RETURNS TABLE(id bigint, actor_name text, action text, target uuid, target_name text, note text, data jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT a.id, COALESCE(p.full_name, p.email, 'system'), a.action, a.target, w.display_name, a.note, a.data, a.created_at
  FROM public.admin_audit a LEFT JOIN public.profiles p ON p.user_id=a.actor LEFT JOIN public.workers w ON w.id=a.target
  ORDER BY a.created_at DESC LIMIT LEAST(GREATEST(_limit,1),200);
END $$;

-- ---------- admin rate editing (audited) ----------
CREATE OR REPLACE FUNCTION public.admin_rate_cards() RETURNS TABLE(node_slug text, node_name jsonb, depth int, mode text, credits_per_min numeric, min_minutes int, band_min numeric, band_max numeric, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT r.node_slug, t.name_i18n, (array_length(string_to_array(r.node_slug,'--'),1))::int, r.mode, r.credits_per_min, r.min_minutes, r.band_min, r.band_max, r.updated_at
  FROM public.rate_cards r JOIN public.taxonomy_nodes t ON t.slug=r.node_slug ORDER BY r.node_slug, array_position(ARRAY['chat','voice','video'], r.mode);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_rate(_node text, _mode text, _rate numeric, _min int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('chat','voice','video') THEN RAISE EXCEPTION 'bad mode'; END IF;
  IF _rate IS NULL OR _rate <= 0 OR _rate > 1000 THEN RAISE EXCEPTION 'rate must be between 0 and 1000'; END IF;
  IF _min IS NULL OR _min NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'minimum minutes must be 1-60'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug=_node) THEN RAISE EXCEPTION 'unknown profession'; END IF;
  SELECT credits_per_min, min_minutes INTO _old FROM public.rate_cards WHERE node_slug=_node AND mode=_mode;
  INSERT INTO public.rate_cards(node_slug,mode,credits_per_min,min_minutes,band_min,band_max) VALUES (_node,_mode,_rate,_min,NULL,NULL)
  ON CONFLICT (node_slug,mode) DO UPDATE SET credits_per_min=EXCLUDED.credits_per_min, min_minutes=EXCLUDED.min_minutes,
    band_min = CASE WHEN rate_cards.band_min <= EXCLUDED.credits_per_min THEN rate_cards.band_min END,
    band_max = CASE WHEN rate_cards.band_max >= EXCLUDED.credits_per_min THEN rate_cards.band_max END, updated_at=now();
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'rate.set',NULL,_node||' '||_mode,
    jsonb_build_object('node',_node,'mode',_mode,'old_rate',_old.credits_per_min,'old_min',_old.min_minutes,'rate',_rate,'min',_min));
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_rate(_node text, _mode text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE='42501'; END IF;
  IF (SELECT parent_slug FROM public.taxonomy_nodes WHERE slug=_node) IS NULL OR array_length(string_to_array(_node,'--'),1) < 2 THEN RAISE EXCEPTION 'cannot remove a top-level default'; END IF;
  DELETE FROM public.rate_cards WHERE node_slug=_node AND mode=_mode;
  INSERT INTO public.admin_audit(actor,action,target,note,data) VALUES (auth.uid(),'rate.delete',NULL,_node||' '||_mode, jsonb_build_object('node',_node,'mode',_mode));
END $$;

-- grants
REVOKE ALL ON FUNCTION public.feedback_submit(uuid,int,text[],text,boolean,text), public.my_feedback(uuid), public.my_worker_standing(),
  public.admin_moderation(), public.admin_moderate(uuid,text,text,int), public.admin_audit_log(int), public.admin_rate_cards(), public.admin_set_rate(text,text,numeric,int),
  public.admin_delete_rate(text,text), public.feedback_config(), public.worker_public(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.feedback_submit(uuid,int,text[],text,boolean,text), public.my_feedback(uuid), public.my_worker_standing(),
  public.admin_moderation(), public.admin_moderate(uuid,text,text,int), public.admin_audit_log(int), public.admin_rate_cards(), public.admin_set_rate(text,text,numeric,int),
  public.admin_delete_rate(text,text), public.feedback_config(), public.worker_public(uuid) TO authenticated;
