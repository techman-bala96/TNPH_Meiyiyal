import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

/** Landing for Google OAuth + email magic link. supabase-js parses the URL and stores the session. */
export default function AuthCallback() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useTranslation();
  const q = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const code = q.get("error_code"), raw = q.get("error_description");
  // used / expired / already-clicked links are the common case: say it plainly, in the user's language
  const err = code === "otp_expired" || /expired|invalid/i.test(raw ?? "") ? t("auth.linkExpired") : raw ? t("auth.linkFailed") : null;
  useEffect(() => { if (!loading && user) nav("/", { replace: true }); }, [user, loading, nav]);
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center text-sm">
      {err ? <p data-testid="callback-error" className="text-destructive">{err} <a data-testid="callback-login" className="font-semibold text-primary underline" href="/login">{t("auth.signInAgain")}</a></p>
           : <p>{t("auth.signingIn")}</p>}
    </div>
  );
}
