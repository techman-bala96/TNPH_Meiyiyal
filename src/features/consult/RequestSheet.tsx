import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Coins, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/features/profile/useProfile";
import { useWallet, type Mode, type Rates } from "./api";
import { ModeIcon } from "./ConsultProvider";
import { useConsult } from "./context";

export type SheetWorker = { id: string; display_name: string; photo_url: string | null; spec: string; is_online: boolean; is_busy?: boolean; rates?: Rates };
const MODES: Mode[] = ["chat", "voice", "video"];
const tint: Record<Mode, string> = { chat: "from-sky-500 to-cyan-500", voice: "from-emerald-500 to-teal-500", video: "from-violet-500 to-fuchsia-500" };

export function WalletChip() {
  const { data: w } = useWallet(); const { t } = useTranslation(); const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  if (!w) return null;
  return (
    <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-3 text-sm">
      <span className="flex items-center gap-2"><Coins className="h-4 w-4 text-amber-500" />{t("consult.balance")} <b data-testid="wallet-balance" className="tabular-nums">{Number(w.balance).toFixed(0)}</b></span>
      {/* dev-only shortcut; production builds always go through Wallet → payment */}
      {import.meta.env.DEV && w.dev_test_credits ? (
        <button data-testid="get-test-credits" disabled={busy} className="flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
          onClick={async () => { setBusy(true); const { error } = await supabase.rpc("dev_grant_test_credits"); setBusy(false);
            if (error) toast.error(error.message); else { toast.success(t("consult.creditsAdded")); qc.invalidateQueries({ queryKey: ["wallet"] }); } }}>
          <Sparkles className="h-3.5 w-3.5" />{t("consult.testCredits")}</button>
      ) : (
        <Link to="/wallet" data-testid="topup-link" className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{t("wallet.topUp")}</Link>)}
    </div>
  );
}

export function RequestSheet({ w, open, onOpenChange }: { w: SheetWorker; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation(); const { request } = useConsult(); const { data: wallet } = useWallet(); const [sending, setSending] = useState<Mode | null>(null);
  const available = w.is_online && !w.is_busy;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl" data-testid="request-sheet">
        <SheetHeader className="items-center text-center">
          <Avatar className="h-20 w-20 rounded-3xl">{w.photo_url && <AvatarImage src={w.photo_url} className="object-cover" />}
            <AvatarFallback className="rounded-3xl bg-primary/10 text-xl font-bold text-primary">{initials(w.display_name)}</AvatarFallback></Avatar>
          <SheetTitle className="flex items-center gap-1">{w.display_name}<BadgeCheck className="h-4 w-4 text-primary" /></SheetTitle>
          <SheetDescription>{w.spec}</SheetDescription>
          <span data-testid="sheet-status" className={`rounded-full px-3 py-1 text-xs font-semibold ${available ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
            {w.is_busy ? t("consult.busy") : w.is_online ? t("list.online") : t("list.offline")}</span>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <WalletChip />
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => { const r = w.rates?.[m]; const need = r ? r.rate * r.min_minutes : 0; const short = !!wallet && Number(wallet.balance) < need;
              return (
                <button key={m} data-testid={`req-${m}`} disabled={!available || !r || !!sending || short}
                  onClick={async () => { setSending(m); await request(w, m); setSending(null); onOpenChange(false); }}
                  className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${tint[m]} p-3 text-left text-white shadow-md transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0`}>
                  {sending === m ? <Loader2 className="h-5 w-5 animate-spin" /> : <ModeIcon mode={m} className="h-5 w-5" />}
                  <p className="mt-2 text-sm font-bold">{t(`consult.mode.${m}`)}</p>
                  <p className="text-[11px] opacity-90" data-testid={`rate-${m}`}>{r ? t("consult.perMin", { rate: r.rate }) : "—"}</p>
                  {r && <p className="text-[10px] opacity-75">{t("consult.minMin", { min: r.min_minutes })}</p>}
                </button>); })}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("consult.billingNote")}</p>
          {!location.pathname.startsWith("/w/") && <Link to={`/w/${w.id}`} data-testid="view-profile" className="block text-center text-sm font-semibold text-primary">{t("wprofile.view")}</Link>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
