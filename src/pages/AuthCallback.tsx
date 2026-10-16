import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

/** Landing for Google OAuth + email magic link. supabase-js parses the URL and stores the session. */
export default function AuthCallback() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();
  const err = new URLSearchParams(window.location.hash.slice(1) || window.location.search).get("error_description");
  useEffect(() => { if (!loading && user) nav("/", { replace: true }); }, [user, loading, nav]);
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center text-sm">
      {err ? <p data-testid="callback-error" className="text-destructive">{err} · <a className="text-primary" href="/login">{t("auth.back")}</a></p>
           : <p>{t("auth.signingIn")}</p>}
    </div>
  );
}
