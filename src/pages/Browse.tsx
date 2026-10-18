import { Fragment } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, House } from "lucide-react";
import { WorkerList } from "@/components/app/WorkerList";
import { HomeHeader } from "@/components/app/HomeHeader";
import { SearchBar } from "@/features/nearby/SearchBar";
import { childrenOf, nodeName, pathTo, useTaxonomy, type TaxNode } from "@/features/taxonomy/useTaxonomy";
import { iconFor } from "@/features/taxonomy/icons";
import { patternStyle, themeFor } from "@/features/taxonomy/themes";
import { placeLabel, useCurrentLocation } from "@/features/location/useCurrentLocation";

export default function Browse() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const nav = useNavigate();
  const tax = useTaxonomy();
  const { data: loc } = useCurrentLocation(); const [sp] = useSearchParams();
  const all = tax.data ?? [];
  const node = all.find((n) => n.slug === slug);
  if (tax.isLoading) return <main className="mx-auto max-w-md p-4 md:max-w-3xl lg:max-w-5xl"><div className="h-40 animate-pulse rounded-3xl bg-muted" /></main>;
  if (!node) return <Navigate to="/" replace />;

  const path = pathTo(all, slug);
  const kids = childrenOf(all, slug);
  const th = themeFor(path);
  const HeroIcon = iconFor(node.icon ?? path.find((p) => p.icon && p.kind === "category")?.icon);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const leaf = kids.length === 0;
  const where = placeLabel(loc ?? null, lang === "ta");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-8 md:max-w-3xl lg:max-w-5xl">
      <div className="space-y-3 px-4 pt-3"><HomeHeader from={`/browse/${slug}`} /><SearchBar compact /></div>

      <section data-testid="browse-hero" data-theme={th.key} className={`relative mx-3 mt-3 overflow-hidden rounded-3xl p-4 shadow-md ${th.hero} ${th.ink}`}>
        <div className="pointer-events-none absolute inset-0" style={patternStyle(th)} />
        <HeroIcon className="pointer-events-none absolute -bottom-6 -right-4 h-32 w-32 opacity-15" strokeWidth={1.25} />
        <div className="relative flex items-center gap-2">
          <button data-testid="browse-back" aria-label={t("auth.back")} onClick={() => nav(parent ? `/browse/${parent.slug}` : "/")}
            className="tap -ml-1 grid w-10 place-items-center rounded-full bg-white/15"><ArrowLeft className="h-5 w-5" /></button>
          <nav ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }} aria-label="breadcrumb" data-testid="breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs opacity-90 [scrollbar-width:none]">
            <Link to="/" aria-label={t("browse.home")} className="shrink-0"><House className="h-3.5 w-3.5" /></Link>
            {path.map((p, i) => (
              <Fragment key={p.slug}>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                {i === path.length - 1
                  ? <span data-testid="crumb-current" className="font-semibold">{nodeName(p, lang)}</span>
                  : <Link to={`/browse/${p.slug}`} data-testid={`crumb-${p.slug}`} className="underline-offset-2 hover:underline">{nodeName(p, lang)}</Link>}
              </Fragment>
            ))}
          </nav>
        </div>
        <div className="relative mt-4 flex items-end gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur"><HeroIcon className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h1 data-testid="browse-title" className="text-2xl font-bold leading-tight">{nodeName(node, lang)}</h1>
            <p className="text-xs opacity-85">{leaf ? t("browse.near", { place: where }) : t(path.length <= 1 ? "browse.pickProfession" : th.taglineKey)}</p>
          </div>
        </div>
      </section>

      <div className="space-y-5 px-4 pt-4">
        {!leaf && (sp.get("list") !== "1" && (kids.some((k) => childrenOf(all, k.slug).length > 0) || node.kind !== "subcategory")
          ? <TileGrid kids={kids} all={all} tile={th.tile} ring={th.ring} lang={lang} />
          : <ChipList kids={kids} accent={th.accent} lang={lang} />)}
        {(node.kind === "subcategory" || node.kind === "specialty" || sp.get("list") === "1") && <WorkerList key={slug} node={slug} nodeLabel={nodeName(node, lang)} tile={th.tile} where={where} />}
      </div>
    </main>
  );
}

function TileGrid({ kids, all, tile, ring, lang }: { kids: TaxNode[]; all: TaxNode[]; tile: string; ring: string; lang: string }) {
  const { t } = useTranslation();
  return (
    <ul data-testid="node-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {kids.map((k) => {
        const Icon = iconFor(k.icon); const n = childrenOf(all, k.slug).length;
        return (
          <li key={k.slug}>
            <Link to={`/browse/${k.slug}`} data-testid={`node-${k.slug}`}
              className={`card-soft flex h-full min-h-28 flex-col gap-2 p-3 ring-1 ring-transparent transition active:scale-[0.98] ${ring}`}>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${tile}`}><Icon className="h-5 w-5" /></span>
              <span className="text-sm font-semibold leading-snug">{nodeName(k, lang)}</span>
              {n > 0 && <span className="mt-auto text-[11px] text-muted-foreground">{t("browse.options", { count: n })}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ChipList({ kids, accent, lang }: { kids: TaxNode[]; accent: string; lang: string }) {
  return (
    <ul data-testid="node-list" className="card-soft divide-y">
      {kids.map((k) => (
        <li key={k.slug}>
          <Link to={`/browse/${k.slug}`} data-testid={`node-${k.slug}`} className="tap flex items-center gap-3 px-4 text-sm font-medium">
            <span className={`h-2 w-2 rounded-full bg-current ${accent}`} /><span className="flex-1">{nodeName(k, lang)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
