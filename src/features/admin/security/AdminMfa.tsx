import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cleanCode, groupSecret } from "./totp";

type Enrol = { id: string; qr: string; secret: string };

/** Second-factor gate for admins: enrol an authenticator once, then a 6-digit code on every new session. */
export function AdminMfa() {
  const { t } = useTranslation(); const qc = useQueryClient(); const { signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null); const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setErr(error.message); setLoading(false); return; }
    const verified = data.totp.find((f) => f.status === "verified");
    if (verified) { setFactorId(verified.id); setLoading(false); return; }
    for (const f of data.all.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const e = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Meiyiyal admin ${new Date().toISOString().slice(0, 10)}` });
    if (e.error) setErr(e.error.message); else setEnrol({ id: e.data.id, qr: e.data.totp.qr_code, secret: e.data.totp.secret });
    setLoading(false);
  })(); }, []);

  const verify = async () => {
    const id = factorId ?? enrol?.id; if (!id) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) { setBusy(false); setCode(""); setErr(t("mfa.wrong")); return; }
    if (enrol) await supabase.rpc("admin_security_event", { _event: "mfa.enrolled" });
    await supabase.rpc("admin_security_event", { _event: "mfa.verified" });
    setBusy(false); await qc.invalidateQueries();
  };

  return (
    <main data-testid="admin-mfa" className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-6 py-10">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-lg font-bold">{t("mfa.title")}</h1></div>
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : enrol ? (
        <section className="card-soft space-y-3 p-4 text-sm">
          <p>{t("mfa.enrolIntro")}</p>
          <img data-testid="mfa-qr" src={enrol.qr} alt={t("mfa.qrAlt")} className="mx-auto h-48 w-48 rounded-xl bg-white p-2" />
          <p className="text-xs text-muted-foreground">{t("mfa.manual")}</p>
          <code data-testid="mfa-secret" data-secret={enrol.secret} className="block break-all rounded-xl bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider">{groupSecret(enrol.secret)}</code>
        </section>
      ) : <p className="text-sm text-muted-foreground">{t("mfa.prompt")}</p>}
      {!loading && (factorId || enrol) && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <label htmlFor="mfa-code" className="text-xs font-medium">{t("mfa.code")}</label>
          <input id="mfa-code" data-testid="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))}
            className="w-full rounded-xl border bg-card px-3 py-3 text-center font-mono text-2xl tracking-[0.5em]" />
          <button data-testid="mfa-verify" disabled={busy || code.length !== 6} className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{t("mfa.verify")}</button>
        </form>
      )}
      {err && <p role="alert" data-testid="mfa-error" className="text-sm text-destructive">{err}</p>}
      <p className="text-xs text-muted-foreground">{t("mfa.lost")}</p>
      <button onClick={() => signOut()} className="tap flex items-center justify-center gap-2 rounded-xl border text-sm"><LogOut className="h-4 w-4" />{t("mfa.signOut")}</button>
    </main>
  );
}
