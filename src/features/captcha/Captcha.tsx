import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { captchaConfig, MOCK_TOKEN_PREFIX, SCRIPTS } from "./provider";

type Widget = { render: (el: HTMLElement, o: Record<string, unknown>) => string | number; remove?: (id: string) => void };
declare global { interface Window { turnstile?: Widget; hcaptcha?: Widget } }

const loaded: Record<string, Promise<void>> = {};
function load(src: string) {
  return (loaded[src] ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.async = true; s.defer = true;
    s.onload = () => res(); s.onerror = () => rej(new Error("captcha script")); document.head.appendChild(s);
  }));
}

export const captchaEnabled = () => captchaConfig().provider !== "none";

/** Renders the configured challenge and reports a token (null when it expires). Remount (change `key`) after each use. */
export function Captcha({ onToken }: { onToken: (t: string | null) => void }) {
  const { t, i18n } = useTranslation(); const cfg = captchaConfig(); const box = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (cfg.provider !== "turnstile" && cfg.provider !== "hcaptcha") return;
    const kind = cfg.provider; let cancelled = false;
    load(SCRIPTS[kind]).then(() => {
      const w = window[kind]; if (cancelled || !w || !box.current) return;
      w.render(box.current, { sitekey: cfg.siteKey, language: i18n.language?.startsWith("ta") ? "ta" : "en", hl: i18n.language?.startsWith("ta") ? "ta" : "en",
        callback: (tok: string) => onToken(tok), "expired-callback": () => onToken(null), "error-callback": () => setFailed(true) });
    }, () => setFailed(true));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.provider, cfg.siteKey]);

  if (cfg.provider === "none") return null;
  if (cfg.provider === "mock") return (
    <button type="button" data-testid="captcha-mock" aria-pressed={done} onClick={() => { setDone(true); onToken(`${MOCK_TOKEN_PREFIX}${Date.now()}`); }}
      className="flex h-12 w-full items-center gap-3 rounded-xl border bg-card px-3 text-sm">
      <span className={`grid h-6 w-6 place-items-center rounded border ${done ? "border-primary bg-primary text-primary-foreground" : ""}`}>{done && <Check className="h-4 w-4" />}</span>
      {t("captcha.mock")}
    </button>);
  return <div data-testid={`captcha-${cfg.provider}`}><div ref={box} />{failed && <p role="alert" className="text-xs text-destructive">{t("captcha.failed")}</p>}</div>;
}
