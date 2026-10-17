import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rpcErr } from "@/features/consult/api";
import { inr, usePacks, type Pack } from "@/features/payments/api";

const chip = (s: string) => s === "paid" ? "bg-emerald-500/15 text-emerald-700" : s === "failed" || s === "rejected" ? "bg-destructive/10 text-destructive" : s === "refunded" ? "bg-sky-500/15 text-sky-700" : s === "requested" ? "bg-amber-500/15 text-amber-700" : "bg-muted text-muted-foreground";

export function PacksEditor() {
  const { t } = useTranslation(); const qc = useQueryClient(); const packs = usePacks(true);
  const [edit, setEdit] = useState<Record<string, Partial<Pack>>>({}); const [busy, setBusy] = useState<string | null>(null);
  const save = async (p: Pack) => {
    const e = { ...p, ...edit[p.id] }; setBusy(p.id);
    const { error } = await supabase.rpc("admin_upsert_pack", { _id: p.id, _name: e.name_i18n, _price: Number(e.price_inr), _credits: Number(e.credits), _bonus: Number(e.bonus), _sort: e.sort, _active: e.active, _popular: e.popular });
    setBusy(null);
    if (error) toast.error(rpcErr(error)); else { toast.success(t("admin.saved")); setEdit((x) => ({ ...x, [p.id]: {} })); qc.invalidateQueries({ queryKey: ["packs"] }); }
  };
  const num = (p: Pack, k: "price_inr" | "credits" | "bonus") => (
    <label className="text-[11px] text-muted-foreground">{t(`admin.pack.${k}`)}
      <input data-testid={`pack-${k}`} type="number" inputMode="decimal" value={String(edit[p.id]?.[k] ?? p[k])} onChange={(ev) => setEdit((x) => ({ ...x, [p.id]: { ...x[p.id], [k]: ev.target.value } }))}
        className="mt-0.5 w-full rounded-lg border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" /></label>);
  return (
    <div className="space-y-2" data-testid="packs-editor">
      {packs.data?.map((p) => { const e = { ...p, ...edit[p.id] }; const dirty = Object.keys(edit[p.id] ?? {}).length > 0;
        return (
          <div key={p.id} data-testid="pack-edit" data-id={p.id} className={`card-soft space-y-2 p-3 ${e.active ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between"><b>{p.name_i18n.en}</b>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={!!e.popular} onChange={(ev) => setEdit((x) => ({ ...x, [p.id]: { ...x[p.id], popular: ev.target.checked } }))} />{t("wallet.popular")}</label>
                <label className="flex items-center gap-1"><input data-testid="pack-active" type="checkbox" checked={!!e.active} onChange={(ev) => setEdit((x) => ({ ...x, [p.id]: { ...x[p.id], active: ev.target.checked } }))} />{t("admin.pack.active")}</label>
              </div></div>
            <div className="grid grid-cols-3 gap-2">{num(p, "price_inr")}{num(p, "credits")}{num(p, "bonus")}</div>
            {dirty && <button data-testid="pack-save" disabled={busy === p.id} onClick={() => save(p)} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground">{busy === p.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("admin.save")}</button>}
          </div>); })}
    </div>
  );
}

type PayRow = { id: string; user_name: string; pack_id: string; amount_paise: number; credits: number; bonus: number; provider: string; provider_order_id: string | null; provider_payment_id: string | null; status: string; failure_reason: string | null; refund_note: string | null; created_at: string; events: number };
export function PaymentsView() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [note, setNote] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_payments", { _limit: 100 }); if (error) throw error; return data as unknown as PayRow[]; } });
  const refund = async (id: string) => {
    const { error } = await supabase.rpc("admin_refund", { _id: id, _note: note[id] ?? "" });
    if (error) toast.error(rpcErr(error)); else { toast.success(t("admin.pay.refunded")); qc.invalidateQueries({ queryKey: ["admin-payments"] }); }
  };
  const paid = (q.data ?? []).filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_paise, 0) / 100;
  return (
    <div className="space-y-2" data-testid="payments-view">
      <div className="card-soft flex justify-between p-3 text-sm"><span>{t("admin.pay.collected")}</span><b data-testid="pay-collected">{inr(paid)}</b></div>
      {q.data?.map((r) => (
        <div key={r.id} data-testid="payment-row" data-status={r.status} data-order={r.provider_order_id ?? ""} className="card-soft space-y-1.5 p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><b>{r.user_name} · {inr(r.amount_paise / 100)}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip(r.status)}`}>{t(`wallet.status.${r.status}`)}</span></div>
          <p className="text-[11px] text-muted-foreground">{r.pack_id} · {Number(r.credits) + Number(r.bonus)} cr · {r.provider} · {r.provider_payment_id ?? r.provider_order_id ?? "—"} · {t("admin.pay.events", { n: r.events })}</p>
          {(r.failure_reason || r.refund_note) && <p className="text-[11px]">{r.failure_reason ?? r.refund_note}</p>}
          {r.status === "paid" && <div className="flex gap-2">
            <input data-testid="refund-note" placeholder={t("admin.pay.refundReason")} value={note[r.id] ?? ""} onChange={(e) => setNote((x) => ({ ...x, [r.id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1 text-xs" />
            <button data-testid="refund" disabled={!note[r.id]?.trim()} onClick={() => refund(r.id)} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-40"><RotateCcw className="h-3 w-3" />{t("admin.pay.refund")}</button></div>}
        </div>))}
    </div>
  );
}

type PayoutRow = { id: string; worker_name: string; amount: number; status: string; reference: string | null; admin_note: string | null; requested_at: string; items: number };
export function PayoutsAdmin() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [ref, setRef] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["admin-payouts"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_payouts"); if (error) throw error; return data as unknown as PayoutRow[]; } });
  const decide = async (id: string, paid: boolean) => {
    const v = ref[id] ?? "";
    const { error } = await supabase.rpc("admin_payout_decide", { _id: id, _paid: paid, _reference: paid ? v : "", _note: paid ? "" : v });
    if (error) toast.error(rpcErr(error)); else { toast.success(t(paid ? "admin.payout.markedPaid" : "admin.payout.rejected")); qc.invalidateQueries({ queryKey: ["admin-payouts"] }); }
  };
  return (
    <div className="space-y-2" data-testid="payouts-admin">
      {q.data?.length === 0 && <p className="card-soft p-4 text-center text-sm text-muted-foreground">{t("admin.payout.none")}</p>}
      {q.data?.map((r) => (
        <div key={r.id} data-testid="payout-admin-row" data-status={r.status} data-name={r.worker_name} className="card-soft space-y-2 p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><b>{r.worker_name} · {inr(Number(r.amount), 2)}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip(r.status)}`}>{t(`earn.status.${r.status}`)}</span></div>
          <p className="text-[11px] text-muted-foreground">{new Date(r.requested_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {t("admin.payout.items", { n: r.items })}{r.reference ? ` · ${r.reference}` : ""}{r.admin_note ? ` · ${r.admin_note}` : ""}</p>
          {r.status === "requested" && <div className="flex gap-2">
            <input data-testid="payout-ref" placeholder={t("admin.payout.refOrReason")} value={ref[r.id] ?? ""} onChange={(e) => setRef((x) => ({ ...x, [r.id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-xs" />
            <button data-testid="payout-paid" disabled={!ref[r.id]?.trim()} onClick={() => decide(r.id, true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><Check className="h-3.5 w-3.5" />{t("admin.payout.paid")}</button>
            <button data-testid="payout-reject" disabled={!ref[r.id]?.trim()} onClick={() => decide(r.id, false)} className="grid place-items-center rounded-lg border px-2 text-destructive disabled:opacity-40" aria-label={t("admin.payout.reject")}><X className="h-3.5 w-3.5" /></button></div>}
        </div>))}
    </div>
  );
}
