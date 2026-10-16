-- Default per-minute credit rates (1 credit = ₹1), Tamil Nadu market-calibrated (see docs/04-credit-pricing.md):
-- TN private OPD consult ₹200–500 (GP) / ₹500–1000 (specialist); advocate consult ₹500–2000; engineer site/plan review ₹500–1500.
-- A 10–15 min online consult should land well below a clinic visit. Admin-editable; children inherit unless overridden.
INSERT INTO public.rate_cards(node_slug,mode,credits_per_min,band_min,band_max,min_minutes) VALUES
 ('professionals--doctor','chat',5,3,10,5),('professionals--doctor','voice',8,5,15,5),('professionals--doctor','video',12,8,20,5),
 ('professionals--doctor--allopathy','chat',6,3,20,5),('professionals--doctor--allopathy','voice',10,5,30,5),('professionals--doctor--allopathy','video',15,8,40,5),
 ('professionals--doctor--dental','chat',4,3,8,5),('professionals--doctor--dental','voice',7,5,12,5),('professionals--doctor--dental','video',10,8,18,5),
 ('professionals--doctor--physiotherapy','chat',4,3,8,5),('professionals--doctor--physiotherapy','voice',7,5,12,5),('professionals--doctor--physiotherapy','video',10,8,18,5),
 ('professionals--doctor--nutrition-diet','chat',4,3,8,5),('professionals--doctor--nutrition-diet','voice',6,5,12,5),('professionals--doctor--nutrition-diet','video',9,8,18,5),
 ('professionals--doctor--psychology-counselling','chat',8,5,15,15),('professionals--doctor--psychology-counselling','voice',12,8,20,15),('professionals--doctor--psychology-counselling','video',18,10,30,15),
 ('professionals--lawyer','chat',10,5,20,10),('professionals--lawyer','voice',15,10,30,10),('professionals--lawyer','video',25,15,40,10),
 ('professionals--engineer','chat',6,4,15,10),('professionals--engineer','voice',10,6,20,10),('professionals--engineer','video',15,10,30,10),
 ('professionals--engineer--architect','chat',8,4,15,10),('professionals--engineer--architect','voice',12,6,20,10),('professionals--engineer--architect','video',18,10,30,10)
ON CONFLICT (node_slug,mode) DO UPDATE SET credits_per_min=EXCLUDED.credits_per_min, band_min=EXCLUDED.band_min, band_max=EXCLUDED.band_max, min_minutes=EXCLUDED.min_minutes;
-- Specialists (allopathy specialties) price higher than GP
INSERT INTO public.rate_cards(node_slug,mode,credits_per_min,band_min,band_max,min_minutes)
SELECT t.slug, m.mode, m.r, m.lo, m.hi, 5 FROM public.taxonomy_nodes t,
 (VALUES ('chat',10,6,20),('voice',15,10,30),('video',20,15,40)) m(mode,r,lo,hi)
WHERE t.parent_slug='professionals--doctor--allopathy' AND t.slug <> 'professionals--doctor--allopathy--general-physician'
ON CONFLICT (node_slug,mode) DO NOTHING;
