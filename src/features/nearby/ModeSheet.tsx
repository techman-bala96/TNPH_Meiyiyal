import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ModeIcon } from "@/features/consult/ConsultProvider";
import type { Mode, Rates } from "@/features/consult/api";

const MODES: Mode[] = ["chat", "voice", "video"];
const tint: Record<Mode, string> = { chat: "from-sky-500 to-cyan-500", voice: "from-emerald-500 to-teal-500", video: "from-violet-500 to-fuchsia-500" };

/** Asked once (default Chat), then remembered in the profile. */
export function ModeSheet({ open, onOpenChange, initial, rates, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; initial: Mode | null; rates?: Rates; onPick: (m: Mode) => void }) {
  const { t } = useTranslation(); const [m, setM] = useState<Mode>(initial ?? "chat");
  useEffect(() => { if (open) setM(initial ?? "chat"); }, [open, initial]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-3xl" data-testid="mode-sheet">
        <SheetHeader className="text-left"><SheetTitle>{t("nearby.auto.modeTitle")}</SheetTitle><SheetDescription>{t("nearby.auto.modeSub")}</SheetDescription></SheetHeader>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup">
          {MODES.map((x) => { const r = rates?.[x]; const on = x === m;
            return (
              <button key={x} type="button" role="radio" aria-checked={on} data-testid={`mode-${x}`} onClick={() => setM(x)}
                className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition active:scale-[.98] sm:flex-col sm:items-start ${on ? "border-primary bg-primary/5" : "border-transparent bg-muted/60"}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${tint[x]} text-white`}><ModeIcon mode={x} className="h-5 w-5" /></span>
                <span className="flex-1"><b className="block text-sm">{t(`consult.mode.${x}`)}</b>{r && <span className="text-xs text-muted-foreground">{t("consult.perMin", { rate: r.rate })} · {t("consult.minMin", { min: r.min_minutes })}</span>}</span>
                {on && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
              </button>); })}
        </div>
        <button type="button" data-testid="mode-confirm" onClick={() => onPick(m)} className="mt-4 w-full rounded-2xl bg-primary py-3 font-semibold text-primary-foreground shadow-md transition active:scale-[.98]">
          {t("nearby.auto.modeConfirm", { mode: t(`consult.mode.${m}`) })}</button>
      </SheetContent>
    </Sheet>
  );
}
