import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Lock } from "lucide-react";
import { nodeName, pathTo, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { iconFor } from "@/features/taxonomy/icons";
import { patternStyle, themeFor } from "@/features/taxonomy/themes";
import { useMyWorker } from "@/features/worker/api";

/** Worker profession/status card (Profile + Settings), from the worker record. */
export function WorkerBadge() {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const { data: w } = useMyWorker(); const tax = useTaxonomy();
  if (!w?.primary_node) return null;
  const path = pathTo(tax.data ?? [], w.primary_node); const th = themeFor(path);
  const cat = path.find((n) => n.kind === "category"); const Icon = iconFor(cat?.icon);
  return (
    <Link to="/?tab=worker" data-testid="worker-badge" data-status={w.status} className={`relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 ${th.hero} ${th.ink}`}>
      <div className="pointer-events-none absolute inset-0" style={patternStyle(th)} />
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15"><Icon className="h-5 w-5" /></span>
      <span className="relative min-w-0 flex-1">
        <span data-testid="worker-badge-profession" className="flex items-center gap-1 font-semibold">{cat && nodeName(cat, lang)}{w.locked_category && <Lock className="h-3.5 w-3.5 opacity-80" aria-label={t("worker.locked")} />}</span>
        <span className="block truncate text-xs opacity-90">{path.slice(2).map((n) => nodeName(n, lang)).join(" › ")}</span>
        <span data-testid="worker-badge-status" className="mt-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">{t(`worker.status.${w.status}`)}</span>
      </span>
      <ChevronRight className="relative h-4 w-4 opacity-80" />
    </Link>
  );
}
