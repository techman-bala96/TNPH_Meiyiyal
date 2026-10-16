-- M2a: profile (name, phone, dob, prefs, avatar) + avatars bucket; stop leaking profiles publicly
ALTER TABLE public.profiles
  ALTER COLUMN first_name SET DEFAULT '', ALTER COLUMN last_name SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS dob date CHECK (dob IS NULL OR (dob > '1900-01-01' AND dob <= current_date)),
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_full_name_len CHECK (full_name IS NULL OR char_length(full_name) <= 80);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_fmt CHECK (phone_number IS NULL OR phone_number ~ '^\+?[0-9]{10,13}$');

-- Profiles held email/phone and were readable by everyone. Owner-only now; public worker info goes through RPCs.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
-- role column must not be self-editable
CREATE OR REPLACE FUNCTION public.guard_profile_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin') OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.role := 'user'; RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'protected profile fields'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_fields();

-- Avatars: public-read (shown on worker cards), write only into own folder <uid>/...
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars','avatars', true, 2097152, ARRAY['image/webp','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
CREATE POLICY "avatars owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Saved locations: list for owner
CREATE OR REPLACE FUNCTION public.my_locations()
RETURNS TABLE(id uuid, district_slug text, district_name jsonb, area_id bigint, area_name text, area_name_ta text, address text, lat double precision, lng double precision, is_current boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.id, l.district_slug, d.name_i18n, l.area_id, a.name, a.name_ta, l.address, ST_Y(l.geog::geometry), ST_X(l.geog::geometry), l.is_current, l.created_at
  FROM public.user_locations l LEFT JOIN public.tn_districts d ON d.slug=l.district_slug LEFT JOIN public.tn_areas a ON a.id=l.area_id
  WHERE l.user_id = auth.uid() ORDER BY l.is_current DESC, l.created_at DESC LIMIT 20;
$$;
CREATE OR REPLACE FUNCTION public.use_saved_location(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_locations WHERE id=_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE public.user_locations SET is_current=false WHERE user_id=auth.uid() AND is_current;
  UPDATE public.user_locations SET is_current=true WHERE id=_id AND user_id=auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION public.my_locations(), public.use_saved_location(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.use_saved_location(uuid) FROM anon;
