import { useRef, useState } from "react";
import { friendlyError } from "@/lib/friendlyError";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Coins, Gift, Loader2, ReceiptText, RotateCcw, Sparkles, XCircle, Ban } from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { useWallet } from "@/features/consult/api";
import { cancelOrder, createOrder, gstPart, inr, useLedger, useOrders, usePacks, usePayConfig, verifyPayment, type CheckoutOrder, type LedgerRow, type Pack, useBonus } from "@/features/payments/api";
import { openCheckout, type CheckoutResult } from "@/features/payments/checkout";
import { MockCheckout } from "@/features/payments/MockCheckout";

type Result = { status: "paid" | "failed" | "cancelled"; credits?: number; reason?: string };

export default function Wallet() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta"); const qc = useQueryClient();
  const { data: w } = useWallet(); const packs = usePacks(); const cfg = usePayConfig(); const ledger = useLedger(); const orders = useOrders(); const bonus = useBonus();
  const [busy, setBusy] = useState<string | null>(null); const [result, setResult] = useState<Result | null>(null);
  const [mock, setMock] = useState<CheckoutOrder | null>(null); const mockDone = useRef<((r: CheckoutResult) => void) | null>(null);
  const gst = cfg.data?.gst_pct ?? 18;
  const refresh = () => Promise.all(["wallet", "ledger", "orders"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const buy = async (p: Pack) => {
    setBusy(p.id); setResult(null);
    try {
      const order = await createOrder(p.id);
      const r = await openCheckout(order, { name: "Meiyiyal", description: `${p.name_i18n.en} · ${Number(p.credits) + Number(p.bonus)} credits`, color: "#0d9488",
        openMock: (o) => new Promise((res) => { mockDone.current = res; setMock(o); }) });
      if (r.kind === "success") {
        const v = await verifyPayment(r.payload);
        setResult({ status: v.status === "paid" ? "paid" : "failed", credits: Number(order.credits) + Number(order.bonus) });
      } else if (r.kind === "failed") setResult({ status: "failed", reason: r.reason });
      else { await cancelOrder(order.order_id); setResult({ status: "cancelled" }); }
    } catch (e) { setResult({ status: "failed", reason: friendlyError(t, (e as Error).message) }); }
    finally { setBusy(null); await refresh(); }
  };
  const label = (r: LedgerRow) => {
    const [k, v] = (r.description ?? "").split(":");
    const pack = packs.data?.find((p) => p.id === v); const pn = pack ? (ta && pack.name_i18n.ta) || pack.name_i18n.en : v;
    if (r.description === "bonus_expired") return t("wallet.l.bonusExpired");
    if (k === "pack") return t("wallet.l.pack", { name: pn }); if (k === "bonus") return t("wallet.l.bonus", { name: pn }); if (k === "refund") return t("wallet.l.refund", { name: pn });
    const m = r.description?.match(/^(chat|voice|video) consult (\d+) min/); if (m) return t("wallet.l.consult", { mode: t(`consult.mode.${m[1]}`), min: m[2] });
    return r.description ?? r.type;
  };

  return (
    <PageShell title={t("wallet.title")} testId="wallet-page">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 p-5 text-white shadow-lg">
        <Coins className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-15" />
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("wallet.balance")}</p>
        <p className="mt-1 flex items-baseline gap-2"><span data-testid="wallet-balance" className="text-4xl font-bold tabular-nums">{w ? Number(w.balance).toFixed(0) : "—"}</span><span className="text-sm opacity-80">{t("wallet.credits")}</span></p>
        <p className="mt-1 text-xs opacity-80">{t("wallet.rule")}</p>
        {bonus.data && Number(bonus.data.total) > 0 && bonus.data.next_expires_at && (
          <p data-testid="wallet-bonus" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            <Gift className="h-3.5 w-3.5" />{t("wallet.bonusExpiry", { n: Number(bonus.data.next_amount ?? bonus.data.total).toFixed(0), date: new Date(bonus.data.next_expires_at).toLocaleDateString(ta ? "ta-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) })}
          </p>)}
      </section>

      {result && (
        <div data-testid="pay-result" data-status={result.status} className={`flex items-start gap-3 rounded-2xl p-3 text-sm animate-in fade-in slide-in-from-top-2 ${result.status === "paid" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : result.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
          {result.status === "paid" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : result.status === "failed" ? <XCircle className="h-5 w-5 shrink-0" /> : <Ban className="h-5 w-5 shrink-0" />}
          <div><p className="font-semibold">{t(`wallet.result.${result.status}`, { credits: result.credits })}</p>{result.reason && <p className="text-xs opacity-80">{result.reason}</p>}</div>
        </div>)}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("wallet.addCredits")}</h2>
        {Number(bonus.data?.expiry_days ?? 0) > 0 && <p data-testid="wallet-bonus-rule" className="px-1 text-[11px] text-muted-foreground">{t("wallet.bonusRule", { days: bonus.data?.expiry_days })}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          {packs.isLoading && [0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
          {packs.data?.map((p, i) => (
            <button key={p.id} data-testid="pack" data-id={p.id} disabled={!!busy} onClick={() => buy(p)} style={{ animationDelay: `${i * 40}ms` }}
              className={`relative flex flex-col items-start rounded-2xl border bg-card p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary active:scale-[.98] disabled:opacity-60 animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${p.popular ? "border-primary ring-2 ring-primary/20" : ""} ${i === 0 && (packs.data?.length ?? 0) % 2 ? "col-span-2" : ""}`}>
              {p.popular && <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">{t("wallet.popular")}</span>}
              <span className="text-xs font-semibold text-muted-foreground">{(ta && p.name_i18n.ta) || p.name_i18n.en}</span>
              <span className="mt-1 flex items-baseline gap-1"><Coins className="h-4 w-4 self-center text-amber-500" /><b className="text-2xl tabular-nums" data-testid="pack-credits">{Number(p.credits) + Number(p.bonus)}</b></span>
              {Number(p.bonus) > 0 ? <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Gift className="h-3 w-3" />{t("wallet.bonus", { n: Number(p.bonus) })}</span> : <span className="mt-0.5 text-[11px] text-muted-foreground">&nbsp;</span>}
              <span className="mt-2 flex w-full items-center justify-between">
                <span><b data-testid="pack-price" className="text-base">{inr(Number(p.price_inr))}</b><span className="block text-[10px] text-muted-foreground" data-testid="pack-gst">{t("wallet.inclGst", { gst: inr(gstPart(Number(p.price_inr), gst), 2), pct: gst })}</span></span>
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Sparkles className="h-4 w-4 text-primary opacity-60" />}
              </span>
            </button>))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ReceiptText className="h-3.5 w-3.5" />{t("wallet.ledger")}</h2>
        <div className="card-soft divide-y">
          {ledger.data?.length === 0 && <p data-testid="ledger-empty" className="p-4 text-center text-sm text-muted-foreground">{t("wallet.noTx")}</p>}
          {ledger.data?.map((r) => { const pos = Number(r.amount) > 0; const Icon = r.type === "refund" ? RotateCcw : pos ? ArrowDownLeft : ArrowUpRight;
            return (
              <div key={r.id} data-testid="ledger-row" data-type={r.type} className="flex items-center gap-3 p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${pos ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{label(r)}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></div>
                <b data-testid="ledger-amount" className={`tabular-nums ${pos ? "text-emerald-700" : ""}`}>{pos ? "+" : ""}{Number(r.amount).toFixed(0)}</b>
              </div>); })}
        </div>
      </section>

      {!!orders.data?.some((o) => o.status !== "paid") && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("wallet.payments")}</h2>
          <div className="card-soft divide-y">
            {orders.data?.map((o) => (
              <div key={o.id} data-testid="order-row" data-status={o.status} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0"><b>{inr(o.amount_paise / 100)}</b><span className="block truncate text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{o.failure_reason ? ` · ${o.failure_reason}` : ""}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "paid" ? "bg-emerald-500/15 text-emerald-700" : o.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{t(`wallet.status.${o.status}`)}</span>
              </div>))}
          </div>
        </section>)}

      {mock && <MockCheckout key={mock.order_id} order={mock} onDone={(r) => { setMock(null); mockDone.current?.(r); mockDone.current = null; }} />}
    </PageShell>
  );
}
