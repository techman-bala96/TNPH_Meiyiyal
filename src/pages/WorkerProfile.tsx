import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Briefcase, CalendarDays, MapPin, MessageSquareText, ShieldCheck, Star, UserRoundX, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/app/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/features/profile/useProfile";
import { RewardsGrid } from "@/features/rewards/RewardsGrid";
import { RequestSheet } from "@/features/consult/RequestSheet";
import { useFeedbackConfig } from "@/features/feedback/api";
import { tr, type I18n, type Reward } from "@/features/rewards/types";
import type { Rates } from "@/features/consult/api";

type P = { id: string; display_name: string; photo_url: string | null; about: string | null; years_experience: number; specialty: I18n | null; category: I18n | null; district: I18n | null;
  is_online: boolean; is_busy: boolean; joined_at: string; rating: number; reviews: number; sessions_served: number; users_served: number; rates: Rates; council: string | null;
  badge_tier?: "licence" | "degree" | null; verified_at?: string | null;
  rewards: Reward[]; feedback: { rating: number; tags: string[]; comment: string | null; created_at: string; by_name: string }[] };

export default function WorkerProfile() {
  const { id = "" } = useParams(); const { t, i18n } = useTranslation(); const lang = i18n.language ?? "en";
  const q = useQuery({ queryKey: ["worker-public", id], queryFn: async () => { const { data, error } = await supabase.rpc("worker_public", { _id: id }); if (error) throw error; return data as unknown as P | null; } });
  const cfg = useFeedbackConfig(); const [open, setOpen] = useState(false);
  const tagName = (k: string) => { const all = [...(cfg.data?.tags.positive ?? []), ...(cfg.data?.tags.negative ?? [])]; const g = all.find((x) => x.key === k); return g ? tr(g, lang) : k; };
  const w = q.data;
  if (q.isLoading) return <PageShell title="" testId="worker-profile"><div className="h-60 animate-pulse rounded-3xl bg-muted" /></PageShell>;
  if (!w) return <PageShell title="" testId="worker-profile"><div data-testid="profile-unavailable" className="card-soft flex flex-col items-center gap-2 p-8 text-center"><UserRoundX className="h-10 w-10 text-muted-foreground" /><p className="font-semibold">{t("wprofile.unavailable")}</p></div></PageShell>;
  const yearsOn = Math.max(0, (Date.now() - new Date(w.joined_at).getTime()) / (365.25 * 864e5));
  const stats = [
    { icon: Star, label: t("wprofile.rating"), value: w.reviews ? Number(w.rating).toFixed(1) : t("list.new"), id: "stat-rating" },
    { icon: Users, label: t("wprofile.served"), value: w.users_served, id: "stat-served" },
    { icon: Briefcase, label: t("wprofile.experience"), value: t("list.yrs", { count: w.years_experience }), id: "stat-exp" },
    { icon: CalendarDays, label: t("wprofile.onPlatform"), value: yearsOn < 1 ? t("wprofile.newMember") : t("list.yrs", { count: Math.floor(yearsOn) }), id: "stat-platform" },
  ];
  return (
    <PageShell title={w.display_name} testId="worker-profile">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-teal-700 p-5 text-primary-foreground shadow-lg animate-in fade-in">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" /><div className="absolute -bottom-14 -left-6 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <div className="relative"><Avatar className="h-24 w-24 rounded-3xl ring-4 ring-white/30">{w.photo_url && <AvatarImage src={w.photo_url} className="object-cover" />}
            <AvatarFallback className="rounded-3xl bg-white/20 text-2xl font-bold">{initials(w.display_name)}</AvatarFallback></Avatar>
            {w.is_online && <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-400 ring-4 ring-primary" />}</div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1 text-xl font-bold" data-testid="wp-name">{w.display_name}<BadgeCheck className="h-5 w-5" /></h2>
            {w.badge_tier && <p data-testid="badge-tier" data-tier={w.badge_tier} className="text-xs font-semibold">{t(`worker.badge.${w.badge_tier}`)}</p>}
            {w.verified_at && <p data-testid="verified-on" className="text-xs opacity-80">{t("worker.verifiedOn", { date: new Date(w.verified_at).toLocaleDateString() })}</p>}
            <p className="text-sm opacity-90" data-testid="wp-specialty">{[tr(w.category, lang), tr(w.specialty, lang)].filter(Boolean).join(" · ")}</p>
            {w.district && <p className="mt-1 flex items-center gap-1 text-xs opacity-80"><MapPin className="h-3.5 w-3.5" />{tr(w.district, lang)}</p>}
            {w.council && <p className="mt-1 flex items-center gap-1 text-xs opacity-80"><ShieldCheck className="h-3.5 w-3.5" />{w.council}</p>}
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.id} className="card-soft flex flex-col items-center p-3 text-center">
            <s.icon className="h-5 w-5 text-primary" /><b data-testid={s.id} className="mt-1 text-lg">{s.value}</b><span className="text-[11px] text-muted-foreground">{s.label}</span></div>))}
      </div>
      <button data-testid="wp-consult" onClick={() => setOpen(true)} className="w-full rounded-2xl bg-primary py-3 font-semibold text-primary-foreground shadow-md transition active:scale-[.98]">
        {w.is_busy ? t("consult.busy") : w.is_online ? t("wprofile.consultNow") : t("wprofile.viewRates")}</button>
      <RequestSheet w={{ ...w, spec: tr(w.specialty, lang) }} open={open} onOpenChange={setOpen} />
      {w.about && <section className="card-soft p-4"><h3 className="mb-1 text-sm font-semibold">{t("wprofile.about")}</h3><p className="text-sm text-muted-foreground">{w.about}</p></section>}
      <section className="space-y-2"><h3 className="text-sm font-semibold">{t("rewards.title")} · {w.rewards.length}</h3>
        <RewardsGrid rewards={w.rewards} name={w.display_name} profession={w.specialty} /></section>
      <section className="space-y-2"><h3 className="flex items-center gap-1 text-sm font-semibold"><MessageSquareText className="h-4 w-4" />{t("wprofile.recent")} · {w.reviews}</h3>
        {w.feedback.length === 0 && <p className="text-sm text-muted-foreground">{t("wprofile.noReviews")}</p>}
        <ul className="space-y-2">{w.feedback.map((f, i) => (
          <li key={i} data-testid="wp-review" className="card-soft p-3 animate-in fade-in">
            <div className="flex items-center justify-between"><span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />)}</span>
              <span className="text-[11px] text-muted-foreground">{f.by_name} · {new Date(f.created_at).toLocaleDateString()}</span></div>
            {f.comment && <p className="mt-1 text-sm">{f.comment}</p>}
            {f.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{f.tags.map((g) => <span key={g} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{tagName(g)}</span>)}</div>}
          </li>))}</ul>
      </section>
    </PageShell>
  );
}
