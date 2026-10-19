import { Link } from "react-router-dom";
import { friendlyError } from "@/lib/friendlyError";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pendingReferral } from "@/features/referral/capture";
import { Mail, Phone, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Logo } from "@/components/app/Logo";
import { LangToggle } from "@/components/app/LangToggle";
import { useAuth } from "@/hooks/useAuth";
import { Captcha, captchaEnabled } from "@/features/captcha/Captcha";

type Mode = "choose" | "email" | "email-sent" | "phone" | "otp";

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
);

export default function Login() {
  const invite = pendingReferral();
  const { t } = useTranslation();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const e164 = `+91${phone}`;
  // Captcha tokens are single-use: remount the widget after every send.
  const needCaptcha = captchaEnabled(); const [cap, setCap] = useState<string | null>(null); const [capKey, setCapKey] = useState(0);
  const takeCap = () => { const tok = cap ?? undefined; setCap(null); setCapKey((k) => k + 1); return tok; };
  const capWidget = needCaptcha && <Captcha key={capKey} onToken={setCap} />;
  const capBlocked = needCaptcha && !cap;

  const run = async (fn: () => Promise<{ error: Error | null }>, next?: Mode) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setErr(friendlyError(t, error.message)); // never the raw Auth text ("Token has expired or is invalid")
    else if (next) setMode(next);
  };

  const back = () => { setErr(null); setOtp(""); setMode(mode === "otp" ? "phone" : "choose"); };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        {mode !== "choose" ? (
          <button onClick={back} className="tap -ml-2 grid w-11 place-items-center rounded-full" aria-label={t("auth.back")}><ArrowLeft className="h-5 w-5" /></button>
        ) : <span />}
        <LangToggle />
      </div>

      <div className="mt-10 flex flex-col items-center gap-2">
        <Logo className="h-14" />
        <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
      </div>

      <section className="card-soft mt-10 p-5">
        <h1 className="mb-4 text-lg font-semibold">{t("auth.title")}</h1>
        {invite && <p data-testid="login-invite" className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">{t("invite.willApply", { code: invite.code })}</p>}

        {mode === "choose" && (
          <div className="flex flex-col gap-3">
            <Button data-testid="btn-google" variant="outline" size="lg" className="tap h-12 justify-start gap-3 rounded-xl"
              disabled={busy} onClick={() => run(auth.signInWithGoogle)}>
              <GoogleIcon /> {t("auth.google")}
            </Button>
            <Button data-testid="btn-email" variant="outline" size="lg" className="tap h-12 justify-start gap-3 rounded-xl" onClick={() => setMode("email")}>
              <Mail className="h-5 w-5 text-primary" /> {t("auth.email")}
            </Button>
            <Button data-testid="btn-phone" variant="outline" size="lg" className="tap h-12 justify-start gap-3 rounded-xl" onClick={() => setMode("phone")}>
              <Phone className="h-5 w-5 text-accent" /> {t("auth.phone")}
            </Button>
          </div>
        )}

        {mode === "email" && (
          <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return setErr(t("auth.invalidEmail"));
            const tok = takeCap(); run(() => auth.sendEmailLink(email.trim(), tok), "email-sent");
          }}>
            <label className="text-sm font-medium" htmlFor="email">{t("auth.emailLabel")}</label>
            <Input id="email" data-testid="input-email" type="email" inputMode="email" autoComplete="email" className="h-12 rounded-xl"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
            {capWidget}
            <Button data-testid="btn-send-link" type="submit" size="lg" className="tap h-12 rounded-xl" disabled={busy || capBlocked}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("auth.sendLink")}
            </Button>
          </form>
        )}

        {mode === "email-sent" && (
          <p data-testid="email-sent" className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
            {t("auth.linkSent")}<br /><b>{email}</b>
          </p>
        )}

        {mode === "phone" && (
          <form noValidate className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!/^[6-9]\d{9}$/.test(phone)) return setErr(t("auth.invalidPhone"));
            const tok = takeCap(); run(() => auth.sendPhoneOtp(e164, tok), "otp");
          }}>
            <label className="text-sm font-medium" htmlFor="phone">{t("auth.phoneLabel")}</label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border focus-within:ring-2 focus-within:ring-ring">
              <span className="px-3 text-sm font-medium text-muted-foreground">+91</span>
              <input id="phone" data-testid="input-phone" inputMode="numeric" autoComplete="tel-national" maxLength={10}
                className="h-full flex-1 bg-transparent pr-3 outline-none" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98765 43210" />
            </div>
            {capWidget}
            <Button data-testid="btn-send-otp" type="submit" size="lg" className="tap h-12 rounded-xl" disabled={busy || capBlocked}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("auth.sendOtp")}
            </Button>
          </form>
        )}

        {mode === "otp" && (
          <form className="flex flex-col items-center gap-4" onSubmit={(e) => { e.preventDefault(); run(() => auth.verifyPhoneOtp(e164, otp)); }}>
            <p className="self-start text-sm">{t("auth.otpLabel")} · <b>+91 {phone}</b></p>
            <InputOTP data-testid="input-otp" maxLength={6} value={otp} onChange={setOtp} autoFocus>
              <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-11" />)}</InputOTPGroup>
            </InputOTP>
            <Button data-testid="btn-verify" type="submit" size="lg" className="tap h-12 w-full rounded-xl" disabled={busy || otp.length !== 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("auth.verify")}
            </Button>
            {capWidget}
            <button type="button" data-testid="btn-resend" disabled={busy || capBlocked} className="text-sm text-primary disabled:opacity-40" onClick={() => { const tok = takeCap(); run(() => auth.sendPhoneOtp(e164, tok)); }}>{t("auth.resend")}</button>
          </form>
        )}

        {err && <p data-testid="auth-error" role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">{t("auth.terms")}{" "}
        <Link data-testid="login-terms" to="/terms" className="underline">{t("legal.terms")}</Link> · <Link data-testid="login-privacy" to="/privacy" className="underline">{t("legal.privacy")}</Link></p>
    </main>
  );
}
