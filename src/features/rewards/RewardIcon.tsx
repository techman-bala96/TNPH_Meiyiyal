import { Award, BadgeCheck, Crown, Flame, Gem, Medal, Sparkles, Star, Trophy, Users, type LucideIcon } from "lucide-react";
import { color, tr, type Reward } from "./types";
const ICONS: Record<string, LucideIcon> = { sparkles: Sparkles, star: Star, users: Users, flame: Flame, trophy: Trophy, medal: Medal, crown: Crown, gem: Gem, "badge-check": BadgeCheck, award: Award };
export function RewardIcon({ icon, className }: { icon: string; className?: string }) { const I = ICONS[icon] ?? Award; return <I className={className} />; }
export function BadgeRow({ badges, lang, max = 3 }: { badges: Reward[]; lang: string; max?: number }) {
  if (!badges?.length) return null;
  return (
    <span className="flex items-center gap-1" data-testid="card-badges">
      {badges.slice(0, max).map((b) => (
        <span key={b.slug} title={tr(b.title, lang)} data-testid="card-badge" data-slug={b.slug} className={`grid h-5 w-5 place-items-center rounded-full ${color(b.color).bg} ${color(b.color).fg}`}>
          <RewardIcon icon={b.icon} className="h-3 w-3" /></span>))}
      {badges.length > max && <span className="text-[10px] text-muted-foreground">+{badges.length - max}</span>}
    </span>
  );
}
