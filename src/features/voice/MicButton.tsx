import { useTranslation } from "react-i18next";
import { Mic } from "lucide-react";
import { useVoice } from "./context";

export function MicButton() {
  const { state, toggle, enabled } = useVoice(); const { t } = useTranslation();
  if (!enabled) return null;
  const on = state !== "off";
  return (
    <button data-testid="mic-toggle" data-on={on} onClick={toggle} aria-pressed={on} aria-label={on ? t("voice.off") : t("voice.on")}
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-90 ${on ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "bg-muted text-foreground hover:bg-muted/70"}`}>
      {on && <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/30" />}
      <Mic className="relative h-5 w-5" />
    </button>
  );
}
