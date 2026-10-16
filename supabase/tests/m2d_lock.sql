BEGIN;
INSERT INTO auth.users(id,email,aud,role) VALUES ('00000000-0000-0000-0000-0000000000c9','lock@test.local','authenticated','authenticated');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c9","role":"authenticated"}',true);
DO $$ DECLARE wid uuid; BEGIN
  wid := public.worker_register('professionals--lawyer--civil',NULL,'Adv Lock',4,'','{}');
  wid := public.worker_register('professionals--doctor--siddha',NULL,'Adv Lock',4,'','{}');  -- draft never submitted: may still switch
  IF (SELECT primary_node FROM public.workers WHERE id=wid) <> 'professionals--doctor--siddha' THEN RAISE EXCEPTION 'FAIL: draft switch'; END IF;
  RAISE NOTICE 'PASS: draft (not yet submitted) can change profession';
  wid := public.worker_register('professionals--lawyer--civil',NULL,'Adv Lock',4,'','{}');
  BEGIN UPDATE public.workers SET locked_category='professionals--doctor' WHERE id=wid; RAISE EXCEPTION 'FAIL: client set lock';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: lock is server-controlled'; END;
  BEGIN INSERT INTO public.worker_nodes(worker_id,node_slug) VALUES (wid,'professionals--doctor--dental'); RAISE EXCEPTION 'FAIL: cross-profession node';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: practice area outside profession blocked'; END;
END $$;
RESET role;
-- simulate a submit (server path)
SELECT set_config('meiyiyal.trusted','on',true);
UPDATE public.workers SET submitted_at=now(), status='needs_info' WHERE user_id='00000000-0000-0000-0000-0000000000c9';
SELECT set_config('meiyiyal.trusted','off',true);
SET LOCAL role authenticated;
DO $$ BEGIN
  IF (SELECT locked_category FROM public.workers WHERE user_id=auth.uid()) <> 'professionals--lawyer' THEN RAISE EXCEPTION 'FAIL: lock on submit'; END IF;
  BEGIN PERFORM public.worker_register('professionals--doctor--allopathy',NULL,'X',4,'','{}'); RAISE EXCEPTION 'FAIL: re-register other profession';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: second profession blocked (%)', SQLERRM; END;
  BEGIN UPDATE public.workers SET primary_node='professionals--engineer--civil' WHERE user_id=auth.uid(); RAISE EXCEPTION 'FAIL: direct switch';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: direct profession change blocked'; END;
  PERFORM public.worker_register('professionals--lawyer--consumer',NULL,'Adv Lock',4,'','{}');
  RAISE NOTICE 'PASS: sub-category within same profession still editable while needs_info';
END $$;
RESET role;
DO $$ BEGIN
  BEGIN PERFORM set_config('meiyiyal.trusted','on',true); UPDATE public.workers SET locked_category=NULL WHERE user_id='00000000-0000-0000-0000-0000000000c9'; RAISE EXCEPTION 'FAIL: unlock';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; RAISE NOTICE 'PASS: lock can never be cleared (even server/admin)'; END;
END $$;
ROLLBACK;
