import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { House, MessagesSquare, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const TABS = [
  { key: "home", to: "/", icon: House, match: (p: string) => p === "/" || p.startsWith("/browse") },
  { key: "conversations", to: "/history", icon: MessagesSquare, match: (p: string) => p.startsWith("/history") },
  { key: "profile", to: "/profile", icon: UserRound, match: (p: string) => ["/profile", "/wallet", "/settings", "/earnings"].some((x) => p.startsWith(x)) },
] as const;
// full-screen flows keep the whole viewport
const HIDDEN = [/^\/login/, /^\/auth/, /^\/location/, /^\/session\//, /^\/worker\/register/, /^\/admin/];

function useBottomNavVisible() {
  const { user } = useAuth(); const { pathname } = useLocation();
  return !!user && !HIDDEN.some((r) => r.test(pathname));
}

/** Mobile-first tab bar; on desktop the same bar floats under the centred app column. Safe-area aware. */
export function BottomNav() {
  const { t } = useTranslation(); const { pathname } = useLocation(); const visible = useBottomNavVisible();
  if (!visible) return null;
  const active = TABS.findIndex((x) => x.match(pathname));
  return (
    <>
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] md:h-24" />
      <nav data-testid="bottom-nav" data-bottom-nav aria-label={t("nav.label")}
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-300 md:bottom-4 md:rounded-3xl md:border md:shadow-xl">
        <div className="relative grid grid-cols-3">
          {active >= 0 && (
            <span aria-hidden className="absolute top-1.5 h-[calc(100%-0.75rem)] w-1/3 px-4 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ transform: `translateX(${active * 100}%)` }}>
              <span className="block h-full rounded-2xl bg-primary/10" />
            </span>)}
          {TABS.map((x, i) => { const on = i === active; const Icon = x.icon;
            return (
              <NavLink key={x.key} to={x.to} data-testid={`nav-${x.key}`} data-active={on} aria-current={on ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${on ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className={`h-5 w-5 transition-transform duration-300 ${on ? "-translate-y-0.5 scale-110" : ""}`} strokeWidth={on ? 2.4 : 2} />
                {t(`nav.${x.key}`)}
              </NavLink>); })}
        </div>
      </nav>
    </>
  );
}
