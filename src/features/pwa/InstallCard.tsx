import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "meiyiyal-install-dismissed";
let deferred: BIPEvent | null = null;
// Chrome/Edge/Samsung fire this once per page load; keep it even if Home is not mounted yet.
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event("meiyiyal:installable")); });

/** "Add Meiyiyal to your phone" card on Home. Hidden once installed, when the browser can't install, or for 30 days after "Not now". */
export function InstallCard() {
  const { t } = useTranslation();
  const [can, setCan] = useState(!!deferred);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setCan(true); const done = () => { deferred = null; setCan(false); };
    window.addEventListener("meiyiyal:installable", on); window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("meiyiyal:installable", on); window.removeEventListener("appinstalled", done); };
  }, []);
  const dismissed = Number(localStorage.getItem(KEY) ?? 0) > Date.now() - 30 * 86400_000;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  if (!can || dismissed || standalone || hidden) return null;
  const install = async () => {
    const e = deferred; if (!e) return;
    await e.prompt();
    const c = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    deferred = null; setHidden(true);
    if (c.outcome === "dismissed") localStorage.setItem(KEY, String(Date.now()));
  };
  return (
    <div data-testid="install-card" className="card-soft flex items-center gap-3 p-3">
      <Download className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t("pwa.title")}</p><p className="text-xs text-muted-foreground">{t("pwa.body")}</p></div>
      <button data-testid="install-go" onClick={install} className="tap rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">{t("pwa.install")}</button>
      <button data-testid="install-later" aria-label={t("pwa.later")} onClick={() => { localStorage.setItem(KEY, String(Date.now())); setHidden(true); }}
        className="tap grid w-9 place-items-center rounded-full text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
