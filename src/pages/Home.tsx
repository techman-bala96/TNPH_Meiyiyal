import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ChevronRight, UserRound } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { HomeHeader } from "@/components/app/HomeHeader";
import { childrenOf, nodeName, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { iconFor } from "@/features/taxonomy/icons";
import { THEMES, patternStyle } from "@/features/taxonomy/themes";

export default function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const tax = useTaxonomy();
  const [tab, setTab] = useState<"find" | "worker">("find");
  const all = tax.data ?? [];
  const groups = childrenOf(all, null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pb-8 pt-3">
      <HomeHeader />
      <div className="flex items-center justify-between"><Logo className="h-7" /></div>

      <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-muted p-1">
        {(["find", "worker"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
            className={`tap rounded-xl text-sm font-semibold transition ${tab === k ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
            {t(k === "find" ? "home.findWorker" : "home.worker")}
          </button>
        ))}
      </div>

      {tab === "find" ? (
        <section className="space-y-5" data-testid="find-panel">
          <h1 className="text-xl font-bold leading-tight">{t("home.headline")}</h1>
          {tax.isLoading && <div className="h-40 animate-pulse rounded-3xl bg-muted" />}
          {groups.map((g) => (
            <div key={g.slug} className="space-y-3">
              <Link to={`/browse/${g.slug}`} data-testid={`group-${g.slug}`} className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{nodeName(g, lang)}</h2>
                <span className="flex items-center text-xs font-medium text-primary">{t("browse.seeAll")}<ChevronRight className="h-4 w-4" /></span>
              </Link>
              <div className="grid gap-3">
                {childrenOf(all, g.slug).map((c) => {
                  const th = THEMES[c.slug.split("--").pop()!] ?? THEMES.default;
                  const Icon = iconFor(c.icon);
                  const subs = childrenOf(all, c.slug);
                  return (
                    <Link key={c.slug} to={`/browse/${c.slug}`} data-testid={`cat-${c.slug}`}
                      className={`relative overflow-hidden rounded-3xl p-4 shadow-md transition active:scale-[0.99] ${th.hero} ${th.ink}`}>
                      <div className="pointer-events-none absolute inset-0 opacity-90" style={patternStyle(th)} />
                      <Icon className="pointer-events-none absolute -bottom-4 -right-3 h-28 w-28 opacity-15" strokeWidth={1.25} />
                      <div className="relative flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Icon className="h-6 w-6" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-bold">{nodeName(c, lang)}</span>
                          <span className="block text-xs opacity-85">{t(th.taglineKey)}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 opacity-80" />
                      </div>
                      <div className="relative mt-3 flex flex-wrap gap-1.5">
                        {subs.slice(0, 3).map((s) => <span key={s.slug} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">{nodeName(s, lang)}</span>)}
                        {subs.length > 3 && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px]">+{subs.length - 3}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><BadgeCheck className="h-4 w-4 text-primary" />{t("home.verifiedNote")}</p>
        </section>
      ) : (
        <section data-testid="worker-panel" className="card-soft space-y-2 p-5 text-center">
          <UserRound className="mx-auto h-10 w-10 text-primary" />
          <h2 className="font-semibold">{t("home.workerTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("home.workerSoon")}</p>
        </section>
      )}

    </main>
  );
}
