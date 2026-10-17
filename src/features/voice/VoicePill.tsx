import { useTranslation } from "react-i18next";
import { Mic, Sparkles, Volume2, X } from "lucide-react";
import type { AgentResult } from "./agent";
import type { VoiceState } from "./context";

function Bars() {
  return <span className="flex h-5 items-end gap-0.5" aria-hidden>{[0, 1, 2, 3, 4].map((i) => (
    <span key={i} className="w-1 rounded-full bg-current animate-[voicebar_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.12}s`, height: "40%" }} />))}</span>;
}

export function VoicePill({ state, interim, heard, result, error, lang, onClose, onChoose }:
  { state: VoiceState; interim: string; heard: string; result: AgentResult | null; error: string | null; lang: "en" | "ta"; onClose: () => void; onChoose: (label: string) => void }) {
  const { t } = useTranslation();
  const q = result?.action === "ask" ? result.question : null;
  const reply = q ? q.text[lang] : result?.reply[lang];
  const tone = state === "listening" ? "from-rose-500 to-pink-500" : state === "thinking" ? "from-violet-500 to-indigo-500" : state === "speaking" ? "from-emerald-500 to-teal-500" : "from-slate-500 to-slate-600";
  return (
    <div data-testid="voice-pill" data-state={state} className="fixed inset-x-3 bottom-4 z-[80] mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4">
      <div className="overflow-hidden rounded-3xl border bg-card/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 p-3">
          <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${tone} text-white shadow-lg transition-colors duration-500`}>
            {state === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />}
            {state === "listening" ? <Bars /> : state === "thinking" ? <Sparkles className="h-5 w-5 animate-pulse" /> : state === "speaking" ? <Volume2 className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p data-testid="voice-status" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`voice.state.${state}`)}</p>
            <p data-testid="voice-transcript" className="truncate text-sm">
              {interim ? <span className="text-muted-foreground">{interim}…</span> : heard ? <>“{heard}”</> : <span className="text-muted-foreground">{t("voice.hint")}</span>}
            </p>
          </div>
          <button data-testid="voice-close" onClick={onClose} aria-label={t("voice.off")} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {state === "thinking" && <div className="h-0.5 w-full overflow-hidden bg-muted"><div className="h-full w-1/3 animate-[shimmer_1.1s_ease-in-out_infinite] bg-gradient-to-r from-violet-500 to-indigo-500" /></div>}
        {(reply || error) && state !== "thinking" && (
          <div className="space-y-2 border-t px-4 py-3 animate-in fade-in slide-in-from-bottom-1">
            {error ? <p data-testid="voice-error" className="text-sm text-destructive">{t(`voice.err.${error}`, { defaultValue: t("voice.err.generic") })}</p>
              : <p data-testid="voice-reply" data-action={result?.action} className="text-sm font-medium">{reply}</p>}
            {q && <div className="flex flex-wrap gap-1.5" data-testid="voice-options">
              {q.options.map((o, i) => (
                <button key={o.value} data-testid="voice-option" data-value={o.value} onClick={() => onChoose(o.label.en)} style={{ animationDelay: `${i * 40}ms` }}
                  className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition hover:border-primary hover:text-primary animate-in fade-in zoom-in-95 fill-mode-both">{o.label[lang]}</button>))}
            </div>}
          </div>)}
      </div>
    </div>
  );
}
