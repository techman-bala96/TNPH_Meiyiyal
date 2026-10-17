import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, FileWarning, Hourglass, Power, ShieldAlert, UserRoundPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { nodeName, pathTo, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { patternStyle, themeFor } from "@/features/taxonomy/themes";
import { useMyWorker } from "@/features/worker/api";
import { MyRewards, StandingBanners } from "@/features/rewards/WorkerStanding";
import { useStanding } from "@/features/rewards/standing";

export function WorkerPanel() {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const { data: w, isLoading } = useMyWorker(); const { data: standing } = useStanding(); const tax = useTaxonomy(); const qc = useQueryClient();
  if (isLoading) return <div className="h-40 animate-pulse rounded-3xl bg-muted" />;

  if (!w || (w.status === "draft" && !w.primary_node)) return (
    <section data-testid="worker-panel" className="card-soft space-y-3 p-5 text-center animate-in fade-in">
      <UserRoundPlus className="mx-auto h-10 w-10 text-primary" />
      <h2 className="text-lg font-bold">{t("home.workerTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("worker.pitch")}</p>
      <Link to="/worker/register" data-testid="btn-register-worker" className="tap inline-flex w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">{t("worker.start")}</Link>
    </section>
  );

  const path = pathTo(tax.data ?? [], w.primary_node); const th = themeFor(path);
  const meta: Record<string, { icon: typeof Clock; tone: string }> = {
    draft: { icon: FileWarning, tone: "text-amber-600" }, pending: { icon: Hourglass, tone: "text-amber-600" }, needs_info: { icon: FileWarning, tone: "text-amber-600" },
    approved: { icon: BadgeCheck, tone: "text-primary" }, rejected: { icon: ShieldAlert, tone: "text-destructive" }, blocked: { icon: ShieldAlert, tone: "text-destructive" },
  };
  const M = meta[w.status];
  const blocked = !!standing?.blocked;
  async function toggle(on: boolean) {
    const { error } = await supabase.rpc("worker_set_online", { _online: on });
    if (error) toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["my-worker"] }); await qc.invalidateQueries({ queryKey: ["standing"] });
  }
  return (
    <section data-testid="worker-panel" className="space-y-3 animate-in fade-in">
      <div className={`relative overflow-hidden rounded-3xl p-4 shadow-md ${th.hero} ${th.ink}`}>
        <div className="pointer-events-none absolute inset-0" style={patternStyle(th)} />
        <p className="relative text-lg font-bold">{w.display_name}</p>
        <p className="relative text-sm opacity-90">{path.slice(1).map((n) => nodeName(n, lang)).join(" › ")}</p>
      </div>
      <div className="card-soft flex items-start gap-3 p-4">
        <M.icon className={`h-6 w-6 shrink-0 ${M.tone}`} />
        <div className="min-w-0 flex-1">
          <p data-testid="worker-status" data-status={w.status} className="font-semibold">{t(`worker.status.${w.status}`)}</p>
          <p className="text-sm text-muted-foreground">{t(`worker.statusHint.${w.status}`)}</p>
          {w.review_note && w.status !== "approved" && <p data-testid="review-note" className="mt-2 rounded-lg bg-muted p-2 text-sm">{w.review_note}</p>}
          {(w.status === "draft" || w.status === "needs_info" || w.status === "rejected") && w.status !== "rejected" && (
            <Link to="/worker/register" data-testid="btn-continue-reg" className="mt-2 inline-block text-sm font-semibold text-primary">{t("worker.continue")}</Link>)}
        </div>
      </div>
      {standing && <StandingBanners s={standing} />}
      <div className={`card-soft flex items-center gap-3 p-4 transition ${w.status === "approved" && !blocked ? "" : "opacity-50"}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${w.is_online ? "bg-emerald-500 text-white shadow-[0_0_0_6px_rgba(16,185,129,.18)]" : "bg-muted text-muted-foreground"} transition`}><Power className="h-5 w-5" /></span>
        <div className="flex-1"><p className="font-semibold">{t(w.is_online ? "worker.online" : "worker.goOnline")}</p>
          <p className="text-xs text-muted-foreground">{t(w.status === "approved" ? "worker.onlineHint" : "worker.lockedHint")}</p></div>
        <Switch data-testid="go-online" checked={w.is_online && !blocked} disabled={w.status !== "approved" || blocked} onCheckedChange={toggle} aria-label={t("worker.goOnline")} />
      </div>
      {w.status === "approved" && standing && <MyRewards s={standing} name={w.display_name} profession={tax.data?.find((n) => n.slug === w.primary_node)?.name ?? null} />}
    </section>
  );
}
