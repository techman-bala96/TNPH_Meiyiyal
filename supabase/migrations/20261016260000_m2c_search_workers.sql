-- M2c: worker search for a taxonomy subtree: online first, then nearest (PostGIS km).
CREATE INDEX IF NOT EXISTS worker_nodes_node_idx ON public.worker_nodes(node_slug);
CREATE INDEX IF NOT EXISTS workers_status_idx ON public.workers(status) WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.search_workers(_node text, _lat double precision, _lng double precision,
  _radius_km double precision DEFAULT 50, _all boolean DEFAULT false, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, photo_url text, rating numeric, feedback_count int, rewards_count int, years_experience int,
  primary_node text, specialty jsonb, is_online boolean, distance_km double precision, district_slug text, district_name jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography g)
  SELECT w.id, w.display_name, w.photo_url, w.rating, w.total_reviews, w.rewards_count, w.years_experience,
    w.primary_node, t.name_i18n,
    (w.is_online AND w.last_seen_at > now() - interval '15 minutes') AS online,
    round((ST_Distance(w.base_geog, p.g)/1000)::numeric, 1)::double precision,
    w.district_slug, d.name_i18n
  FROM public.workers w CROSS JOIN p
  LEFT JOIN public.taxonomy_nodes t ON t.slug = w.primary_node
  LEFT JOIN public.tn_districts d ON d.slug = w.district_slug
  WHERE w.status = 'approved' AND w.is_active AND w.is_verified AND w.base_geog IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.worker_nodes n WHERE n.worker_id = w.id AND (n.node_slug = _node OR n.node_slug LIKE _node || '--%'))
    AND (_all OR ST_DWithin(w.base_geog, p.g, _radius_km * 1000))
  ORDER BY online DESC, ST_Distance(w.base_geog, p.g), w.rating DESC
  LIMIT LEAST(GREATEST(_limit,1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.search_workers(text,double precision,double precision,double precision,boolean,int) TO anon, authenticated;
