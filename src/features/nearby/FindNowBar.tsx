import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Loader2, Radar, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ModeIcon } from "@/features/consult/ConsultProvider";
import { useConsult } from "@/features/consult/context";
import type { Mode, Rates } from "@/features/consult/api";
import { useNearbyPrefs } from "./api";
import { ModeSheet } from "./ModeSheet";

/** Rapido-style "Find now": rings the nearest available professionals one by one, server-side. */
export function FindNowBar({ node, nodeLabel, lat, lng, available, rates }: { node: string; nodeLabel: string; lat: number; lng: number; available: number; rates?: Rates }) {
  const { t } = useTranslation(); const prefs = useNearbyPrefs(); const { startSearch } = useConsult();
  const [sheet, setSheet] = useState<null | "start" | "change">(null); const [busy, setBusy] = useState(false);
  const go = async (mode: Mode) => { setBusy(true); try { await startSearch({ node, nodeLabel, mode, lat, lng }); } finally { setBusy(false); } };
  const find = () => { if (!prefs.mode) setSheet("start"); else void go(prefs.mode); };
  return (
    <section data-testid="find-now-bar" data-auto={prefs.auto} className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30"><Zap className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{t("nearby.auto.title")}</p>
          <p className="text-xs text-muted-foreground">{prefs.auto ? t("nearby.auto.sub", { name: nodeLabel }) : t("nearby.auto.offHint")}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold">
          <span className="hidden sm:inline">{t("nearby.auto.toggle")}</span>
          <Switch data-testid="auto-toggle" checked={prefs.auto} disabled={!prefs.ready} onCheckedChange={(v) => void prefs.save({ auto_request: v })} aria-label={t("nearby.auto.toggle")} />
        </label>
      </div>
      {prefs.auto && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <span data-testid="available-count" className={`flex items-center gap-1.5 text-xs font-medium ${available ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${available ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`} />
            {available ? t("nearby.auto.availableCount", { count: available }) : t("nearby.auto.noneAvailable")}</span>
          <div className="ml-auto flex items-center gap-2">
            {prefs.mode && <button type="button" data-testid="mode-pill" onClick={() => setSheet("change")} aria-label={t("nearby.auto.change")}
              className="flex h-10 items-center gap-1 rounded-xl bg-muted px-3 text-xs font-semibold transition hover:bg-muted/70"><ModeIcon mode={prefs.mode} className="h-4 w-4" />{t(`consult.mode.${prefs.mode}`)}<ChevronDown className="h-3.5 w-3.5" /></button>}
            <button type="button" data-testid="find-now" onClick={find} disabled={busy || available === 0}
              className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}{t("nearby.auto.findNow")}</button>
          </div>
        </div>)}
      <ModeSheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)} initial={prefs.mode} rates={rates}
        onPick={(m) => { const start = sheet === "start"; setSheet(null); void prefs.save({ consult_mode: m }); if (start) void go(m); }} />
    </section>
  );
}
