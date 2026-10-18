import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, Check, FileUp, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { childrenOf, nodeName, pathTo, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { iconFor } from "@/features/taxonomy/icons";
import { THEMES, patternStyle } from "@/features/taxonomy/themes";
import { useProfile } from "@/features/profile/useProfile";
import { LivenessCapture } from "@/features/verify/LivenessCapture";
import { QrScanner } from "@/features/verify/QrScanner";
import { aadhaarProvider, stageQr, stageSelfie, uploadDoc, useKycMode, useMyDocs, useMyKyc, useMyWorker, useRequirements, type ReqField } from "@/features/worker/api";

const STEPS = ["profession", "details", "aadhaar", "qr", "selfie", "documents", "review"] as const;
type Step = (typeof STEPS)[number];

export default function WorkerRegister() {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const nav = useNavigate(); const qc = useQueryClient(); const { user } = useAuth();
  const tax = useTaxonomy(); const all = tax.data ?? [];
  const { data: profile } = useProfile();
  const worker = useMyWorker(); const w = worker.data;
  const kyc = useMyKyc(!!w); const docs = useMyDocs(w?.id); const mode = useKycMode();

  const [step, setStep] = useState<Step>("profession");
  const [cat, setCat] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [name, setName] = useState(""); const [years, setYears] = useState(""); const [about, setAbout] = useState("");
  const [reg, setReg] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [aadhaar, setAadhaar] = useState(""); const [otpSent, setOtpSent] = useState<string | null>(null); const [otp, setOtp] = useState("");
  const [qr, setQr] = useState(""); const [liveDone, setLiveDone] = useState(false); const [noCamera, setNoCamera] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null); const [consent, setConsent] = useState(false);
  const req = useRequirements(node);

  // resume a draft
  useEffect(() => {
    if (!w) return;
    if (w.status === "pending" || w.status === "approved") { nav("/?tab=worker", { replace: true }); return; }
    if (w.primary_node && !node) {
      const p = pathTo(all, w.primary_node); if (!p.length) return;
      setCat(p.find((x) => x.kind === "category")?.slug ?? null); setNode(w.primary_node);
      setName(w.display_name ?? ""); setYears(w.years_experience?.toString() ?? ""); setAbout(w.about ?? ""); setReg(w.reg_data ?? {});
    }
  }, [w, all]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!name && profile?.full_name) setName(profile.full_name); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = childrenOf(all, "professionals");
  const subs = cat ? childrenOf(all, cat) : [];
  const sub = node ? pathTo(all, node).find((x) => x.kind === "subcategory")?.slug ?? null : null;
  const specs = sub ? childrenOf(all, sub) : [];
  const th = THEMES[cat?.split("--").pop() ?? ""] ?? THEMES.default;
  const label = (f: { label: Record<string, string | undefined> }) => f.label[lang] || f.label.en;
  const idx = STEPS.indexOf(step);
  const uploaded = useMemo(() => new Set((docs.data ?? []).map((d) => d.doc_type)), [docs.data]);

  function validateDetails() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.display_name = t("worker.err.required");
    const y = Number(years); if (years === "" || !Number.isInteger(y) || y < 0 || y > 70) e.years = t("worker.err.years");
    for (const f of req.data?.fields ?? []) {
      const v = (reg[f.key] ?? "").trim();
      if (f.required && !v) e[f.key] = t("worker.err.required");
      else if (v && f.pattern && !new RegExp(f.pattern).test(v)) e[f.key] = t("worker.err.format");
      else if (v && f.type === "year" && (+v < 1950 || +v > new Date().getFullYear())) e[f.key] = t("worker.err.format");
    }
    setErrs(e); return Object.keys(e).length === 0;
  }
  async function saveDetails() {
    if (!validateDetails() || !node) return;
    setBusy("details"); setErr(null);
    const clean = Object.fromEntries(Object.entries(reg).filter(([k]) => req.data?.fields.some((f) => f.key === k)).map(([k, v]) => [k, v.trim()]));
    const { error } = await supabase.rpc("worker_register", { _node: node, _extra_nodes: extra, _display_name: name.trim(), _years: Number(years), _about: about.trim(), _reg: clean });
    setBusy(null);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ["my-worker"] });
    setStep(kyc.data?.aadhaar_verified ? "qr" : "aadhaar");
  }
  async function sendOtp() {
    const a = aadhaar.replace(/\D/g, "");
    if (!/^[2-9]\d{11}$/.test(a)) return setErr(t("worker.err.aadhaar"));
    setBusy("otp"); setErr(null);
    try { const r = await aadhaarProvider(mode.data).sendOtp(a); setOtpSent(r.masked); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function verifyOtp() {
    setBusy("verify"); setErr(null);
    try {
      const ok = await aadhaarProvider(mode.data).verifyOtp(otp);
      if (!ok) setErr(t("worker.err.otp")); else { await qc.invalidateQueries({ queryKey: ["my-kyc"] }); setStep("qr"); }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function onDoc(type: string, f?: File) {
    if (!f || !user || !w) return;
    setBusy(`doc:${type}`); setErr(null);
    try { await uploadDoc(user.id, w.id, type, f); await qc.invalidateQueries({ queryKey: ["my-docs"] }); }
    catch (e) { setErr((e as Error).message === "too_big" ? t("worker.err.tooBig") : t("worker.err.upload")); } finally { setBusy(null); }
  }
  async function submit() {
    setBusy("submit"); setErr(null);
    const { error } = await supabase.rpc("worker_submit");
    setBusy(null);
    if (error) return setErr(error.message);
    await qc.invalidateQueries({ queryKey: ["my-worker"] });
    nav("/?tab=worker", { replace: true });
  }
  const missingDocs = (req.data?.docs ?? []).filter((d) => d.required && !uploaded.has(d.type));
  async function saveQr() {
    if (!user || qr.trim().length < 8) return setErr(t("worker.err.qr"));
    setBusy("qr"); setErr(null);
    try { await stageQr(user.id, qr.trim()); setStep("selfie"); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function saveSelfie() {
    if (!user || !selfie || !consent || !(liveDone || noCamera)) return;
    setBusy("selfie"); setErr(null);
    try { await stageSelfie(user.id, selfie, liveDone); setStep("documents"); }
    catch (e) { setErr((e as Error).message === "too_big" ? t("worker.err.tooBig") : (e as Error).message || t("worker.err.upload")); }
    finally { setBusy(null); }
  }

  return (
    <PageShell title={t("worker.registerTitle")} back="/?tab=worker" testId="worker-register">
      <ol className="flex gap-1.5" aria-label="progress">
        {STEPS.map((s, i) => <li key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= idx ? "bg-primary" : "bg-muted"}`} />)}
      </ol>
      <p className="text-xs font-medium text-muted-foreground">{t("worker.stepOf", { n: idx + 1, total: STEPS.length })} · {t(`worker.step.${step}`)}</p>
      {w?.status === "needs_info" && w.review_note && <p data-testid="review-note" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{w.review_note}</p>}

      {step === "profession" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          {w?.locked_category && <p data-testid="profession-locked" className="text-xs text-muted-foreground">{t("worker.lockedNote")}</p>}
          <div className="grid grid-cols-3 gap-2">
            {cats.filter((c) => !w?.locked_category || c.slug === w.locked_category).map((c) => { const T = THEMES[c.slug.split("--").pop()!] ?? THEMES.default; const Icon = iconFor(c.icon); const on = cat === c.slug;
              return (
                <button key={c.slug} data-testid={`reg-cat-${c.slug}`} onClick={() => { setCat(c.slug); setNode(null); setExtra([]); setReg({}); }}
                  className={`relative overflow-hidden rounded-2xl p-3 text-left transition ${T.hero} ${T.ink} ${on ? "ring-4 ring-primary/40" : "opacity-80"}`}>
                  <div className="pointer-events-none absolute inset-0" style={patternStyle(T)} />
                  <Icon className="relative h-6 w-6" /><span className="relative mt-2 block text-sm font-bold">{nodeName(c, lang)}</span>
                  {on && <Check className="absolute right-2 top-2 h-4 w-4" />}
                </button>);
            })}
          </div>
          {cat && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("worker.pickSub")}</p>
              <div className="flex flex-wrap gap-2">
                {subs.map((s) => { const on = sub === s.slug; const Icon = iconFor(s.icon);
                  return <button key={s.slug} data-testid={`reg-sub-${s.slug}`} onClick={() => { setNode(s.slug); setExtra([]); }}
                    className={`tap flex items-center gap-1.5 rounded-full border px-3 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}><Icon className="h-4 w-4" />{nodeName(s, lang)}</button>; })}
              </div>
            </div>
          )}
          {specs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("worker.pickSpec")}</p>
              <div className="flex flex-wrap gap-2">
                {specs.map((s) => { const on = node === s.slug;
                  return <button key={s.slug} data-testid={`reg-spec-${s.slug}`} onClick={() => setNode(on ? sub : s.slug)}
                    className={`tap rounded-full border px-3 text-sm transition ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card"}`}>{nodeName(s, lang)}</button>; })}
              </div>
            </div>
          )}
          {sub && (
            <details className="rounded-2xl border bg-card p-3">
              <summary className="cursor-pointer text-sm font-semibold">{t("worker.extraAreas")} <span className="text-xs font-normal text-muted-foreground">({extra.length}/5)</span></summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {subs.filter((s) => s.slug !== sub).map((s) => { const on = extra.includes(s.slug);
                  return <button key={s.slug} data-testid={`reg-extra-${s.slug}`} disabled={!on && extra.length >= 5}
                    onClick={() => setExtra(on ? extra.filter((x) => x !== s.slug) : [...extra, s.slug])}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-primary bg-primary/10 text-primary" : ""}`}>{nodeName(s, lang)}</button>; })}
              </div>
            </details>
          )}
          <Button data-testid="reg-next" disabled={!node} className="tap w-full rounded-xl" onClick={() => setStep("details")}>{t("worker.next")}</Button>
        </div>
      )}

      {step === "details" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <Field id="display_name" label={t("worker.nameAsReg")} error={errs.display_name}>
            <Input id="display_name" data-testid="reg-name" value={name} onChange={(e) => { setName(e.target.value); setErrs({ ...errs, display_name: "" }); }} className="h-11 rounded-xl" /></Field>
          {(req.data?.fields ?? []).map((f) => <DynField key={f.key} f={f} label={label(f)} value={reg[f.key] ?? ""} error={errs[f.key]} onChange={(v) => { setReg({ ...reg, [f.key]: v }); if (errs[f.key]) setErrs({ ...errs, [f.key]: "" }); }} optional={t("worker.optional")} />)}
          <Field id="years" label={t("worker.years")} error={errs.years}>
            <Input id="years" data-testid="reg-years" inputMode="numeric" value={years} onChange={(e) => { setYears(e.target.value.replace(/\D/g, "").slice(0, 2)); setErrs({ ...errs, years: "" }); }} className="h-11 rounded-xl" /></Field>
          <Field id="about" label={`${t("worker.about")} (${t("worker.optional")})`}>
            <Textarea id="about" data-testid="reg-about" value={about} maxLength={1000} onChange={(e) => setAbout(e.target.value)} className="rounded-xl" rows={3} /></Field>
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="tap flex-1 rounded-xl" onClick={() => setStep("profession")}>{t("auth.back")}</Button>
            <Button data-testid="reg-save-details" className="tap flex-[2] rounded-xl" disabled={busy === "details" || req.isLoading} onClick={saveDetails}>
              {busy === "details" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("worker.next")}</Button>
          </div>
        </div>
      )}

      {step === "aadhaar" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="card-soft flex gap-3 p-4"><ShieldCheck className="h-6 w-6 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">{t("worker.aadhaarWhy")}</p></div>
          {kyc.data?.aadhaar_verified ? (
            <p data-testid="aadhaar-done" className="flex items-center gap-2 text-sm font-semibold text-primary"><BadgeCheck className="h-5 w-5" />{kyc.data.masked}</p>
          ) : !otpSent ? (
            <>
              <Field id="aadhaar" label={t("worker.aadhaarNo")}>
                <Input id="aadhaar" data-testid="reg-aadhaar" inputMode="numeric" autoComplete="off" value={aadhaar.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="XXXX XXXX XXXX" className="h-11 rounded-xl tracking-widest" /></Field>
              <Button data-testid="reg-send-otp" className="tap w-full rounded-xl" disabled={busy === "otp"} onClick={sendOtp}>{busy === "otp" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("auth.sendOtp")}</Button>
            </>
          ) : (
            <>
              <p className="text-sm">{t("worker.otpSentTo", { masked: otpSent })}</p>
              <Input data-testid="reg-aadhaar-otp" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className="h-11 rounded-xl text-center tracking-[0.5em]" />
              {mode.data === "stub" && <p data-testid="stub-hint" className="text-xs text-muted-foreground">{t("worker.stubHint")}</p>}
              <Button data-testid="reg-verify-otp" className="tap w-full rounded-xl" disabled={otp.length !== 6 || busy === "verify"} onClick={verifyOtp}>{busy === "verify" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("auth.verify")}</Button>
            </>
          )}
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          {kyc.data?.aadhaar_verified && <Button className="tap w-full rounded-xl" onClick={() => setStep("qr")}>{t("worker.next")}</Button>}
        </div>
      )}

      {step === "qr" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="card-soft flex gap-3 p-4"><QrCode className="h-6 w-6 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">{t("worker.qrWhy")}</p></div>
          <QrScanner value={qr} onChange={setQr} />
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          <Button data-testid="reg-qr-save" className="tap w-full rounded-xl" disabled={busy === "qr" || qr.trim().length < 8} onClick={saveQr}>
            {busy === "qr" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("worker.next")}</Button>
        </div>
      )}

      {step === "selfie" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="card-soft flex gap-3 p-4"><Camera className="h-6 w-6 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">{t("worker.selfieWhy")}</p></div>
          {user && !noCamera && <LivenessCapture userId={user.id} onDone={(r) => { setSelfie(r.portrait); setLiveDone(true); }} onNoCamera={() => { setNoCamera(true); setLiveDone(false); }} />}
          {noCamera && (<>
            <p data-testid="reg-no-camera" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t("worker.liveNoCamera")}</p>
            <label className="card-soft flex cursor-pointer items-center justify-between p-3 text-sm">
              <span>{selfie ? selfie.name : t("worker.selfieFile")}</span>
              <input data-testid="reg-selfie-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
            </label>
          </>)}
          <label className="flex items-start gap-2 text-sm"><input data-testid="reg-selfie-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />{t("worker.selfieConsent")}</label>
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          <Button data-testid="reg-selfie-next" className="tap w-full rounded-xl" disabled={!selfie || !consent || !(liveDone || noCamera) || busy === "selfie"} onClick={saveSelfie}>
            {busy === "selfie" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("worker.next")}</Button>
        </div>
      )}

      {step === "documents" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <ul className="space-y-2">
            {(req.data?.docs ?? []).map((d) => { const ok = uploaded.has(d.type); const b = busy === `doc:${d.type}`;
              return (
                <li key={d.type} className={`card-soft flex items-center gap-3 p-3 ${ok ? "ring-1 ring-primary/40" : ""}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {b ? <Loader2 className="h-5 w-5 animate-spin" /> : ok ? <Check className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label(d)}</span>
                    <span className="text-xs text-muted-foreground">{d.required ? t("worker.required") : t("worker.optional")}</span></span>
                  <label className="tap grid cursor-pointer place-items-center rounded-xl border px-3 text-xs font-semibold">
                    {ok ? t("worker.replace") : t("worker.upload")}
                    <input data-testid={`doc-${d.type}`} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onDoc(d.type, e.target.files?.[0])} />
                  </label>
                </li>);
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t("worker.docsNote")}</p>
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          <Button data-testid="reg-docs-next" className="tap w-full rounded-xl" disabled={missingDocs.length > 0} onClick={() => setStep("review")}>{t("worker.next")}</Button>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className={`relative overflow-hidden rounded-3xl p-4 ${th.hero} ${th.ink}`}>
            <div className="pointer-events-none absolute inset-0" style={patternStyle(th)} />
            <p className="relative text-lg font-bold">{name}</p>
            <p className="relative text-sm opacity-90">{node && pathTo(all, node).slice(1).map((n) => nodeName(n, lang)).join(" › ")}</p>
            <p className="relative mt-1 text-xs opacity-80">{t("worker.yearsShort", { count: Number(years) })} · {kyc.data?.masked}</p>
          </div>
          <dl className="card-soft divide-y p-1 text-sm">
            {(req.data?.fields ?? []).filter((f) => reg[f.key]).map((f) => (
              <div key={f.key} className="flex justify-between gap-3 px-3 py-2"><dt className="text-muted-foreground">{label(f)}</dt><dd className="text-right font-medium">{reg[f.key]}</dd></div>))}
          </dl>
          {err && <p data-testid="reg-error" className="text-sm text-destructive">{err}</p>}
          <Button data-testid="reg-submit" className="tap w-full rounded-xl" disabled={busy === "submit"} onClick={submit}>{busy === "submit" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("worker.submit")}</Button>
          <p className="text-center text-xs text-muted-foreground">{t("worker.reviewSla")}</p>
        </div>
      )}
    </PageShell>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label>{children}{error && <p className="text-xs text-destructive" data-testid={`err-${id}`}>{error}</p>}</div>;
}
function DynField({ f, label, value, error, onChange, optional }: { f: ReqField; label: string; value: string; error?: string; onChange: (v: string) => void; optional: string }) {
  const l = f.required ? label : label.includes("(") ? label : `${label} (${optional})`;
  return (
    <Field id={`f-${f.key}`} label={l} error={error}>
      {f.type === "select" ? (
        <select id={`f-${f.key}`} data-testid={`f-${f.key}`} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
          <option value="">—</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <Input id={`f-${f.key}`} data-testid={`f-${f.key}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder}
          type={f.type === "date" ? "date" : "text"} inputMode={f.type === "year" ? "numeric" : undefined} maxLength={f.type === "year" ? 4 : 120} className="h-11 rounded-xl" />
      )}
      {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
    </Field>
  );
}
