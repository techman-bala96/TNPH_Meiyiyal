import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Banknote, CalendarDays, Clock, Hourglass, Loader2, Percent, Wallet as WalletIcon } from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { rpcErr } from "@/features/consult/api";
import { inr } from "@/features/payments/api";

type Payout = { id: string; amount: number; status: "requested" | "paid" | "rejected"; reference: string | null; admin_note: string | null; requested_at: string; decided_at: string | null };
type Week = { week: string; sessions: number; gross: number; commission: number; net: number };
type Earn = { is_worker: boolean; commission_pct: number | null; lifetime_gross: number; lifetime_net: number; on_hold: number; available: number; requested: number; paid: number; payout_min: number; hold_hours: number; weeks: Week[]; payouts: Payout[] };

export default function Earnings() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["earnings"], queryFn: async () => { const { data, error } = await supabase.rpc("my_earnings"); if (error) throw error; return data as unknown as Earn; } });
  const e = q.data; const canPay = !!e && Number(e.available) >= Number(e.payout_min) && Number(e.requested) === 0;
  const request = async () => {
    setBusy(true); const { error } = await supabase.rpc("payout_request"); setBusy(false);
    if (error) toast.error(rpcErr(error)); else { toast.success(t("earn.requested")); await qc.invalidateQueries({ queryKey: ["earnings"] }); }
  };
  const fmtWeek = (d: string) => { const s = new Date(d + "T00:00:00"); const en = new Date(s); en.setDate(s.getDate() + 6); return `${s.toLocaleDateString([], { day: "numeric", month: "short" })} – ${en.toLocaleDateString([], { day: "numeric", month: "short" })}`; };
  return (
    <PageShell title={t("earn.title")} testId="earnings-page" back="/?tab=worker">
      {q.isLoading && <div className="h-40 animate-pulse rounded-3xl bg-muted" />}
      {e && <>
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg animate-in fade-in">
          <Banknote className="pointer-events-none absolute -right-5 -top-5 h-32 w-32 opacity-15" />
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("earn.available")}</p>
          <p data-testid="earn-available" className="mt-1 text-4xl font-bold tabular-nums">{inr(Number(e.available), 2)}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
            <span className="flex items-center gap-1"><Hourglass className="h-3.5 w-3.5" />{t("earn.onHold")} <b data-testid="earn-hold">{inr(Number(e.on_hold), 2)}</b></span>
            {e.commission_pct != null && <span className="flex items-center gap-1"><Percent className="h-3.5 w-3.5" />{t("earn.fee")} <b data-testid="earn-commission">{Number(e.commission_pct)}%</b></span>}
          </div>
          <button data-testid="payout-request" disabled={!canPay || busy} onClick={request}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 font-semibold text-violet-700 shadow transition active:scale-[.98] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletIcon className="h-4 w-4" />}{t("earn.request")}</button>
          <p className="mt-2 text-center text-[11px] opacity-80">{Number(e.requested) > 0 ? t("earn.pendingNote", { amt: inr(Number(e.requested), 2) }) : t("earn.rule", { min: inr(Number(e.payout_min)), h: e.hold_hours })}</p>
        </section>
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
                  <span className="block truncate text-[11px] text-muted-foreground"><Clock className="mr-0.5 inline h-3 w-3" />{new Date(p.requested_at).toLocaleDateString([], { dateStyle: "medium" })}{p.reference ? ` · ${p.reference}` : ""}{p.admin_note ? ` · ${p.admin_note}` : ""}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.status === "paid" ? "bg-emerald-500/15 text-emerald-700" : p.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-700"}`}>{t(`earn.status.${p.status}`)}</span>
              </div>))}
          </div>
        </section>
      </>}
    </PageShell>
  );
}
