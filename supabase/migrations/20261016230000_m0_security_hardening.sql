-- M0 security hardening (Meiyiyal v1)
-- 1) roles table + has_role()
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_uid uuid, _role public.user_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.user_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Wallet mint fix: clients may only READ wallets / transactions.
DROP POLICY IF EXISTS "Users can create their own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Users can update their own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Users can create transactions on their wallet" ON public.wallet_transactions;
REVOKE INSERT, UPDATE, DELETE ON public.wallets, public.wallet_transactions FROM anon, authenticated;
-- Writes happen only via service_role (Edge Functions: rzp-webhook, session-bill, refund).

-- 3) KYC self-verify fix: owner may insert / read; only admins update status.
DROP POLICY IF EXISTS "Workers can manage their own KYC" ON public.kyc_verification;
CREATE POLICY "Workers submit own KYC" ON public.kyc_verification FOR INSERT
  WITH CHECK (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
              AND status = 'pending' AND aadhaar_verified = false AND pan_verified = false
              AND video_verified = false AND verified_at IS NULL);
CREATE POLICY "Admins review KYC" ON public.kyc_verification FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Protected worker fields: owners cannot change verification / rating / activation.
CREATE OR REPLACE FUNCTION public.guard_worker_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false; NEW.is_active := false;
    NEW.rating := 0; NEW.total_reviews := 0;
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'protected worker fields can only be changed by admin';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_worker_fields ON public.workers;
CREATE TRIGGER trg_guard_worker_fields BEFORE INSERT OR UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_protected_fields();

-- 5) Same guard for service_requests payment fields (users must not mark paid)
CREATE OR REPLACE FUNCTION public.guard_request_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.final_price IS DISTINCT FROM OLD.final_price) THEN
    RAISE EXCEPTION 'payment fields are server-managed';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.payment_status := 'pending'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_request_payment ON public.service_requests;
CREATE TRIGGER trg_guard_request_payment BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_payment();

-- 6) Drop legacy profile_visitors (feature removed)
DROP TABLE IF EXISTS public.profile_visitors CASCADE;
