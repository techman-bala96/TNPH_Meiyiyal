BEGIN;
SELECT set_config('meiyiyal.trusted','on',true);
UPDATE public.workers SET status='rejected', is_active=false, is_verified=false, is_online=false;  -- isolate (rolled back)
INSERT INTO auth.users(id,email,aud,role) VALUES
 ('00000000-0000-0000-0000-00000000aa01','s1@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000aa02','s2@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000aa03','s3@test.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000aa04','s4@test.local','authenticated','authenticated');
INSERT INTO public.workers(id,user_id,display_name,primary_node,status,is_active,is_verified,is_online,last_seen_at,base_geog,district_slug,years_experience) VALUES
 ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-00000000aa01','Near Offline','professionals--doctor--allopathy--paediatrics','approved',true,true,false,now(),'POINT(77.5385 8.0883)','kanniyakumari',3),
 ('00000000-0000-0000-0000-00000000bb02','00000000-0000-0000-0000-00000000aa02','Far Online','professionals--doctor--allopathy--paediatrics','approved',true,true,true,now(),'POINT(77.4315 8.184)','kanniyakumari',9),
 ('00000000-0000-0000-0000-00000000bb03','00000000-0000-0000-0000-00000000aa03','Chennai Online','professionals--doctor--allopathy--paediatrics','approved',true,true,true,now(),'POINT(80.27 13.03)','chennai',5),
 ('00000000-0000-0000-0000-00000000bb04','00000000-0000-0000-0000-00000000aa04','Pending One','professionals--doctor--allopathy--paediatrics','pending',false,false,false,now(),'POINT(77.5385 8.0883)','kanniyakumari',1);
INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT id, primary_node, true FROM public.workers WHERE id::text LIKE '00000000-0000-0000-0000-00000000bb0%';
SELECT set_config('meiyiyal.trusted','off',true);
SET LOCAL role anon;
DO $$ BEGIN
  PERFORM public.search_workers('professionals--doctor', 8.0883, 77.5385);
  RAISE EXCEPTION 'FAIL: anon can search';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: search needs sign-in (distance is private)';
END $$;
RESET role;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa09","role":"authenticated"}', true);
SET LOCAL role authenticated;
DO $$ DECLARE names text[]; d double precision; BEGIN
  SELECT array_agg(display_name) INTO names FROM public.search_workers('professionals--doctor--allopathy', 8.0883, 77.5385);
  IF names <> ARRAY['Far Online','Near Offline'] THEN RAISE EXCEPTION 'FAIL: order/radius %', names; END IF;
  RAISE NOTICE 'PASS: available first, then offline, nearest first; 50 km radius; pending hidden';
  SELECT distance_km INTO d FROM public.search_workers('professionals--doctor', 8.0883, 77.5385) WHERE display_name='Far Online';
  IF d <> 16 THEN RAISE EXCEPTION 'FAIL: distance % (want whole km)', d; END IF;
  RAISE NOTICE 'PASS: distance % km, rounded to whole km (Kanyakumari -> Nagercoil)', d;
  IF (SELECT distance_km FROM public.search_workers('professionals--doctor', 8.0883, 77.5385, 50, true) WHERE display_name='Near Offline') <> 0 THEN RAISE EXCEPTION 'FAIL: under 1 km should be 0 (shown as < 1 km)'; END IF;
  IF (SELECT count(*) FROM public.search_workers('professionals--doctor--allopathy--paediatrics', 8.0883, 77.5385, 50, true)) <> 3 THEN RAISE EXCEPTION 'FAIL: show all'; END IF;
  IF EXISTS (SELECT 1 FROM public.search_workers('professionals--lawyer', 8.0883, 77.5385, 50, true)) THEN RAISE EXCEPTION 'FAIL: other subtree'; END IF;
  IF EXISTS (SELECT 1 FROM public.search_workers('professionals--doctor--allopathy--paed', 8.0883, 77.5385, 50, true)) THEN RAISE EXCEPTION 'FAIL: prefix match'; END IF;
  RAISE NOTICE 'PASS: show-all statewide; subtree scoped';
END $$;
RESET role;
SELECT set_config('meiyiyal.trusted','on',true);
UPDATE public.workers SET last_seen_at = now() - interval '1 hour' WHERE id='00000000-0000-0000-0000-00000000bb02';
DO $$ BEGIN
  IF (SELECT is_online FROM public.search_workers('professionals--doctor', 8.0883, 77.5385) WHERE display_name='Far Online') THEN RAISE EXCEPTION 'FAIL: stale presence'; END IF;
  RAISE NOTICE 'PASS: stale heartbeat shows offline';
END $$;
ROLLBACK;
