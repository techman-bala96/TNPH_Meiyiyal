-- M11 · admin editors. Every write is admin-only, validated and written to admin_audit with old → new.
-- Secrets (peppers, hook secrets, service keys, stub OTP) have no spec row, so they are never listed or editable here.

-- ---------- settings registry ----------
CREATE TABLE IF NOT EXISTS public.setting_specs (
  key text PRIMARY KEY REFERENCES public.app_settings(key) ON DELETE CASCADE,
  grp text NOT NULL CHECK (grp IN ('consult','moderation','money','verification','notifications','referrals','security','dev')),
  kind text NOT NULL CHECK (kind IN ('number','bool','text','enum','json')),
  min numeric, max numeric, options text[],
  label_i18n jsonb NOT NULL,
  sort int NOT NULL DEFAULT 0,
  prod_hint text
);
ALTER TABLE public.setting_specs ENABLE ROW LEVEL SECURITY;  -- no policies: read through admin_settings()

INSERT INTO public.setting_specs(key, grp, kind, min, max, options, sort, label_i18n, prod_hint) VALUES
 ('ring_seconds','consult','number',10,120,NULL,10,'{"en":"Ring time for a direct request (seconds)","ta":"நேரடி கோரிக்கை ஒலிக்கும் நேரம் (விநாடி)"}',NULL),
 ('auto_ring_seconds','consult','number',10,120,NULL,11,'{"en":"Ring time per professional in auto-request (seconds)","ta":"தானியங்கி கோரிக்கையில் ஒவ்வொருவருக்கும் ஒலிக்கும் நேரம் (விநாடி)"}',NULL),
 ('auto_request_max','consult','number',1,10,NULL,12,'{"en":"Professionals tried per auto-request","ta":"ஒரு தானியங்கி கோரிக்கையில் முயலும் நிபுணர்கள்"}',NULL),
 ('ask_again_wait_seconds','consult','number',0,600,NULL,13,'{"en":"Wait before asking the same professional again (seconds)","ta":"அதே நிபுணரை மீண்டும் கேட்கக் காத்திருப்பு (விநாடி)"}',NULL),
 ('missed_rings_offline','consult','number',1,10,NULL,14,'{"en":"Missed rings before a professional is set offline","ta":"நிபுணர் ஆஃப்லைன் ஆக தவறிய அழைப்புகள்"}',NULL),
 ('presence_seconds','consult','number',30,600,NULL,15,'{"en":"Online heartbeat timeout (seconds)","ta":"ஆன்லைன் இருப்பு காலாவதி (விநாடி)"}',NULL),
 ('search_radius_km','consult','number',1,500,NULL,16,'{"en":"Default search radius (km)","ta":"இயல்புநிலை தேடல் வட்டம் (கி.மீ)"}',NULL),
 ('session_drop_seconds','consult','number',5,300,NULL,17,'{"en":"Connection drop grace (seconds)","ta":"இணைப்பு துண்டிப்பு அவகாசம் (விநாடி)"}',NULL),
 ('session_resume_minutes','consult','number',1,30,NULL,18,'{"en":"Resume window after a drop (minutes)","ta":"துண்டிப்புக்குப் பின் தொடர அவகாசம் (நிமிடம்)"}',NULL),
 ('reconnect_window_minutes','consult','number',1,60,NULL,19,'{"en":"Reconnect window (minutes)","ta":"மீண்டும் இணைக்கும் அவகாசம் (நிமிடம்)"}',NULL),
 ('low_balance_resume_minutes','consult','number',1,30,NULL,20,'{"en":"Top-up window when credits run out (minutes)","ta":"கிரெடிட் தீர்ந்தால் சேர்க்கும் அவகாசம் (நிமிடம்)"}',NULL),
 ('early_end_refund_minutes','consult','number',0,10,NULL,21,'{"en":"Refund if the professional ends within (minutes)","ta":"நிபுணர் இதற்குள் முடித்தால் திருப்பித் தருதல் (நிமிடம்)"}',NULL),
 ('worker_message_credits','consult','number',0,100,NULL,22,'{"en":"Credits for a message to an offline professional","ta":"ஆஃப்லைன் நிபுணருக்கு செய்தி அனுப்ப கிரெடிட்"}',NULL),
 ('worker_message_daily_max','consult','number',0,20,NULL,23,'{"en":"Offline messages per user per day","ta":"ஒரு நாளில் ஆஃப்லைன் செய்திகள்"}',NULL),
 ('worker_message_refund_hours','consult','number',1,168,NULL,24,'{"en":"Refund unanswered messages after (hours)","ta":"பதில் இல்லாத செய்திக்கு திருப்பித் தருதல் (மணி)"}',NULL),
 ('worker_message_reserve_minutes','consult','number',1,60,NULL,25,'{"en":"Minutes reserved when a message is answered","ta":"செய்திக்குப் பதில் வந்ததும் ஒதுக்கும் நிமிடங்கள்"}',NULL),
 ('block_negatives','moderation','number',1,20,NULL,30,'{"en":"Negative reviews that trigger a block","ta":"தடையைத் தூண்டும் எதிர்மறை மதிப்புரைகள்"}',NULL),
 ('block_window_days','moderation','number',1,365,NULL,31,'{"en":"…counted within (days)","ta":"…இந்த நாட்களுக்குள் (நாள்)"}',NULL),
 ('block_days','moderation','number',1,365,NULL,32,'{"en":"Automatic block length (days)","ta":"தானியங்கித் தடை காலம் (நாள்)"}',NULL),
 ('flag_clear_good_sessions','moderation','number',1,20,NULL,33,'{"en":"Good sessions that clear a flag","ta":"கொடியை நீக்கும் நல்ல அமர்வுகள்"}',NULL),
 ('good_rating_min','moderation','number',1,5,NULL,34,'{"en":"Lowest rating counted as good","ta":"நல்லதாகக் கருதப்படும் குறைந்த மதிப்பீடு"}',NULL),
 ('negative_rating_max','moderation','number',1,5,NULL,35,'{"en":"Highest rating counted as negative","ta":"எதிர்மறையாகக் கருதப்படும் அதிக மதிப்பீடு"}',NULL),
 ('feedback_tags','moderation','json',NULL,NULL,NULL,36,'{"en":"Feedback tags (en/ta)","ta":"கருத்துக் குறிச்சொற்கள் (en/ta)"}',NULL),
 ('gst_pct','money','number',0,28,NULL,40,'{"en":"GST on credit packs (%)","ta":"கிரெடிட் தொகுப்புகளுக்கு GST (%)"}',NULL),
 ('commission_pct','money','number',15,20,NULL,41,'{"en":"Platform commission (%)","ta":"தள கமிஷன் (%)"}',NULL),
 ('commission_new_pct','money','number',15,20,NULL,42,'{"en":"Commission for new professionals (%)","ta":"புதிய நிபுணர்களுக்கு கமிஷன் (%)"}',NULL),
 ('commission_new_days','money','number',0,365,NULL,43,'{"en":"New-professional period (days)","ta":"புதிய நிபுணர் காலம் (நாள்)"}',NULL),
 ('commission_new_sessions','money','number',0,1000,NULL,44,'{"en":"…or until this many sessions","ta":"…அல்லது இத்தனை அமர்வுகள் வரை"}',NULL),
 ('payout_min','money','number',1,100000,NULL,45,'{"en":"Minimum payout (₹)","ta":"குறைந்தபட்ச பணம் அனுப்புதல் (₹)"}',NULL),
 ('payout_hold_hours','money','number',0,720,NULL,46,'{"en":"Earnings hold before payout (hours)","ta":"பணம் அனுப்பும் முன் வருவாய் நிறுத்தம் (மணி)"}',NULL),
 ('payout_cooling_days','money','number',0,30,NULL,47,'{"en":"Cooling period after a new payout account (days)","ta":"புதிய கணக்குக்குப் பின் காத்திருப்பு (நாள்)"}',NULL),
 ('payout_review_amount','money','number',0,10000000,NULL,48,'{"en":"Payouts above this need admin approval (₹)","ta":"இதற்கு மேல் நிர்வாகி ஒப்புதல் தேவை (₹)"}',NULL),
 ('payout_max_attempts','money','number',1,10,NULL,49,'{"en":"Payout retry attempts","ta":"பணம் அனுப்ப மீண்டும் முயற்சிகள்"}',NULL),
 ('payouts_auto','money','bool',NULL,NULL,NULL,50,'{"en":"Weekly automatic payouts (Mon 10:00 IST)","ta":"வாராந்திர தானியங்கி பணம் (திங்கள் 10:00 IST)"}',NULL),
 ('payouts_mock','money','bool',NULL,NULL,NULL,51,'{"en":"Payouts in mock mode (no real money)","ta":"போலி முறையில் பணம் அனுப்புதல் (உண்மையான பணம் இல்லை)"}','false after RazorpayX keys are set'),
 ('payments_mock','money','bool',NULL,NULL,NULL,52,'{"en":"Payments in mock mode","ta":"போலி முறையில் பணம் செலுத்துதல்"}','false after Razorpay keys are set'),
 ('tds_enabled','money','bool',NULL,NULL,NULL,53,'{"en":"Deduct TDS on payouts","ta":"பணம் அனுப்புதலில் TDS பிடித்தம்"}',NULL),
 ('bonus_expiry_days','money','number',0,3650,NULL,54,'{"en":"Bonus credits expire after (days, 0 = never)","ta":"போனஸ் கிரெடிட் காலாவதி (நாள், 0 = இல்லை)"}',NULL),
 ('bonus_expiry_warn_days','money','number',0,60,NULL,55,'{"en":"Warn before bonus expiry (days)","ta":"போனஸ் காலாவதிக்கு முன் எச்சரிக்கை (நாள்)"}',NULL),
 ('verify_auto_approve','verification','bool',NULL,NULL,NULL,60,'{"en":"Auto-approve clean cases (all categories)","ta":"சிக்கலற்றவற்றை தானாக ஒப்புதல் (எல்லா பிரிவுகளும்)"}','false'),
 ('verify_auto_approve_categories','verification','json',NULL,NULL,NULL,61,'{"en":"Per-category auto-approve switch","ta":"பிரிவு வாரியான தானியங்கி ஒப்புதல்"}',NULL),
 ('verify_risk_approve','verification','number',0,100,NULL,62,'{"en":"Auto-approve only at or below this risk","ta":"இந்த அபாயத்துக்குள் மட்டும் தானியங்கி ஒப்புதல்"}',NULL),
 ('verify_risk_reject','verification','number',0,100,NULL,63,'{"en":"Reject above this risk","ta":"இந்த அபாயத்துக்கு மேல் நிராகரிப்பு"}',NULL),
 ('verify_name_pass','verification','number',0.5,1,NULL,64,'{"en":"Name match: pass at","ta":"பெயர் ஒப்பீடு: தேர்ச்சி"}',NULL),
 ('verify_name_review','verification','number',0.5,1,NULL,65,'{"en":"Name match: review at","ta":"பெயர் ஒப்பீடு: மறுஆய்வு"}',NULL),
 ('verify_registry_live','verification','bool',NULL,NULL,NULL,66,'{"en":"Look up council registers live","ta":"கவுன்சில் பதிவேட்டை நேரடியாகத் தேடு"}',NULL),
 ('verify_registry_days','verification','number',1,3650,NULL,67,'{"en":"Re-check council registration every (days)","ta":"கவுன்சில் பதிவை மறுசோதனை (நாள்)"}',NULL),
 ('verify_selfie_days','verification','number',30,3650,NULL,68,'{"en":"Ask for a fresh selfie every (days)","ta":"புதிய செல்ஃபி கேட்கும் இடைவெளி (நாள்)"}',NULL),
 ('verify_retain_days','verification','number',1,30,NULL,69,'{"en":"Delete raw selfies/frames after (days, max 30)","ta":"மூல செல்ஃபிகளை நீக்குதல் (நாள், அதிகபட்சம் 30)"}',NULL),
 ('verify_liveness_window_seconds','verification','number',60,900,NULL,70,'{"en":"Liveness challenge time limit (seconds)","ta":"உயிர்ப்புச் சோதனை நேர வரம்பு (விநாடி)"}',NULL),
 ('verify_job_max_attempts','verification','number',1,20,NULL,71,'{"en":"Verification job retries","ta":"சரிபார்ப்பு மீண்டும் முயற்சிகள்"}',NULL),
 ('kyc_provider','verification','enum',NULL,NULL,ARRAY['stub','edge'],72,'{"en":"Aadhaar OTP provider (stub = local test)","ta":"ஆதார் OTP வழங்குநர் (stub = சோதனை)"}','edge'),
 ('kyc_edge_sends_per_hour','verification','number',1,20,NULL,73,'{"en":"Aadhaar OTP sends per hour","ta":"மணிக்கு ஆதார் OTP அனுப்புதல்"}',NULL),
 ('verify_service_url','verification','text',NULL,NULL,NULL,74,'{"en":"Verify service URL","ta":"சரிபார்ப்புச் சேவை URL"}','https URL of the verify service'),
 ('verify_registry_adapters','verification','json',NULL,NULL,NULL,75,'{"en":"Council register adapters","ta":"கவுன்சில் பதிவேடு இணைப்பிகள்"}',NULL),
 ('push_enabled','notifications','bool',NULL,NULL,NULL,80,'{"en":"Push notifications on","ta":"புஷ் அறிவிப்புகள் இயக்கம்"}',NULL),
 ('push_mock','notifications','bool',NULL,NULL,NULL,81,'{"en":"Push in mock mode","ta":"போலி முறை புஷ்"}','false after VAPID keys are set'),
 ('push_quiet_default','notifications','json',NULL,NULL,NULL,82,'{"en":"Default quiet hours (IST)","ta":"இயல்புநிலை அமைதி நேரம் (IST)"}',NULL),
 ('push_reach_minutes','notifications','number',1,1440,NULL,83,'{"en":"Drop undelivered pushes after (minutes)","ta":"வழங்கப்படாத புஷ்களை கைவிடுதல் (நிமிடம்)"}',NULL),
 ('push_chat_collapse_seconds','notifications','number',0,3600,NULL,84,'{"en":"Group chat pushes within (seconds)","ta":"அரட்டை புஷ்களை இணைத்தல் (விநாடி)"}',NULL),
 ('push_admin_collapse_seconds','notifications','number',0,86400,NULL,85,'{"en":"Group admin pushes within (seconds)","ta":"நிர்வாகி புஷ்களை இணைத்தல் (விநாடி)"}',NULL),
 ('push_feedback_reminder_minutes','notifications','number',0,1440,NULL,86,'{"en":"Feedback reminder after (minutes)","ta":"கருத்து நினைவூட்டல் (நிமிடம்)"}',NULL),
 ('push_send_url','notifications','text',NULL,NULL,NULL,87,'{"en":"push-send function URL","ta":"push-send செயல்பாட்டு URL"}','https://<project>.supabase.co/functions/v1/push-send'),
 ('payout_run_url','money','text',NULL,NULL,NULL,56,'{"en":"payout-run function URL","ta":"payout-run செயல்பாட்டு URL"}','https://<project>.supabase.co/functions/v1/payout-run'),
 ('dev_test_credits','dev','bool',NULL,NULL,NULL,95,'{"en":"Local test credits button","ta":"சோதனை கிரெடிட் பொத்தான்"}','false')
ON CONFLICT (key) DO UPDATE SET grp = EXCLUDED.grp, kind = EXCLUDED.kind, min = EXCLUDED.min, max = EXCLUDED.max, options = EXCLUDED.options,
  sort = EXCLUDED.sort, label_i18n = EXCLUDED.label_i18n, prod_hint = EXCLUDED.prod_hint;

CREATE OR REPLACE FUNCTION public.admin_guard() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF; END $$;
REVOKE ALL ON FUNCTION public.admin_guard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_guard() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_settings() RETURNS TABLE(key text, grp text, kind text, min numeric, max numeric, options text[], label_i18n jsonb, prod_hint text, value jsonb, sort int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY SELECT s.key, s.grp, s.kind, s.min, s.max, s.options, s.label_i18n, s.prod_hint, a.value, s.sort
    FROM public.setting_specs s JOIN public.app_settings a ON a.key = s.key ORDER BY s.sort, s.key;
END $$;
REVOKE ALL ON FUNCTION public.admin_settings() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_setting(_key text, _value jsonb, _note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; _old jsonb; _n numeric; _t text;
BEGIN
  PERFORM public.admin_guard();
  SELECT * INTO s FROM public.setting_specs WHERE key = _key;
  IF NOT FOUND THEN RAISE EXCEPTION 'setting not editable'; END IF;
  IF _value IS NULL OR _value = 'null'::jsonb THEN RAISE EXCEPTION 'value required'; END IF;
  CASE s.kind
    WHEN 'number' THEN
      IF jsonb_typeof(_value) = 'string' THEN BEGIN _value := to_jsonb((_value#>>'{}')::numeric); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'number required'; END; END IF;
      IF jsonb_typeof(_value) <> 'number' THEN RAISE EXCEPTION 'number required'; END IF;
      _n := (_value#>>'{}')::numeric;
      IF (s.min IS NOT NULL AND _n < s.min) OR (s.max IS NOT NULL AND _n > s.max) THEN RAISE EXCEPTION 'must be between % and %', s.min, s.max; END IF;
    WHEN 'bool' THEN IF jsonb_typeof(_value) <> 'boolean' THEN RAISE EXCEPTION 'true/false required'; END IF;
    WHEN 'enum' THEN IF jsonb_typeof(_value) <> 'string' OR NOT (_value#>>'{}') = ANY (s.options) THEN RAISE EXCEPTION 'must be one of %', array_to_string(s.options, ', '); END IF;
    WHEN 'text' THEN
      IF jsonb_typeof(_value) <> 'string' THEN RAISE EXCEPTION 'text required'; END IF;
      _t := _value#>>'{}';
      IF length(_t) > 500 THEN RAISE EXCEPTION 'too long'; END IF;
      IF _key LIKE '%\_url' AND _t <> '' AND _t !~ '^https?://[^\s]+$' THEN RAISE EXCEPTION 'must be an http(s) URL'; END IF;
    WHEN 'json' THEN IF jsonb_typeof(_value) NOT IN ('object','array') THEN RAISE EXCEPTION 'JSON object or array required'; END IF;
  END CASE;
  -- cross-field rules
  IF _key = 'verify_auto_approve_categories' THEN
    IF EXISTS (SELECT 1 FROM jsonb_each(_value) e WHERE jsonb_typeof(e.value) <> 'boolean' OR NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes t WHERE t.slug = e.key AND t.kind = 'category')) THEN
      RAISE EXCEPTION 'map of category → true/false required'; END IF;
  END IF;
  IF _key = 'verify_risk_approve' AND _n >= public.setting_num('verify_risk_reject', 60) THEN RAISE EXCEPTION 'approve risk must be below reject risk'; END IF;
  IF _key = 'verify_risk_reject' AND _n <= public.setting_num('verify_risk_approve', 20) THEN RAISE EXCEPTION 'reject risk must be above approve risk'; END IF;
  IF _key = 'verify_name_review' AND _n > public.setting_num('verify_name_pass', 0.92) THEN RAISE EXCEPTION 'review score must not exceed pass score'; END IF;
  IF _key = 'verify_name_pass' AND _n < public.setting_num('verify_name_review', 0.8) THEN RAISE EXCEPTION 'pass score must not be below review score'; END IF;
  IF _key = 'referral_rewards' AND COALESCE((_value->>'enabled')::boolean, false) THEN RAISE EXCEPTION 'referral rewards are not available in v1'; END IF;
  SELECT value INTO _old FROM public.app_settings WHERE key = _key;
  UPDATE public.app_settings SET value = _value WHERE key = _key;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'setting.set', NULL, _key || COALESCE(' · ' || NULLIF(_note, ''), ''),
    jsonb_build_object('key', _key, 'old', _old, 'new', _value));
  RETURN _value;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_setting(text, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, jsonb, text) TO authenticated;

-- Per-category switch: an explicit true/false for the category wins; otherwise the global switch decides.
-- Production: verify_auto_approve = false, then switch on single categories when ready.
CREATE OR REPLACE FUNCTION public.verify_auto_for(_cat text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public.setting('verify_auto_approve_categories')->>_cat)::boolean, public.setting('verify_auto_approve') = 'true'::jsonb) $$;
REVOKE ALL ON FUNCTION public.verify_auto_for(text) FROM public, anon, authenticated;
DO $$ DECLARE _def text; BEGIN
  _def := pg_get_functiondef('public.verification_decide(uuid)'::regprocedure);
  IF position('public.verify_auto_for(_cat)' IN _def) = 0 THEN
    _def := regexp_replace(_def, '_auto := public\.setting\(''verify_auto_approve''\) = ''true''::jsonb\s+AND COALESCE\(public\.setting\(''verify_auto_approve_categories''\)->>_cat, ''true''\) <> ''false'';',
      '_auto := public.verify_auto_for(_cat);');
    IF position('public.verify_auto_for(_cat)' IN _def) = 0 THEN RAISE EXCEPTION 'verification_decide: auto-approve expression not found'; END IF;
    EXECUTE _def;
  END IF;
END $$;

-- ---------- milestones ----------
CREATE OR REPLACE FUNCTION public.admin_milestones() RETURNS SETOF public.reward_milestones LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.admin_guard(); RETURN QUERY SELECT * FROM public.reward_milestones ORDER BY sort, slug; END $$;
CREATE OR REPLACE FUNCTION public.admin_upsert_milestone(_slug text, _kind text, _threshold numeric, _min_reviews int, _title jsonb, _desc jsonb,
  _icon text DEFAULT 'award', _color text DEFAULT 'amber', _sort int DEFAULT 0, _active boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old jsonb;
BEGIN
  PERFORM public.admin_guard();
  IF _slug !~ '^[a-z0-9_]{3,40}$' THEN RAISE EXCEPTION 'slug: 3-40 lowercase letters, digits, _'; END IF;
  IF _kind NOT IN ('sessions_served','rating_avg','positive_streak','five_stars') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _threshold IS NULL OR _threshold <= 0 OR (_kind = 'rating_avg' AND _threshold > 5) THEN RAISE EXCEPTION 'bad threshold'; END IF;
  IF COALESCE(_min_reviews, -1) NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'bad minimum reviews'; END IF;
  IF COALESCE(btrim(_title->>'en'), '') = '' OR COALESCE(btrim(_title->>'ta'), '') = '' THEN RAISE EXCEPTION 'title needs English and Tamil'; END IF;
  IF COALESCE(btrim(_desc->>'en'), '') = '' OR COALESCE(btrim(_desc->>'ta'), '') = '' THEN RAISE EXCEPTION 'description needs English and Tamil'; END IF;
  IF _color NOT IN ('amber','emerald','sky','violet','rose','teal') THEN RAISE EXCEPTION 'bad colour'; END IF;
  IF _icon !~ '^[a-z-]{2,30}$' THEN RAISE EXCEPTION 'bad icon'; END IF;
  SELECT to_jsonb(m) INTO _old FROM public.reward_milestones m WHERE slug = _slug;
  INSERT INTO public.reward_milestones(slug, kind, threshold, min_reviews, title_i18n, desc_i18n, icon, color, sort, active)
  VALUES (_slug, _kind, _threshold, _min_reviews, _title, _desc, _icon, _color, _sort, _active)
  ON CONFLICT (slug) DO UPDATE SET kind = EXCLUDED.kind, threshold = EXCLUDED.threshold, min_reviews = EXCLUDED.min_reviews, title_i18n = EXCLUDED.title_i18n,
    desc_i18n = EXCLUDED.desc_i18n, icon = EXCLUDED.icon, color = EXCLUDED.color, sort = EXCLUDED.sort, active = EXCLUDED.active;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'milestone.upsert', NULL, _slug,
    jsonb_build_object('old', _old, 'kind', _kind, 'threshold', _threshold, 'active', _active));
END $$;

-- ---------- commission per category ----------
CREATE OR REPLACE FUNCTION public.admin_commission_rules() RETURNS TABLE(node_slug text, node_name jsonb, depth int, pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.admin_guard();
  RETURN QUERY SELECT c.node_slug, t.name_i18n, array_length(string_to_array(c.node_slug, '--'), 1), c.pct
    FROM public.commission_rules c JOIN public.taxonomy_nodes t ON t.slug = c.node_slug ORDER BY c.node_slug; END $$;
CREATE OR REPLACE FUNCTION public.admin_set_commission(_node text, _pct numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old numeric;
BEGIN
  PERFORM public.admin_guard();
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = _node AND slug LIKE 'professionals--%') THEN RAISE EXCEPTION 'unknown profession'; END IF;
  SELECT pct INTO _old FROM public.commission_rules WHERE node_slug = _node;
  IF _pct IS NULL THEN DELETE FROM public.commission_rules WHERE node_slug = _node;
  ELSE
    IF _pct NOT BETWEEN 15 AND 20 THEN RAISE EXCEPTION 'commission must be 15-20%%'; END IF;
    INSERT INTO public.commission_rules(node_slug, pct) VALUES (_node, _pct) ON CONFLICT (node_slug) DO UPDATE SET pct = EXCLUDED.pct;
  END IF;
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'commission.set', NULL, _node, jsonb_build_object('old', _old, 'new', _pct));
END $$;

-- ---------- taxonomy ----------
CREATE OR REPLACE FUNCTION public.admin_taxonomy() RETURNS TABLE(slug text, parent_slug text, kind text, name_i18n jsonb, synonyms text[], sort int, is_active boolean, workers int,
  doc_types text[], req_schema jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.admin_guard();
  RETURN QUERY SELECT t.slug, t.parent_slug, t.kind, t.name_i18n, t.synonyms, t.sort, t.is_active,
    (SELECT count(*)::int FROM public.workers w WHERE w.primary_node = t.slug), r.doc_types, r.schema
  FROM public.taxonomy_nodes t LEFT JOIN public.node_requirements r ON r.node_slug = t.slug
  WHERE t.slug LIKE 'professionals%' ORDER BY t.slug; END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_node(_parent text, _suffix text, _name jsonb, _synonyms text[] DEFAULT '{}', _sort int DEFAULT 0, _active boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _slug text; _pk text; _kind text; _old jsonb;
BEGIN
  PERFORM public.admin_guard();
  IF _suffix !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(_suffix) > 40 THEN RAISE EXCEPTION 'slug: lowercase words joined by -'; END IF;
  IF COALESCE(btrim(_name->>'en'), '') = '' OR COALESCE(btrim(_name->>'ta'), '') = '' THEN RAISE EXCEPTION 'name needs English and Tamil'; END IF;
  SELECT kind INTO _pk FROM public.taxonomy_nodes WHERE slug = _parent;
  IF _pk IS NULL OR _parent NOT LIKE 'professionals%' THEN RAISE EXCEPTION 'unknown parent'; END IF;
  _kind := CASE _pk WHEN 'group' THEN 'category' WHEN 'category' THEN 'subcategory' WHEN 'subcategory' THEN 'specialty' END;
  IF _kind IS NULL THEN RAISE EXCEPTION 'specialties cannot have children'; END IF;
  _slug := _parent || '--' || _suffix;
  SELECT to_jsonb(t) INTO _old FROM public.taxonomy_nodes t WHERE slug = _slug;
  IF _old IS NULL AND _kind = 'category' THEN RAISE EXCEPTION 'new professions need a verification review first (add sub-categories instead)'; END IF;
  INSERT INTO public.taxonomy_nodes(slug, parent_slug, kind, name_i18n, synonyms, sort, is_active, updated_at)
  VALUES (_slug, _parent, _kind, jsonb_build_object('en', btrim(_name->>'en'), 'ta', btrim(_name->>'ta')), COALESCE(_synonyms, '{}'), _sort, _active, now())
  ON CONFLICT (slug) DO UPDATE SET name_i18n = EXCLUDED.name_i18n, synonyms = EXCLUDED.synonyms, sort = EXCLUDED.sort, is_active = EXCLUDED.is_active, updated_at = now();
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), CASE WHEN _old IS NULL THEN 'taxonomy.add' ELSE 'taxonomy.update' END, NULL, _slug,
    jsonb_build_object('old', _old - 'id' - 'created_at' - 'updated_at', 'name', _name, 'active', _active));
  RETURN _slug;
END $$;

-- ---------- requirements ----------
-- Decisions kept: Aadhaar identity is always required, and a council registration that is required today (doctors incl.
-- physio and vets, lawyers, architects…) can never be relaxed from the admin screen; only a reviewed migration can.
CREATE OR REPLACE FUNCTION public.admin_set_requirements(_node text, _doc_types text[], _schema jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old jsonb;
BEGIN
  PERFORM public.admin_guard();
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = _node AND slug LIKE 'professionals--%') THEN RAISE EXCEPTION 'unknown profession'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(_doc_types, '{}')) d WHERE d !~ '^[a-z0-9_]{2,40}$') THEN RAISE EXCEPTION 'bad document type'; END IF;
  IF _schema IS NOT NULL AND jsonb_typeof(_schema) <> 'object' THEN RAISE EXCEPTION 'schema must be an object'; END IF;
  SELECT to_jsonb(r) INTO _old FROM public.node_requirements r WHERE node_slug = _node;
  IF _old IS NOT NULL AND (_old->'doc_types') ? 'council_cert' AND NOT ('council_cert' = ANY (COALESCE(_doc_types, '{}'))) THEN
    RAISE EXCEPTION 'council certificate stays required'; END IF;
  INSERT INTO public.node_requirements(node_slug, doc_types, schema) VALUES (_node, _doc_types, COALESCE(_schema, '{}'))
  ON CONFLICT (node_slug) DO UPDATE SET doc_types = EXCLUDED.doc_types, schema = COALESCE(_schema, node_requirements.schema);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'requirements.set', NULL, _node, jsonb_build_object('old', _old, 'doc_types', _doc_types));
END $$;

CREATE OR REPLACE FUNCTION public.admin_verification_rules() RETURNS SETOF public.verification_rules LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.admin_guard(); RETURN QUERY SELECT * FROM public.verification_rules ORDER BY category_slug, check_name; END $$;
CREATE OR REPLACE FUNCTION public.admin_set_verification_rule(_cat text, _check text, _required boolean, _weight numeric, _params jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old jsonb;
BEGIN
  PERFORM public.admin_guard();
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = _cat AND slug LIKE 'professionals%') THEN RAISE EXCEPTION 'unknown category'; END IF;
  IF _check NOT IN ('identity','face','registry','degree','name','forensics','duplicates') THEN RAISE EXCEPTION 'bad check'; END IF;
  IF _weight IS NULL OR _weight NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'weight must be 0-100'; END IF;
  IF _params IS NOT NULL AND jsonb_typeof(_params) <> 'object' THEN RAISE EXCEPTION 'params must be an object'; END IF;
  SELECT to_jsonb(v) INTO _old FROM public.verification_rules v WHERE category_slug = _cat AND check_name = _check;
  IF NOT _required AND (_check = 'identity' OR (_check = 'registry' AND COALESCE((_old->>'required')::boolean, false))) THEN
    RAISE EXCEPTION 'Aadhaar and council registration stay mandatory'; END IF;
  INSERT INTO public.verification_rules(category_slug, check_name, required, weight, params) VALUES (_cat, _check, _required, _weight, COALESCE(_params, '{}'))
  ON CONFLICT (category_slug, check_name) DO UPDATE SET required = EXCLUDED.required, weight = EXCLUDED.weight, params = COALESCE(_params, verification_rules.params);
  INSERT INTO public.admin_audit(actor, action, target, note, data) VALUES (auth.uid(), 'verify_rule.set', NULL, _cat || ':' || _check,
    jsonb_build_object('old', _old, 'required', _required, 'weight', _weight));
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin_milestones()','admin_upsert_milestone(text,text,numeric,int,jsonb,jsonb,text,text,int,boolean)','admin_commission_rules()',
    'admin_set_commission(text,numeric)','admin_taxonomy()','admin_upsert_node(text,text,jsonb,text[],int,boolean)','admin_set_requirements(text,text[],jsonb)',
    'admin_verification_rules()','admin_set_verification_rule(text,text,boolean,numeric,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

-- Direct table writes stay closed: admins go through the audited RPCs above.
DROP POLICY IF EXISTS "admin write requirements" ON public.node_requirements;
DROP POLICY IF EXISTS "admin write verification rules" ON public.verification_rules;
