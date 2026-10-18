import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr, mockGateway, type CheckoutOrder } from "./api";
import type { CheckoutResult } from "./checkout";

/** Stand-in for Razorpay Checkout while no keys are configured. Signatures are still produced and verified server-side. */
export function MockCheckout({ order, onDone }: { order: CheckoutOrder | null; onDone: (r: CheckoutResult) => void }) {
  const { t } = useTranslation(); const [busy, setBusy] = useState<"success" | "failure" | null>(null);
  const go = async (o: "success" | "failure") => {
    if (!order) return; setBusy(o);
    try {
      const r = await mockGateway(order.provider_order_id, o);
      onDone("error" in r ? { kind: "failed", reason: r.error.description } : { kind: "success", payload: r });
    } catch (e) { onDone({ kind: "failed", reason: (e as Error).message }); } finally { setBusy(null); }
  };
  return (
    <Sheet open={!!order} onOpenChange={(o) => { if (!o && !busy) onDone({ kind: "cancelled" }); }}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl [&>button]:hidden" data-testid="mock-checkout">
        <SheetHeader className="text-left">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">{t("pay.testMode")}</span>
            <button data-testid="mock-cancel" aria-label={t("pay.cancel")} disabled={!!busy} onClick={() => onDone({ kind: "cancelled" })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <SheetTitle className="pt-2 text-3xl font-bold tabular-nums" data-testid="mock-amount">{order ? inr(order.amount / 100) : ""}</SheetTitle>
          <SheetDescription>{order && t("pay.youGet", { credits: Number(order.credits) + Number(order.bonus) })}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          <button data-testid="mock-pay" disabled={!!busy} onClick={() => go("success")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground shadow-lg transition active:scale-[.98] disabled:opacity-60">
            {busy === "success" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}{t("pay.simSuccess")}</button>
          <button data-testid="mock-fail" disabled={!!busy} onClick={() => go("failure")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold text-destructive transition hover:bg-destructive/5 disabled:opacity-60">
            {busy === "failure" && <Loader2 className="h-4 w-4 animate-spin" />}{t("pay.simFail")}</button>
          <p className="flex items-center justify-center gap-1 pt-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />{t("pay.mockNote")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
