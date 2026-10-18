import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, Flag, ShieldBan, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RewardsGrid } from "./RewardsGrid";
import type { I18n } from "./types";
import type { Standing } from "./standing";

const reasonText = (r: string | null, t: (k: string, o?: Record<string, unknown>) => string) => {
  if (!r) return "";
  const [kind, v] = r.split(":");
  if (kind === "auto") return t("standing.autoReason", { n: parseInt(v) });
  if (kind === "complaint") return t("standing.complaintReason", { reason: t(`standing.reasons.${v}`, { defaultValue: v }) });
  if (kind === "low_rating") return t("standing.lowRating", { n: v });
  return r;
};
export function StandingBanners({ s }: { s: Standing }) {
  const { t } = useTranslation();
  return (<>
    {s.blocked && (
      <div data-testid="worker-blocked" className="flex gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 animate-in fade-in slide-in-from-top-1">
        <ShieldBan className="h-6 w-6 shrink-0 text-rose-600" />
        <div className="text-sm"><p className="font-semibold text-rose-700 dark:text-rose-300">{t("standing.blocked")}</p>
          <p data-testid="block-reason">{reasonText(s.block_reason, t)}</p>
          <p className="text-xs text-muted-foreground" data-testid="block-until">{t("standing.until", { date: new Date(s.blocked_until!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("standing.blockedHint")}</p></div>
      </div>)}
    {!s.blocked && s.flag_active && (
      <div data-testid="worker-flag" data-needed={s.flag_good_needed} className="flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 animate-in fade-in">
        <Flag className="h-6 w-6 shrink-0 text-amber-700" />
        <div className="text-sm"><p className="font-semibold text-amber-800 dark:text-amber-300">{t("standing.flagged")}</p>
          <p>{reasonText(s.flag_reason, t)}</p>
          <p className="text-xs text-muted-foreground">{t("standing.flagHint", { n: s.flag_good_needed, neg: s.negatives, max: s.block_negatives })}</p></div>
      </div>)}
  </>);
}
export function MyRewards({ s, name, profession }: { s: Standing; name: string; profession: I18n | null }) {
  const { t } = useTranslation(); const { user } = useAuth();
  if (!user) return null;
  return (
    <section className="card-soft space-y-3 p-4" data-testid="my-rewards">
      <div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 font-semibold"><Trophy className="h-4 w-4 text-amber-500" />{t("rewards.title")} · {s.rewards.length}</h3>
        <Link to={`/w/${s.worker_id}`} data-testid="view-public-profile" className="flex items-center gap-1 text-xs font-semibold text-primary">{t("wprofile.viewPublic")}<ExternalLink className="h-3 w-3" /></Link></div>
      <RewardsGrid rewards={s.rewards} name={name} profession={profession} />
    </section>
  );
}
