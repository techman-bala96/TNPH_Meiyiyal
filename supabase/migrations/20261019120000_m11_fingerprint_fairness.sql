-- M11 verification fairness (found by the e2e verification scenarios V03-V09).
-- Before: every automatic rejection set blocked=true on all of that account's fingerprints (Aadhaar hash, council
-- number, face). Someone submitting a doctor's council number with a tampered QR got rejected, and the real doctor
-- was then "banned" when they registered. A pending (unverified) account holding a number also hard-failed the next
-- account with the same number, so a squatter could block the genuine owner.
-- Now: only an admin block bans. Another APPROVED account holding the identity is a hard fail ("active").
-- A pending/needs-info or previously rejected holder sends the new case to a person ("claimed_pending" /
-- "previously_rejected"), never an automatic approval.

-- Undo bans that came from automatic rejections (admin blocks keep theirs).
UPDATE public.identity_fingerprints f SET blocked = false
FROM public.workers w WHERE w.id = f.worker_id AND f.blocked AND w.status = 'rejected';

CREATE OR REPLACE FUNCTION public.verification_observe_fingerprint(_worker uuid, _kind text, _hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.identity_fingerprints; _st text;
BEGIN
  IF COALESCE(btrim(_hash),'') = '' THEN RETURN 'ok'; END IF;
  SELECT * INTO _row FROM public.identity_fingerprints WHERE kind = _kind AND hash = _hash;
  IF NOT FOUND THEN
    INSERT INTO public.identity_fingerprints(kind, hash, worker_id) VALUES (_kind, _hash, _worker);
    RETURN 'ok';
  END IF;
  IF _row.worker_id IS NOT DISTINCT FROM _worker THEN RETURN 'self'; END IF;
  IF _row.blocked THEN RETURN 'banned'; END IF;
  IF _row.worker_id IS NULL THEN
    -- left behind by a deleted account that was never banned: the identity is free again
    UPDATE public.identity_fingerprints SET worker_id = _worker WHERE id = _row.id;
    RETURN 'ok';
  END IF;
  SELECT status INTO _st FROM public.workers WHERE id = _row.worker_id;
  IF _st = 'blocked' THEN
    UPDATE public.identity_fingerprints SET blocked = true WHERE id = _row.id;
    RETURN 'banned';
  END IF;
  IF _st = 'approved' THEN RETURN 'active'; END IF;
  IF _st = 'rejected' THEN RETURN 'previously_rejected'; END IF;
  RETURN 'claimed_pending';
END $$;
REVOKE ALL ON FUNCTION public.verification_observe_fingerprint(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verification_observe_fingerprint(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public._verification_apply(_case uuid, _decision text, _risk numeric, _hard text, _by uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.verification_cases; _w public.workers; _tier text; _days int;
BEGIN
  SELECT * INTO _c FROM public.verification_cases WHERE id = _case;
  SELECT * INTO _w FROM public.workers WHERE id = _c.worker_id;
  _days := public.setting_num('verify_retain_days', 30)::int;
  PERFORM set_config('meiyiyal.trusted','on', true);
  IF _decision = 'auto_approve' OR _decision = 'admin' THEN
    _tier := public.badge_tier_for(_w.primary_node, _w.reg_data);
    UPDATE public.workers SET status = 'approved', is_verified = true, is_active = true, is_online = false,
      badge_tier = _tier, verified_at = COALESCE(verified_at, now()), decided_at = now(), review_note = NULL,
      public_selfie_path = COALESCE((SELECT public_portrait_url FROM public.verification_intake i WHERE i.worker_id = _w.id), public_selfie_path),
      selfie_consent_at = COALESCE((SELECT selfie_consent_at FROM public.verification_intake i WHERE i.worker_id = _w.id), selfie_consent_at),
      photo_url = COALESCE((SELECT public_portrait_url FROM public.verification_intake i WHERE i.worker_id = _w.id), photo_url)
    WHERE id = _w.id;
    UPDATE public.kyc_verification SET status = 'verified', verified_at = now() WHERE worker_id = _w.id;
    UPDATE public.verification_cases SET status = 'approved', decision = CASE WHEN _decision = 'admin' THEN 'admin' ELSE 'auto_approve' END,
      risk = _risk, decided_by = _by, decided_at = now(), hard_fail = NULL, purge_after = now() + make_interval(days => _days)
    WHERE id = _case;
    INSERT INTO public.admin_audit(actor, action, target, data)
    VALUES (COALESCE(_by, '00000000-0000-0000-0000-000000000000'::uuid),
            CASE WHEN _decision = 'admin' THEN 'worker.approve' ELSE 'worker.auto_approve' END,
            _w.id, jsonb_build_object('risk', _risk, 'case', _case, 'badge', _tier));
  ELSIF _decision = 'reject' THEN
    UPDATE public.workers SET status = 'rejected', is_verified = false, is_active = false, is_online = false,
      badge_tier = NULL, verified_at = NULL, decided_at = now(), review_note = COALESCE(_hard, 'verification failed')
    WHERE id = _w.id;
    UPDATE public.kyc_verification SET status = 'rejected' WHERE worker_id = _w.id;
    UPDATE public.verification_cases SET status = 'rejected', decision = 'reject', risk = _risk, hard_fail = _hard,
      decided_by = _by, decided_at = now(), purge_after = now() + make_interval(days => _days)
    WHERE id = _case;
    -- No automatic ban: a forged QR or someone else's council number would otherwise lock the genuine owner out.
    -- Only an admin "block" bans an identity (admin_decide_worker). The rejected account keeps its rows, which
    -- a new account then sees as "previously_rejected" (a person reviews), not as a ban.
    INSERT INTO public.admin_audit(actor, action, target, note, data)
    VALUES (COALESCE(_by, '00000000-0000-0000-0000-000000000000'::uuid), 'worker.auto_reject', _w.id, _hard,
            jsonb_build_object('risk', _risk, 'case', _case));
  ELSE
    UPDATE public.workers SET status = 'pending', review_note = NULL WHERE id = _w.id AND status IS DISTINCT FROM 'approved';
    UPDATE public.verification_cases SET status = 'queued', decision = 'queue', risk = _risk, hard_fail = NULL, sla_paused_at = NULL
    WHERE id = _case;
  END IF;
  PERFORM set_config('meiyiyal.trusted','off', true);
  UPDATE public.verification_jobs SET status = 'done' WHERE case_id = _case AND status IN ('queued','running');
  RETURN _decision;
END $$;
