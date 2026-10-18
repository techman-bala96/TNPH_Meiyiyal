import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Banknote, CalendarDays, Clock, Hourglass, Loader2, Percent, Wallet as WalletIcon } from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { rpcErr } from "@/features/consult/api";
import { inr } from "@/features/payments/api";

type Payout = { id: string; amount: number; status: string; reference: string | null; admin_note: string | null; failure_reason: string | null; requested_at: string; decided_at: string | null };
type Week = { week: string; sessions: number; gross: number; commission: number; net: number };
type Account = { kind: "bank" | "upi"; mask: string; ifsc: string | null; status: string; registered_name: string | null; reason: string | null; duplicate: boolean; cooling_until: string | null; verified_at: string | null };
type Earn = { is_worker: boolean; commission_pct: number | null; lifetime_gross: number; lifetime_net: number; on_hold: number; available: number; requested: number; paid: number; payout_min: number; hold_hours: number; payouts_auto: boolean; next_batch: string | null; wait_reason: string | null; wait_until: string | null; cooling_days: number; account: Account | null; weeks: Week[]; payouts: Payout[] };

const chip = (s: string) => s === "paid" || s === "verified" ? "bg-emerald-500/15 text-emerald-700" : s === "failed" || s === "rejected" || s === "reversed" ? "bg-destructive/10 text-destructive" : s === "review" ? "bg-sky-500/15 text-sky-700" : "bg-amber-500/15 text-amber-700";
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function fnMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") { try { const b = await ctx.json(); if (b?.error) return String(b.error); } catch { /* not json */ } }
  return (error as Error)?.message ?? String(error);
}

export default function Earnings() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [busy, setBusy] = useState(false); const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<"bank" | "upi">("bank");
  const [account, setAccount] = useState(""); const [ifsc, setIfsc] = useState(""); const [otp, setOtp] = useState(""); const [pan, setPan] = useState("");
  const q = useQuery({ queryKey: ["earnings"], queryFn: async () => { const { data, error } = await supabase.rpc("my_earnings"); if (error) throw error; return data as unknown as Earn; } });
  const e = q.data;
  const verified = e?.account?.status === "verified";
  const showForm = !!e?.is_worker && (!e.account || editing || e.account.status !== "verified");
  const canPay = !!e && !verified && Number(e.available) >= Number(e.payout_min) && Number(e.requested) === 0;
  const request = async () => {
    setBusy(true); const { error } = await supabase.rpc("payout_request"); setBusy(false);
    if (error) toast.error(rpcErr(error)); else { toast.success(t("earn.requested")); await qc.invalidateQueries({ queryKey: ["earnings"] }); }
  };
  const saveAccount = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("payout-fund-account", { body: { kind, account, ifsc, otp, pan } });
    setBusy(false);
    if (error) { toast.error(await fnMessage(error)); return; }
    const status = String((data as { status?: string })?.status ?? "");
    toast.success(t(`earn.saved.${status}`, { defaultValue: status }));
    setAccount(""); setOtp(""); setEditing(status !== "verified");
    await qc.invalidateQueries({ queryKey: ["earnings"] });
  };
  const fmtWeek = (d: string) => { const s = new Date(d + "T00:00:00"); const en = new Date(s); en.setDate(s.getDate() + 6); return `${s.toLocaleDateString([], { day: "numeric", month: "short" })} – ${en.toLocaleDateString([], { day: "numeric", month: "short" })}`; };
  return (
    <PageShell title={t("earn.title")} testId="earnings-page" back="/?tab=worker">
      {q.isLoading && <div className="h-40 animate-pulse rounded-3xl bg-muted" />}
      {e && <>
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg">
          <Banknote className="pointer-events-none absolute -right-5 -top-5 h-32 w-32 opacity-15" />
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("earn.available")}</p>
          <p data-testid="earn-available" className="mt-1 text-4xl font-bold tabular-nums">{inr(Number(e.available), 2)}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
            <span className="flex items-center gap-1"><Hourglass className="h-3.5 w-3.5" />{t("earn.onHold")} <b data-testid="earn-hold">{inr(Number(e.on_hold), 2)}</b></span>
            {e.commission_pct != null && <span className="flex items-center gap-1"><Percent className="h-3.5 w-3.5" />{t("earn.fee")} <b data-testid="earn-commission">{Number(e.commission_pct)}%</b></span>}
          </div>
          {!verified && <button data-testid="payout-request" disabled={!canPay || busy} onClick={request}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 font-semibold text-violet-700 shadow transition active:scale-[.98] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletIcon className="h-4 w-4" />}{t("earn.request")}</button>}
          <p className="mt-2 text-center text-[11px] opacity-80">{Number(e.requested) > 0 ? t("earn.pendingNote", { amt: inr(Number(e.requested), 2) }) : verified ? t("earn.autoNote") : t("earn.rule", { min: inr(Number(e.payout_min)), h: e.hold_hours })}</p>
        </section>

        {e.is_worker && <section data-testid="payout-account" data-status={e.account?.status ?? "none"} className="card-soft space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{t("earn.account")}</h2>
              <p className="text-[11px] text-muted-foreground">{t("earn.accountHint")}</p>
            </div>
            {e.account && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip(e.account.status)}`}>{t(`earn.status.${e.account.status}`)}</span>}
          </div>
          {e.account && !showForm && <div className="space-y-1 text-sm">
            <p data-testid="payout-mask" className="font-semibold tabular-nums">{e.account.mask}{e.account.ifsc ? ` · ${e.account.ifsc}` : ""}</p>
            {e.account.registered_name && <p data-testid="payout-registered" className="text-xs text-muted-foreground">{t("earn.registered")}: {e.account.registered_name}</p>}
            <button type="button" data-testid="payout-change" onClick={() => setEditing(true)} className="text-xs font-semibold text-primary">{t("earn.change")}</button>
          </div>}
          {e.next_batch && <p className="text-xs"><span className="text-muted-foreground">{t("earn.next")}: </span><b data-testid="payout-next" data-at={e.next_batch}>{ist(e.next_batch)}</b></p>}
          {e.wait_reason && <p data-testid="payout-wait" data-reason={e.wait_reason} data-until={e.wait_until ?? ""} className="text-xs text-muted-foreground">{t(`earn.wait.${e.wait_reason}`, { date: e.wait_until ? ist(e.wait_until) : "" })}</p>}
          {showForm && <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(["bank", "upi"] as const).map((k) => (
                <button key={k} type="button" data-testid={`payout-kind-${k}`} onClick={() => setKind(k)} className={`rounded-lg py-1.5 text-xs font-semibold ${kind === k ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`earn.${k}`)}</button>))}
            </div>
            <input data-testid="payout-account-number" value={account} onChange={(ev) => setAccount(ev.target.value)} autoComplete="off" placeholder={kind === "bank" ? t("earn.accountNo") : t("earn.vpa")} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
            {kind === "bank" && <input data-testid="payout-ifsc" value={ifsc} onChange={(ev) => setIfsc(ev.target.value.toUpperCase())} autoComplete="off" placeholder={t("earn.ifsc")} className="w-full rounded-xl border bg-background px-3 py-2 text-sm uppercase" />}
            <input data-testid="payout-otp" value={otp} onChange={(ev) => setOtp(ev.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder={t("earn.otp")} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
            <input data-testid="payout-pan" value={pan} onChange={(ev) => setPan(ev.target.value.toUpperCase())} autoComplete="off" placeholder={t("earn.pan")} className="w-full rounded-xl border bg-background px-3 py-2 text-sm uppercase" />
            <button data-testid="payout-save" disabled={busy || account.trim().length < 5 || otp.trim().length < 4 || (kind === "bank" && ifsc.trim().length < 11)} onClick={saveAccount}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("earn.saveAccount")}</button>
          </div>}
        </section>}

        <div className="grid grid-cols-3 gap-2 text-center">
          {([["earn.lifetime", e.lifetime_net, "earn-lifetime"], ["earn.pending", e.requested, "earn-pending"], ["earn.paid", e.paid, "earn-paid"]] as const).map(([k, v, id]) => (
            <div key={k} className="card-soft p-3"><p className="text-[11px] text-muted-foreground">{t(k)}</p><p data-testid={id} className="font-bold tabular-nums">{inr(Number(v))}</p></div>))}
        </div>
        <section className="space-y-2">
          <h2 className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{t("earn.weekly")}</h2>
          <div className="card-soft divide-y">
            {e.weeks.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t("earn.none")}</p>}
            {e.weeks.map((w) => (
              <div key={w.week} data-testid="earn-week" className="grid grid-cols-[1fr_auto] gap-1 p-3 text-sm">
                <span className="font-medium">{fmtWeek(w.week)}</span><b data-testid="earn-week-net" className="text-right tabular-nums">{inr(Number(w.net), 2)}</b>
                <span className="text-[11px] text-muted-foreground">{t("earn.sessions", { count: Number(w.sessions) })}</span>
                <span className="text-right text-[11px] text-muted-foreground">{t("earn.grossFee", { gross: inr(Number(w.gross), 2), fee: inr(Number(w.commission), 2) })}</span>
              </div>))}
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("earn.payouts")}</h2>
          <div className="card-soft divide-y">
            {e.payouts.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t("earn.noPayouts")}</p>}
            {e.payouts.map((p) => (
              <div key={p.id} data-testid="payout-row" data-status={p.status} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0"><b className="tabular-nums">{inr(Number(p.amount), 2)}</b>
                  <span className="block truncate text-[11px] text-muted-foreground"><Clock className="mr-0.5 inline h-3 w-3" />{new Date(p.requested_at).toLocaleDateString([], { dateStyle: "medium" })}{p.reference ? ` · ${p.reference}` : ""}{p.admin_note ? ` · ${p.admin_note}` : ""}{(p.status === "failed" || p.status === "reversed" || p.status === "rejected") ? ` · ${t("earn.returned")}` : p.failure_reason ? ` · ${p.failure_reason}` : ""}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip(p.status)}`}>{t(`earn.status.${p.status}`)}</span>
              </div>))}
          </div>
        </section>
      </>}
    </PageShell>
  );
}
