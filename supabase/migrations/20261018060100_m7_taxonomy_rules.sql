-- M7 taxonomy coverage + verification rules.
-- Online consults added below. Not added, on purpose:
--   Anesthesiology, emergency medicine, forensic medicine, and academic pre-clinical subjects:
--   they are not an online consultation a person can finish in this app (emergency is Call 108).
--   Immigration and notary: the decisive step is in person. Bail/remand stays under Criminal.
--   Procedure-only work (surgery, a farm visit, a court appearance) stays advice-only inside the
--   specialty that already exists.

-- ---------- doctors: more teleconsult specialties ----------
INSERT INTO public.taxonomy_nodes (slug,parent_slug,kind,name_i18n,icon,sort) VALUES
 ('professionals--doctor--allopathy--radiology','professionals--doctor--allopathy','specialty','{"en":"Radiology (report review)","ta":"கதிரியக்க அறிக்கை"}'::jsonb,NULL,17),
 ('professionals--doctor--allopathy--rheumatology','professionals--doctor--allopathy','specialty','{"en":"Rheumatology","ta":"மூட்டு வாத மருத்துவம்"}'::jsonb,NULL,18),
 ('professionals--doctor--allopathy--geriatrics','professionals--doctor--allopathy','specialty','{"en":"Geriatrics","ta":"முதியோர் மருத்துவம்"}'::jsonb,NULL,19),
 ('professionals--doctor--allopathy--infectious-diseases','professionals--doctor--allopathy','specialty','{"en":"Infectious Diseases","ta":"தொற்று நோய்"}'::jsonb,NULL,20),
 ('professionals--doctor--allopathy--hematology','professionals--doctor--allopathy','specialty','{"en":"Hematology","ta":"இரத்த மருத்துவம்"}'::jsonb,NULL,21),
 ('professionals--doctor--allopathy--allergy-immunology','professionals--doctor--allopathy','specialty','{"en":"Allergy & Immunology","ta":"ஒவ்வாமை"}'::jsonb,NULL,22),
 ('professionals--doctor--unani--general-unani','professionals--doctor--unani','specialty','{"en":"General Unani","ta":"பொது யுனானி"}'::jsonb,NULL,0),
 ('professionals--doctor--homeopathy--general-homeopathy','professionals--doctor--homeopathy','specialty','{"en":"General Homoeopathy","ta":"பொது ஹோமியோபதி"}'::jsonb,NULL,0),
 ('professionals--doctor--yoga-naturopathy--therapeutic-yoga','professionals--doctor--yoga-naturopathy','specialty','{"en":"Therapeutic Yoga","ta":"சிகிச்சை யோகா"}'::jsonb,NULL,0),
 ('professionals--doctor--yoga-naturopathy--naturopathy','professionals--doctor--yoga-naturopathy','specialty','{"en":"Naturopathy","ta":"இயற்கை மருத்துவம்"}'::jsonb,NULL,1),
 ('professionals--doctor--nutrition-diet--clinical-diet','professionals--doctor--nutrition-diet','specialty','{"en":"Clinical Diet","ta":"மருத்துவ உணவியல்"}'::jsonb,NULL,0),
 ('professionals--doctor--nutrition-diet--diabetes-diet','professionals--doctor--nutrition-diet','specialty','{"en":"Diabetes Diet","ta":"சர்க்கரை உணவு"}'::jsonb,NULL,1),
 ('professionals--doctor--nutrition-diet--sports-nutrition','professionals--doctor--nutrition-diet','specialty','{"en":"Sports Nutrition","ta":"விளையாட்டு உணவியல்"}'::jsonb,NULL,2),
 ('professionals--doctor--veterinary','professionals--doctor','subcategory','{"en":"Veterinary","ta":"கால்நடை மருத்துவம்"}'::jsonb,'stethoscope',10),
 ('professionals--doctor--veterinary--pet-small-animal','professionals--doctor--veterinary','specialty','{"en":"Pet & Small Animal","ta":"செல்லப் பிராணி"}'::jsonb,NULL,0),
 ('professionals--doctor--veterinary--livestock','professionals--doctor--veterinary','specialty','{"en":"Livestock","ta":"கால்நடை"}'::jsonb,NULL,1),
 ('professionals--doctor--veterinary--poultry','professionals--doctor--veterinary','specialty','{"en":"Poultry","ta":"கோழி வளர்ப்பு"}'::jsonb,NULL,2),
 ('professionals--doctor--veterinary--veterinary-nutrition','professionals--doctor--veterinary','specialty','{"en":"Veterinary Nutrition","ta":"கால்நடை உணவியல்"}'::jsonb,NULL,3)
ON CONFLICT (slug) DO UPDATE SET name_i18n = EXCLUDED.name_i18n, icon = EXCLUDED.icon, sort = EXCLUDED.sort, parent_slug = EXCLUDED.parent_slug, kind = EXCLUDED.kind;

-- ---------- lawyers: practice areas the current 12 do not cover ----------
INSERT INTO public.taxonomy_nodes (slug,parent_slug,kind,name_i18n,icon,sort) VALUES
 ('professionals--lawyer--intellectual-property','professionals--lawyer','subcategory','{"en":"Intellectual Property","ta":"அறிவுசார் சொத்து"}'::jsonb,'file-text',12),
 ('professionals--lawyer--insurance-claims','professionals--lawyer','subcategory','{"en":"Insurance Claims","ta":"காப்பீட்டு கோரிக்கை"}'::jsonb,'shield',13),
 ('professionals--lawyer--insolvency-bankruptcy','professionals--lawyer','subcategory','{"en":"Insolvency & Bankruptcy","ta":"திவால் & நொடிப்பு"}'::jsonb,'landmark',14),
 ('professionals--lawyer--medical-negligence','professionals--lawyer','subcategory','{"en":"Medical Negligence","ta":"மருத்துவ அலட்சியம்"}'::jsonb,'stethoscope',15),
 ('professionals--lawyer--rera-housing','professionals--lawyer','subcategory','{"en":"RERA & Housing","ta":"ரெரா & குடியிருப்பு"}'::jsonb,'home',16),
 ('professionals--lawyer--banking-debt','professionals--lawyer','subcategory','{"en":"Banking & Debt Recovery","ta":"வங்கி & கடன்"}'::jsonb,'receipt',17)
ON CONFLICT (slug) DO UPDATE SET name_i18n = EXCLUDED.name_i18n, icon = EXCLUDED.icon, sort = EXCLUDED.sort, parent_slug = EXCLUDED.parent_slug, kind = EXCLUDED.kind;

-- ---------- engineers: disciplines that can review, design, or advise online ----------
INSERT INTO public.taxonomy_nodes (slug,parent_slug,kind,name_i18n,icon,sort) VALUES
 ('professionals--engineer--structural','professionals--engineer','subcategory','{"en":"Structural","ta":"கட்டமைப்புப் பொறியியல்"}'::jsonb,'building',8),
 ('professionals--engineer--structural--building-plans','professionals--engineer--structural','specialty','{"en":"Building Plans","ta":"கட்டிட வரைபடம்"}'::jsonb,NULL,0),
 ('professionals--engineer--structural--structural-audit','professionals--engineer--structural','specialty','{"en":"Structural Audit","ta":"கட்டமைப்பு தணிக்கை"}'::jsonb,NULL,1),
 ('professionals--engineer--chemical','professionals--engineer','subcategory','{"en":"Chemical","ta":"வேதியியல் பொறியியல்"}'::jsonb,'flask',9),
 ('professionals--engineer--instrumentation','professionals--engineer','subcategory','{"en":"Instrumentation","ta":"கருவிப் பொறியியல்"}'::jsonb,'cpu',10),
 ('professionals--engineer--environmental','professionals--engineer','subcategory','{"en":"Environmental","ta":"சுற்றுச்சூழல் பொறியியல்"}'::jsonb,'leaf',11),
 ('professionals--engineer--biomedical','professionals--engineer','subcategory','{"en":"Biomedical","ta":"உயிரி மருத்துவப் பொறியியல்"}'::jsonb,'activity',12),
 ('professionals--engineer--aeronautical','professionals--engineer','subcategory','{"en":"Aeronautical","ta":"வானூர்திப் பொறியியல்"}'::jsonb,'sun',13),
 ('professionals--engineer--automobile','professionals--engineer','subcategory','{"en":"Automobile","ta":"தானியங்கிப் பொறியியல்"}'::jsonb,'car',14),
 ('professionals--engineer--agricultural','professionals--engineer','subcategory','{"en":"Agricultural","ta":"வேளாண் பொறியியல்"}'::jsonb,'sprout',15),
 ('professionals--engineer--mining','professionals--engineer','subcategory','{"en":"Mining","ta":"சுரங்கப் பொறியியல்"}'::jsonb,'hard-hat',16),
 ('professionals--engineer--marine','professionals--engineer','subcategory','{"en":"Marine","ta":"கடல் பொறியியல்"}'::jsonb,'droplet',17)
ON CONFLICT (slug) DO UPDATE SET name_i18n = EXCLUDED.name_i18n, icon = EXCLUDED.icon, sort = EXCLUDED.sort, parent_slug = EXCLUDED.parent_slug, kind = EXCLUDED.kind;

-- Voice synonyms (EN / TA / Tanglish). Existing nodes keep theirs.
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['vet','veterinary','veterinarian','animal doctor','pet doctor','கால்நடை','கால்நடை மருத்துவர்','vet doctor'])) WHERE slug = 'professionals--doctor--veterinary';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['pet doctor','dog doctor','cat doctor','செல்லப் பிராணி'])) WHERE slug = 'professionals--doctor--veterinary--pet-small-animal';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['radiologist','scan report','xray report','கதிரியக்கம்'])) WHERE slug = 'professionals--doctor--allopathy--radiology';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['rheumatologist','arthritis','joint doctor','வாதம்'])) WHERE slug = 'professionals--doctor--allopathy--rheumatology';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['geriatrician','elder doctor','முதியோர்'])) WHERE slug = 'professionals--doctor--allopathy--geriatrics';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['infection doctor','fever specialist','தொற்று'])) WHERE slug = 'professionals--doctor--allopathy--infectious-diseases';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['blood doctor','hematologist','இரத்தம்'])) WHERE slug = 'professionals--doctor--allopathy--hematology';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['allergy doctor','immunologist','ஒவ்வாமை'])) WHERE slug = 'professionals--doctor--allopathy--allergy-immunology';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['ip lawyer','trademark','copyright','patent','காப்புரிமை'])) WHERE slug = 'professionals--lawyer--intellectual-property';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['insurance lawyer','claim rejected','காப்பீடு'])) WHERE slug = 'professionals--lawyer--insurance-claims';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['insolvency','bankruptcy','ibc','திவால்'])) WHERE slug = 'professionals--lawyer--insolvency-bankruptcy';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['medical negligence','hospital negligence','மருத்துவ அலட்சியம்'])) WHERE slug = 'professionals--lawyer--medical-negligence';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['rera','apartment lawyer','flat dispute','ரெரா'])) WHERE slug = 'professionals--lawyer--rera-housing';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['bank lawyer','loan recovery','debt','கடன்'])) WHERE slug = 'professionals--lawyer--banking-debt';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['structural engineer','structure','கட்டமைப்பு'])) WHERE slug = 'professionals--engineer--structural';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['chemical engineer','வேதியியல் பொறியாளர்'])) WHERE slug = 'professionals--engineer--chemical';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['instrumentation engineer','control systems'])) WHERE slug = 'professionals--engineer--instrumentation';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['environmental engineer','pollution','சுற்றுச்சூழல்'])) WHERE slug = 'professionals--engineer--environmental';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['biomedical engineer','medical devices'])) WHERE slug = 'professionals--engineer--biomedical';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['aeronautical engineer','aerospace','விமானம்'])) WHERE slug = 'professionals--engineer--aeronautical';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['automobile engineer','car engineer','வாகன பொறியாளர்'])) WHERE slug = 'professionals--engineer--automobile';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['agricultural engineer','farm engineer','வேளாண்மை'])) WHERE slug = 'professionals--engineer--agricultural';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['mining engineer','சுரங்கம்'])) WHERE slug = 'professionals--engineer--mining';
UPDATE public.taxonomy_nodes SET synonyms = ARRAY(SELECT DISTINCT unnest(COALESCE(synonyms,'{}') || ARRAY['marine engineer','ship engineer','கடல் பொறியாளர்'])) WHERE slug = 'professionals--engineer--marine';

-- Specialist allopathy rates, same band as the other non-GP allopathy specialties. Everyone else inherits.
INSERT INTO public.rate_cards(node_slug, mode, credits_per_min, band_min, band_max, min_minutes)
SELECT t.slug, m.mode, m.r, m.lo, m.hi, 5
FROM public.taxonomy_nodes t,
  (VALUES ('chat',10,6,20),('voice',15,10,30),('video',20,15,40)) AS m(mode, r, lo, hi)
WHERE t.slug IN (
  'professionals--doctor--allopathy--radiology','professionals--doctor--allopathy--rheumatology',
  'professionals--doctor--allopathy--geriatrics','professionals--doctor--allopathy--infectious-diseases',
  'professionals--doctor--allopathy--hematology','professionals--doctor--allopathy--allergy-immunology')
ON CONFLICT (node_slug, mode) DO NOTHING;

-- ---------- registration requirements ----------
-- Physiotherapy: statutory allied-health council. "Not yet registered" is gone.
INSERT INTO public.node_requirements(node_slug, schema, doc_types) VALUES
('professionals--doctor--physiotherapy', '{"fields":[{"key":"degree","label":{"en":"Qualification","ta":"தகுதி"},"type":"select","required":true,"options":["BPT","MPT"]},{"key":"council","label":{"en":"Registration council","ta":"பதிவு மன்றம்"},"type":"select","required":true,"options":["Tamil Nadu State Allied & Healthcare Council"]},{"key":"reg_no","label":{"en":"Registration number","ta":"பதிவு எண்"},"type":"text","required":true,"pattern":"^[A-Za-z0-9/ .-]{3,30}$"},{"key":"reg_year","label":{"en":"Year of registration","ta":"பதிவு ஆண்டு"},"type":"year","required":true}],"docs":[{"type":"council_cert","label":{"en":"Council registration certificate","ta":"மன்றப் பதிவுச் சான்றிதழ்"},"required":true}]}'::jsonb, '{council_cert}')
ON CONFLICT (node_slug) DO UPDATE SET schema = EXCLUDED.schema, doc_types = EXCLUDED.doc_types;

-- Clinical psychology is RCI. Other counselling specialties keep the parent counsellor path (degree tier).
INSERT INTO public.node_requirements(node_slug, schema, doc_types) VALUES
('professionals--doctor--psychology-counselling--clinical-psychologist', '{"fields":[{"key":"degree","label":{"en":"Qualification","ta":"தகுதி"},"type":"select","required":true,"options":["M.Phil Clinical Psychology","PsyD"]},{"key":"council","label":{"en":"Registration council","ta":"பதிவு மன்றம்"},"type":"select","required":true,"options":["Rehabilitation Council of India (CRR)"]},{"key":"reg_no","label":{"en":"Registration number","ta":"பதிவு எண்"},"type":"text","required":true,"pattern":"^[A-Za-z0-9/ .-]{3,40}$"},{"key":"reg_year","label":{"en":"Year of registration","ta":"பதிவு ஆண்டு"},"type":"year","required":true}],"docs":[{"type":"council_cert","label":{"en":"RCI registration certificate","ta":"RCI பதிவுச் சான்றிதழ்"},"required":true}]}'::jsonb, '{council_cert}')
ON CONFLICT (node_slug) DO UPDATE SET schema = EXCLUDED.schema, doc_types = EXCLUDED.doc_types;

INSERT INTO public.node_requirements(node_slug, schema, doc_types) VALUES
('professionals--doctor--veterinary', '{"fields":[{"key":"degree","label":{"en":"Qualification","ta":"தகுதி"},"type":"select","required":true,"options":["BVSc","MVSc"]},{"key":"council","label":{"en":"Registration council","ta":"பதிவு மன்றம்"},"type":"select","required":true,"options":["Tamil Nadu State Veterinary Council"]},{"key":"reg_no","label":{"en":"Registration number","ta":"பதிவு எண்"},"type":"text","required":true,"pattern":"^[A-Za-z0-9/ .-]{3,30}$"},{"key":"reg_year","label":{"en":"Year of registration","ta":"பதிவு ஆண்டு"},"type":"year","required":true}],"docs":[{"type":"degree_cert","label":{"en":"Degree certificate","ta":"பட்டச் சான்றிதழ்"},"required":true},{"type":"council_cert","label":{"en":"Council registration certificate","ta":"மன்றப் பதிவுச் சான்றிதழ்"},"required":true}]}'::jsonb, '{degree_cert,council_cert}')
ON CONFLICT (node_slug) DO UPDATE SET schema = EXCLUDED.schema, doc_types = EXCLUDED.doc_types;

-- Optional statutory upgrade. Empty → degree tier. Filled → licence tier, admin if there is no adapter.
INSERT INTO public.node_requirements(node_slug, schema, doc_types) VALUES
('professionals--engineer--electrical', '{"fields":[{"key":"licence_no","label":{"en":"TN Electrical Licensing Board no. (optional)","ta":"மின் உரிம எண் (விருப்பம்)"},"type":"text","required":false,"pattern":"^[A-Za-z0-9/ .-]{3,30}$"}],"docs":[{"type":"licence_cert","label":{"en":"Electrical licence (optional)","ta":"மின் உரிமம் (விருப்பம்)"},"required":false}]}'::jsonb, '{licence_cert}'),
('professionals--engineer--structural', '{"fields":[{"key":"licence","label":{"en":"CMDA / DTCP registered engineer no. (optional)","ta":"CMDA / DTCP பதிவு எண் (விருப்பம்)"},"type":"text","required":false}],"docs":[{"type":"licence_cert","label":{"en":"CMDA / DTCP certificate (optional)","ta":"CMDA / DTCP சான்றிதழ் (விருப்பம்)"},"required":false}]}'::jsonb, '{licence_cert}')
ON CONFLICT (node_slug) DO UPDATE SET schema = EXCLUDED.schema, doc_types = EXCLUDED.doc_types;

-- ---------- verification rules ----------
INSERT INTO public.verification_rules(category_slug, check_name, required, weight, params) VALUES
 ('professionals','identity',true,25,'{}'),
 ('professionals','face',true,20,'{}'),
 ('professionals','degree',true,10,'{}'),
 ('professionals','name',true,10,'{}'),
 ('professionals','forensics',true,5,'{}'),
 ('professionals','duplicates',true,0,'{}'),
 ('professionals--doctor','registry',true,30,'{"tier":"licence","provider":"manual","reg_field":"reg_no"}'),
 ('professionals--doctor--allopathy','registry',true,30,'{"tier":"licence","provider":"tnmc","providers":["tnmc","nmc"],"reg_field":"reg_no","deep_link":"https://www.tamilnadumedicalcouncil.org/rmp/search"}'),
 ('professionals--doctor--psychology-counselling','registry',false,0,'{"tier":"degree","provider":"none","reg_field":"reg_no"}'),
 ('professionals--doctor--psychology-counselling--clinical-psychologist','registry',true,30,'{"tier":"licence","provider":"rci","reg_field":"reg_no","deep_link":"https://rciregistration.nic.in/rehabcouncil/newsearchpage.jsp"}'),
 ('professionals--doctor--nutrition-diet','registry',false,0,'{"tier":"degree","provider":"none","reg_field":"reg_no"}'),
 ('professionals--lawyer','registry',true,30,'{"tier":"licence","provider":"bctnpy","reg_field":"enrolment_no","deep_link":"https://www.bctnpy.org/l/verifyAdvocate"}'),
 ('professionals--engineer','registry',false,0,'{"tier":"degree","provider":"none","reg_field":"licence"}'),
 ('professionals--engineer--architect','registry',true,30,'{"tier":"licence","provider":"coa","reg_field":"coa_no","deep_link":"https://coa.gov.in/ver_arch.php?lang=1"}'),
 ('professionals--engineer--civil','registry',false,30,'{"tier":"licence_if_present","provider":"cmda","optional":true,"reg_field":"licence","deep_link":"https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html"}'),
 ('professionals--engineer--structural','registry',false,30,'{"tier":"licence_if_present","provider":"cmda","optional":true,"reg_field":"licence","deep_link":"https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html"}'),
 ('professionals--engineer--electrical','registry',false,0,'{"tier":"licence_if_present","provider":"manual","optional":true,"reg_field":"licence_no"}')
ON CONFLICT (category_slug, check_name) DO UPDATE SET required = EXCLUDED.required, weight = EXCLUDED.weight, params = EXCLUDED.params;

-- Councils with no adapter stay on the doctor default (provider manual): Siddha, Ayurveda, Unani,
-- Homoeopathy, Yoga, Dental, Physiotherapy, Veterinary. A manual provider is "review", not a fail.
