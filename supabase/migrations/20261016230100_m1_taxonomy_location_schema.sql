-- M1: data-driven taxonomy + Tamil Nadu locations + user locations
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE public.taxonomy_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  parent_slug text REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE,
  kind text NOT NULL CHECK (kind IN ('group','category','subcategory','specialty')),
  name_i18n jsonb NOT NULL,            -- {"en": "...", "ta": "..."}; add languages without schema change
  synonyms text[] NOT NULL DEFAULT '{}', -- voice agent / search (EN, TA, Tanglish)
  icon text,
  sort int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  allows_ratings boolean NOT NULL DEFAULT true,
  compliance_mode text NOT NULL DEFAULT 'none' CHECK (compliance_mode IN ('none','telemedicine')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX taxonomy_nodes_parent_idx ON public.taxonomy_nodes(parent_slug, sort);

-- Per-node registration requirements (fields JSON-schema + required doc types). Children inherit.
CREATE TABLE public.node_requirements (
  node_slug text PRIMARY KEY REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  doc_types text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE public.tn_districts (
  slug text PRIMARY KEY,
  name_i18n jsonb NOT NULL,
  center geography(Point,4326) NOT NULL,
  sort int NOT NULL DEFAULT 0
);
CREATE TABLE public.tn_areas (
  id bigserial PRIMARY KEY,
  district_slug text NOT NULL REFERENCES public.tn_districts(slug),
  name text NOT NULL,
  name_ta text,
  center geography(Point,4326),
  sort int NOT NULL DEFAULT 0,
  UNIQUE (district_slug, name)
);

CREATE TABLE public.user_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  address text,
  district_slug text REFERENCES public.tn_districts(slug),
  area_id bigint REFERENCES public.tn_areas(id),
  geog geography(Point,4326) NOT NULL,
  source text NOT NULL CHECK (source IN ('gps','search','list','pin')),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_locations_user_idx ON public.user_locations(user_id) WHERE is_current;
CREATE INDEX user_locations_geog_idx ON public.user_locations USING gist(geog);

-- Worker geo + online fields for search (M2 uses these)
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS base_geog geography(Point,4326),
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
CREATE INDEX IF NOT EXISTS workers_geog_idx ON public.workers USING gist(base_geog);

CREATE TABLE public.worker_nodes (
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  node_slug text NOT NULL REFERENCES public.taxonomy_nodes(slug) ON UPDATE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (worker_id, node_slug)
);

-- RLS
ALTER TABLE public.taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tn_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tn_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read active nodes" ON public.taxonomy_nodes FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write nodes" ON public.taxonomy_nodes FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "public read requirements" ON public.node_requirements FOR SELECT USING (true);
CREATE POLICY "admin write requirements" ON public.node_requirements FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "public read districts" ON public.tn_districts FOR SELECT USING (true);
CREATE POLICY "public read areas" ON public.tn_areas FOR SELECT USING (true);
CREATE POLICY "admin write districts" ON public.tn_districts FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write areas" ON public.tn_areas FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "own locations" ON public.user_locations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public read worker nodes" ON public.worker_nodes FOR SELECT USING (true);
CREATE POLICY "worker manages own nodes" ON public.worker_nodes FOR ALL
  USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()))
  WITH CHECK (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

-- Set current location atomically (one current per user)
CREATE OR REPLACE FUNCTION public.set_current_location(_lat double precision, _lng double precision,
  _source text, _address text DEFAULT NULL, _district text DEFAULT NULL, _area bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.user_locations SET is_current = false WHERE user_id = auth.uid() AND is_current;
  INSERT INTO public.user_locations(user_id,address,district_slug,area_id,geog,source)
  VALUES (auth.uid(), _address, _district, _area, ST_SetSRID(ST_MakePoint(_lng,_lat),4326)::geography, _source)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
