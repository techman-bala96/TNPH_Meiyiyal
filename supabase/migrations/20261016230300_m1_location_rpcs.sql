-- M1a: location RPCs (nearest district/area, validated save, current location)
CREATE UNIQUE INDEX IF NOT EXISTS user_locations_one_current ON public.user_locations(user_id) WHERE is_current;

-- Nearest district by PostGIS distance; area = nearest area with a center, else district's first area.
CREATE OR REPLACE FUNCTION public.nearest_location(_lat double precision, _lng double precision)
RETURNS TABLE(district_slug text, district_name jsonb, area_id bigint, area_name text, area_name_ta text, distance_km double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography g),
  d AS (SELECT t.slug, t.name_i18n, ST_Distance(t.center, p.g)/1000 km FROM public.tn_districts t, p ORDER BY t.center <-> p.g LIMIT 1),
  a AS (SELECT x.id, x.name, x.name_ta FROM public.tn_areas x, d, p WHERE x.district_slug = d.slug
        ORDER BY (x.center IS NULL), CASE WHEN x.center IS NULL THEN 0 ELSE ST_Distance(x.center, p.g) END, x.sort LIMIT 1)
  SELECT d.slug, d.name_i18n, a.id, a.name, a.name_ta, d.km FROM d LEFT JOIN a ON true;
$$;

CREATE OR REPLACE FUNCTION public.set_current_location(_lat double precision, _lng double precision,
  _source text, _address text DEFAULT NULL, _district text DEFAULT NULL, _area bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid coordinates'; END IF;
  IF _area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tn_areas WHERE id=_area AND district_slug IS NOT DISTINCT FROM COALESCE(_district, district_slug)) THEN
    RAISE EXCEPTION 'area does not belong to district'; END IF;
  IF _area IS NOT NULL AND _district IS NULL THEN SELECT district_slug INTO _district FROM public.tn_areas WHERE id=_area; END IF;
  UPDATE public.user_locations SET is_current = false WHERE user_id = auth.uid() AND is_current;
  INSERT INTO public.user_locations(user_id,address,district_slug,area_id,geog,source)
  VALUES (auth.uid(), _address, _district, _area, ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography, _source)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.my_current_location()
RETURNS TABLE(id uuid, district_slug text, district_name jsonb, area_id bigint, area_name text, area_name_ta text, lat double precision, lng double precision, source text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.id, l.district_slug, d.name_i18n, l.area_id, a.name, a.name_ta, ST_Y(l.geog::geometry), ST_X(l.geog::geometry), l.source
  FROM public.user_locations l LEFT JOIN public.tn_districts d ON d.slug=l.district_slug LEFT JOIN public.tn_areas a ON a.id=l.area_id
  WHERE l.user_id = auth.uid() AND l.is_current LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.set_current_location(double precision,double precision,text,text,text,bigint) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_current_location(double precision,double precision,text,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearest_location(double precision,double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_current_location() TO authenticated;
