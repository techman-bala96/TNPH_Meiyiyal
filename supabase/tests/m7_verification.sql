-- M7 verification engine. Runs inside one transaction and rolls back.
BEGIN;
INSERT INTO auth.users(id, email, aud, role) VALUES
 ('00000000-0000-0000-0000-00000000a701','v701@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a702','v702@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a703','v703@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a704','v704@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a705','v705@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a706','v706@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a707','v707@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a708','v708@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a709','v709@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a710','v710@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a711','v711@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a7a1','vadmin1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a7a2','vadmin2@test.local','authenticated','authenticated');
INSERT INTO public.user_roles(user_id, role) VALUES
 ('00000000-0000-0000-0000-00000000a7a1','admin'),
 ('00000000-0000-0000-0000-00000000a7a2','admin');

-- Taxonomy, requirements, inherited rates. No login required.
DO $$ DECLARE req jsonb; chat numeric; spec numeric; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--doctor--veterinary' AND name_i18n->>'en' = 'Veterinary' AND name_i18n->>'ta' = 'கால்நடை மருத்துவம்') THEN
    RAISE EXCEPTION 'FAIL: veterinary node';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.taxonomy_nodes
    WHERE slug = 'professionals--doctor--veterinary' AND synonyms @> ARRAY['vet']::text[]
  ) THEN
    RAISE EXCEPTION 'FAIL: veterinary synonym';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--engineer--structural') THEN RAISE EXCEPTION 'FAIL: structural'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--engineer--chemical') THEN RAISE EXCEPTION 'FAIL: chemical'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--engineer--marine') THEN RAISE EXCEPTION 'FAIL: marine'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--lawyer--rera-housing') THEN RAISE EXCEPTION 'FAIL: rera'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug = 'professionals--doctor--allopathy--radiology') THEN RAISE EXCEPTION 'FAIL: radiology'; END IF;
  IF EXISTS (SELECT 1 FROM public.taxonomy_nodes WHERE slug LIKE '%anesthesiology%' OR slug LIKE '%emergency-medicine%' OR slug LIKE '%notary%' OR slug LIKE '%immigration%') THEN
    RAISE EXCEPTION 'FAIL: excluded practice was added';
  END IF;
  req := public.node_requirements_for('professionals--doctor--physiotherapy');
  IF req::text ILIKE '%Not yet registered%' THEN RAISE EXCEPTION 'FAIL: physio still has Not yet registered'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(req->'fields') f WHERE f->>'key' = 'reg_no' AND (f->>'required')::boolean) THEN
    RAISE EXCEPTION 'FAIL: physio reg_no required';
  END IF;
  req := public.node_requirements_for('professionals--doctor--veterinary--pet-small-animal');
  IF req::text NOT LIKE '%Tamil Nadu State Veterinary Council%' THEN RAISE EXCEPTION 'FAIL: veterinary council'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(req->'fields') f WHERE f->>'key' = 'reg_no' AND (f->>'required')::boolean) THEN
    RAISE EXCEPTION 'FAIL: veterinary reg_no';
  END IF;
  IF public.badge_tier_for('professionals--doctor--veterinary--livestock', '{"reg_no":"VET1"}'::jsonb) <> 'licence' THEN RAISE EXCEPTION 'FAIL: vet badge'; END IF;
  IF public.badge_tier_for('professionals--engineer--software-it', '{}'::jsonb) <> 'degree' THEN RAISE EXCEPTION 'FAIL: software badge'; END IF;
  IF public.badge_tier_for('professionals--engineer--electrical', '{}'::jsonb) <> 'degree' THEN RAISE EXCEPTION 'FAIL: electrical empty'; END IF;
  IF public.badge_tier_for('professionals--engineer--electrical', '{"licence_no":"EL1"}'::jsonb) <> 'licence' THEN RAISE EXCEPTION 'FAIL: electrical filled'; END IF;
  IF public.badge_tier_for('professionals--doctor--nutrition-diet', '{"reg_no":"IDA1"}'::jsonb) <> 'degree' THEN RAISE EXCEPTION 'FAIL: nutrition stays degree'; END IF;
  IF public.badge_tier_for('professionals--doctor--psychology-counselling--clinical-psychologist', '{"reg_no":"CRR1"}'::jsonb) <> 'licence' THEN RAISE EXCEPTION 'FAIL: clinical psych licence'; END IF;
  chat := (public.rates_for('professionals--doctor--veterinary--poultry')->'chat'->>'rate')::numeric;
  IF chat IS DISTINCT FROM (public.rates_for('professionals--doctor')->'chat'->>'rate')::numeric THEN RAISE EXCEPTION 'FAIL: vet rates %', chat; END IF;
  spec := (public.rates_for('professionals--doctor--allopathy--radiology')->'chat'->>'rate')::numeric;
  IF spec <> 10 THEN RAISE EXCEPTION 'FAIL: radiology rate %', spec; END IF;
  RAISE NOTICE 'PASS: taxonomy, veterinary, physio council, badges, rates';
END $$;

-- Doctor, every check a real pass, auto-approve on → licence badge.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a701","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Test One', 8, 'about',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC90001","reg_year":"2015"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000001');
  IF NOT (public.aadhaar_verify_otp('123456')->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: otp'; END IF;
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a701/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a701/c.pdf');
  IF public.worker_submit() <> 'pending' THEN RAISE EXCEPTION 'FAIL: submit without QR must stay pending'; END IF;
  RAISE NOTICE 'PASS: submit without QR is pending';
END $$;

RESET ROLE;
DO $$ DECLARE wid uuid; cid uuid; decision text; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a701';
  SELECT id INTO cid FROM public.verification_cases WHERE worker_id = wid;
  IF cid IS NULL THEN RAISE EXCEPTION 'FAIL: no case'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.verification_jobs WHERE case_id = cid AND status = 'queued') THEN RAISE EXCEPTION 'FAIL: no job'; END IF;
  PERFORM public.verification_write_check(cid, 'identity', 'qr', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'face', 'selfie', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'registry', 'tnmc', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'degree', 'file', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'name', 'name', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'forensics', 'file', 'pass', 1, '{}');
  PERFORM public.verification_write_check(cid, 'duplicates', 'fp', 'pass', 1, '{}');
  decision := public.verification_decide(cid);
  IF decision <> 'auto_approve' THEN RAISE EXCEPTION 'FAIL: decision %', decision; END IF;
  IF (SELECT status FROM public.workers WHERE id = wid) <> 'approved' THEN RAISE EXCEPTION 'FAIL: not approved'; END IF;
  IF (SELECT badge_tier FROM public.workers WHERE id = wid) <> 'licence' THEN RAISE EXCEPTION 'FAIL: badge'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit WHERE target = wid AND action = 'worker.auto_approve') THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
  RAISE NOTICE 'PASS: all-pass auto-approves with a licence badge';
END $$;

-- Worker cannot see evidence or write a check.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a701","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE n int; wid uuid; cid uuid; view jsonb; BEGIN
  SELECT count(*) INTO n FROM public.verification_checks;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: worker can read checks'; END IF;
  SELECT id INTO wid FROM public.workers WHERE user_id = auth.uid();
  UPDATE public.verification_cases SET status = 'approved' WHERE worker_id = wid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: worker updated a case'; END IF;
  BEGIN
    PERFORM public.verification_write_check('00000000-0000-0000-0000-0000000000aa', 'identity', 'x', 'pass', 1, '{}');
    RAISE EXCEPTION 'FAIL: worker wrote a check';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  view := public.my_verification();
  IF view::text ILIKE '%evidence%' THEN RAISE EXCEPTION 'FAIL: evidence leaked'; END IF;
  IF jsonb_array_length(view->'checks') < 1 THEN RAISE EXCEPTION 'FAIL: no check summary'; END IF;
  IF (view->>'badge_tier') <> 'licence' THEN RAISE EXCEPTION 'FAIL: my badge'; END IF;
  RAISE NOTICE 'PASS: worker sees status only';
END $$;

-- Registry review queues. Registry fail rejects. High risk rejects.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a702","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Review', 6, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC90002","reg_year":"2016"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000002');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a702/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a702/c.pdf');
  PERFORM public.worker_submit();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a703","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Suspended', 6, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC90003","reg_year":"2016"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000003');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a703/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a703/c.pdf');
  PERFORM public.worker_submit();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a704","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Risky', 6, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC90004","reg_year":"2016"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000004');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a704/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a704/c.pdf');
  PERFORM public.worker_submit();
END $$;

RESET ROLE;
DO $$ DECLARE cid uuid; decision text; risk numeric; BEGIN
  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a702';
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  PERFORM public.verification_write_check(cid, 'registry', 'tnmc', 'review', NULL, '{"reason":"not_found"}');
  decision := public.verification_decide(cid);
  IF decision <> 'queue' THEN RAISE EXCEPTION 'FAIL: review should queue, got %', decision; END IF;
  IF (SELECT status FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a702') <> 'pending' THEN RAISE EXCEPTION 'FAIL: review rejected the worker'; END IF;

  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a703';
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  PERFORM public.verification_write_check(cid, 'registry', 'tnmc', 'fail', 0, '{"reason":"suspended"}');
  decision := public.verification_decide(cid);
  IF decision <> 'reject' THEN RAISE EXCEPTION 'FAIL: suspended should reject, got %', decision; END IF;

  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a704';
  PERFORM public.verification_write_check(cid, 'identity', 't', 'review', NULL, '{}');
  PERFORM public.verification_write_check(cid, 'face', 't', 'fail', 0, '{}');
  PERFORM public.verification_write_check(cid, 'registry', 't', 'review', NULL, '{}');
  PERFORM public.verification_write_check(cid, 'degree', 't', 'fail', 0, '{}');
  PERFORM public.verification_write_check(cid, 'name', 't', 'fail', 0, '{}');
  PERFORM public.verification_write_check(cid, 'forensics', 't', 'fail', 0, '{}');
  PERFORM public.verification_write_check(cid, 'duplicates', 't', 'pass', 1, '{}');
  decision := public.verification_decide(cid);
  SELECT c.risk INTO risk FROM public.verification_cases c WHERE c.id = cid;
  IF decision <> 'reject' OR risk <= 60 THEN RAISE EXCEPTION 'FAIL: risk % %', decision, risk; END IF;
  RAISE NOTICE 'PASS: review queues, suspended and high risk reject';
END $$;

-- Global auto-approve off, and a lawyer category override, both queue a clean file.
UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'verify_auto_approve';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a705","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Held', 4, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC90005","reg_year":"2018"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000005');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a705/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a705/c.pdf');
  PERFORM public.worker_submit();
END $$;
RESET ROLE;
DO $$ DECLARE cid uuid; decision text; BEGIN
  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a705';
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('registry'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  decision := public.verification_decide(cid);
  IF decision <> 'queue' THEN RAISE EXCEPTION 'FAIL: auto off should queue, got %', decision; END IF;
  RAISE NOTICE 'PASS: verify_auto_approve false queues a clean file';
END $$;
UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'verify_auto_approve';
UPDATE public.app_settings SET value = '{"professionals--lawyer": false}'::jsonb WHERE key = 'verify_auto_approve_categories';

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a706","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--lawyer--property-land', NULL, 'Adv Held', 9, '',
    '{"degree":"LLB (3-year)","bar_council":"Bar Council of Tamil Nadu & Puducherry","enrolment_no":"MS/9006/2015","enrolment_date":"2015-06-10"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000006');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a706/d.pdf'),
    (wid, 'enrolment_cert', '00000000-0000-0000-0000-00000000a706/e.pdf');
  PERFORM public.worker_submit();
END $$;
RESET ROLE;
DO $$ DECLARE cid uuid; decision text; BEGIN
  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a706';
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('registry'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  decision := public.verification_decide(cid);
  IF decision <> 'queue' THEN RAISE EXCEPTION 'FAIL: lawyer override should queue, got %', decision; END IF;
  RAISE NOTICE 'PASS: lawyer category override queues';
END $$;
UPDATE public.app_settings SET value = '{}'::jsonb WHERE key = 'verify_auto_approve_categories';

-- Degree-only civil engineer with no licence auto-approves on the degree badge.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a711","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--engineer--civil', NULL, 'Er Degree', 7, '',
    '{"degree":"BE","discipline":"Civil","institution":"Anna University"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000011');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a711/d.pdf'),
    (wid, 'experience_letter', '00000000-0000-0000-0000-00000000a711/x.pdf');
  PERFORM public.worker_submit();
END $$;
RESET ROLE;
DO $$ DECLARE cid uuid; decision text; tier text; BEGIN
  SELECT c.id INTO cid FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id WHERE w.user_id = '00000000-0000-0000-0000-00000000a711';
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  decision := public.verification_decide(cid);
  SELECT badge_tier INTO tier FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a711';
  IF decision <> 'auto_approve' OR tier <> 'degree' THEN RAISE EXCEPTION 'FAIL: civil degree % %', decision, tier; END IF;
  RAISE NOTICE 'PASS: civil engineer without a licence is a degree badge';
END $$;

-- Appeal: one only, a different admin, purge paused. A closed window cannot appeal.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a707","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--siddha', NULL, 'Dr Appeal', 5, '',
    '{"degree":"BSMS","council":"Tamil Nadu Siddha Medical Council","reg_no":"SID90007","reg_year":"2014"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000007');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a707/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a707/c.pdf');
  PERFORM public.worker_submit();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a7a1","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  SELECT q.id INTO wid FROM public.admin_worker_queue('pending') q WHERE q.display_name = 'Dr Appeal';
  IF public.admin_decide_worker(wid, 'reject', 'register mismatch') <> 'rejected' THEN RAISE EXCEPTION 'FAIL: reject'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a707","role":"authenticated"}', true);
DO $$ DECLARE cid uuid; BEGIN
  IF public.verification_appeal('the certificate is genuine') <> 'appealed' THEN RAISE EXCEPTION 'FAIL: appeal'; END IF;
  BEGIN
    PERFORM public.verification_appeal('again');
    RAISE EXCEPTION 'FAIL: second appeal allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: one appeal';
END $$;
RESET ROLE;
DO $$ DECLARE wid uuid; BEGIN
  SELECT id INTO wid FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a707';
  IF (SELECT purge_after FROM public.verification_cases WHERE worker_id = wid ORDER BY created_at DESC LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: appeal did not pause purge';
  END IF;
  IF (SELECT status FROM public.workers WHERE id = wid) <> 'pending' THEN RAISE EXCEPTION 'FAIL: appeal should reopen'; END IF;
  RAISE NOTICE 'PASS: appeal pauses the 30-day purge';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a7a1","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE cid uuid; BEGIN
  SELECT q.case_id INTO cid FROM public.admin_worker_queue('pending') q WHERE q.display_name = 'Dr Appeal';
  BEGIN
    PERFORM public.admin_decide_appeal(cid, 'overturn', 'same admin');
    RAISE EXCEPTION 'FAIL: same admin decided the appeal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%different admin%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: a different admin reviews the appeal';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a7a2","role":"authenticated"}', true);
DO $$ DECLARE cid uuid; BEGIN
  SELECT q.case_id INTO cid FROM public.admin_worker_queue('pending') q WHERE q.display_name = 'Dr Appeal';
  IF public.admin_decide_appeal(cid, 'overturn', 'council copy checks out') <> 'approved' THEN RAISE EXCEPTION 'FAIL: overturn'; END IF;
  RAISE NOTICE 'PASS: second admin can overturn';
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a710","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--siddha', NULL, 'Dr Late', 5, '',
    '{"degree":"BSMS","council":"Tamil Nadu Siddha Medical Council","reg_no":"SID90010","reg_year":"2014"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000010');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a710/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a710/c.pdf');
  PERFORM public.worker_submit();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a7a2","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  SELECT q.id INTO wid FROM public.admin_worker_queue('pending') q WHERE q.display_name = 'Dr Late';
  PERFORM public.admin_decide_worker(wid, 'reject', 'late');
END $$;
RESET ROLE;
SELECT set_config('meiyiyal.trusted','on', true);
UPDATE public.workers SET decided_at = now() - interval '31 days' WHERE user_id = '00000000-0000-0000-0000-00000000a710';
SELECT set_config('meiyiyal.trusted','off', true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a710","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.verification_appeal('too late');
    RAISE EXCEPTION 'FAIL: closed window allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%appeal window closed%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: appeal window is 30 days';
END $$;

-- Duplicate registration number.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a708","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr First', 8, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC-DUP-1","reg_year":"2011"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000008');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a708/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a708/c.pdf');
  PERFORM public.worker_submit();
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a709","role":"authenticated"}', true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--doctor--allopathy--paediatrics', NULL, 'Dr Second', 3, '',
    '{"degree":"MBBS + MD","council":"Tamil Nadu Medical Council (TNMC)","reg_no":"TNMC-DUP-1","reg_year":"2019"}'::jsonb);
  PERFORM public.aadhaar_send_otp('900000000009');
  PERFORM public.aadhaar_verify_otp('123456');
  INSERT INTO public.worker_documents(worker_id, doc_type, path) VALUES
    (wid, 'degree_cert', '00000000-0000-0000-0000-00000000a709/d.pdf'),
    (wid, 'council_cert', '00000000-0000-0000-0000-00000000a709/c.pdf');
  PERFORM public.worker_submit();
END $$;
RESET ROLE;
DO $$ DECLARE wa uuid; wb uuid; cid uuid; seen text; BEGIN
  SELECT id INTO wa FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a708';
  SELECT id INTO wb FROM public.workers WHERE user_id = '00000000-0000-0000-0000-00000000a709';
  SELECT id INTO cid FROM public.verification_cases WHERE worker_id = wa;
  PERFORM public.verification_write_check(cid, k, 't', 'pass', 1, '{}') FROM (VALUES ('identity'),('face'),('registry'),('degree'),('name'),('forensics'),('duplicates')) v(k);
  IF public.verification_decide(cid) <> 'auto_approve' THEN RAISE EXCEPTION 'FAIL: first dup approve'; END IF;
  IF public.verification_observe_fingerprint(wa, 'reg_no', 'tnmc-dup-1') <> 'ok' THEN RAISE EXCEPTION 'FAIL: first fingerprint'; END IF;
  seen := public.verification_observe_fingerprint(wb, 'reg_no', 'tnmc-dup-1');
  IF seen <> 'active' THEN RAISE EXCEPTION 'FAIL: duplicate saw %', seen; END IF;
  RAISE NOTICE 'PASS: duplicate registration number is detected';
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a7a1","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE wb uuid; BEGIN
  SELECT q.id INTO wb FROM public.admin_worker_queue('pending') q WHERE q.display_name = 'Dr Second';
  BEGIN
    PERFORM public.admin_decide_worker(wb, 'approve');
    RAISE EXCEPTION 'FAIL: duplicate reg approved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%registration number already used%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: admin cannot approve a reused registration number';
END $$;

-- The public workers SELECT that leaked reg_data is gone.
RESET ROLE;
SET LOCAL role anon;
DO $$ DECLARE n int; BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.workers;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: anon can read % worker rows', n; END IF;
    RAISE NOTICE 'PASS: anon sees no worker rows';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon cannot read workers';
  END;
END $$;
ROLLBACK;
