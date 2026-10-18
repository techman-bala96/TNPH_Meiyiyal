import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellRing, Share, X } from "lucide-react";
import { toast } from "sonner";
import { usePushState } from "./api";
import { canAsk, enablePush, snoozeAsk, vapidPublicKey, type EnableResult } from "./webPush";

export type AskReason = "worker" | "client" | "admin";

/** Our own small card (in the page, never a pop-up over it). The browser prompt only appears after "Turn on alerts". */
export function PushAskCard({ reason, className = "" }: { reason: AskReason; className?: string }) {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const { support, enabled, loading, refresh } = usePushState();
  const [hidden, setHidden] = useState(() => !canAsk());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (support.supported) void vapidPublicKey(); }, [support.supported]); // warm the key so the tap goes straight to the prompt
  if (loading || enabled || hidden) return null;
  if (!support.needsInstall && (!support.supported || support.permission === "denied")) return null;

  const dismiss = () => { snoozeAsk(); setHidden(true); };
  const on = async () => {
    setBusy(true);
    let r: EnableResult = "unsupported";
    try { r = await enablePush(lang); } catch { r = "unsupported"; }
    setBusy(false);
    if (r === "on") { toast.success(t("push.turnedOn")); await refresh(); }
    else if (r === "denied") { toast(t("push.deniedHint")); await refresh(); }
    else if (r === "no_key") toast.error(t("push.noKey"));
    else toast.error(t("push.unsupported"));
  };

  if (support.needsInstall) return (
    <section data-testid="push-install-card" className={`card-soft relative space-y-2 p-4 animate-in fade-in ${className}`}>
      <button data-testid="push-ask-dismiss" aria-label={t("push.notNow")} onClick={dismiss} className="tap absolute right-1 top-1 grid w-10 place-items-center rounded-full text-muted-foreground"><X className="h-4 w-4" /></button>
      <p className="flex items-center gap-2 pr-8 font-semibold"><Share className="h-5 w-5 text-primary" />{t("push.installTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("push.installBody")}</p>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">
        {(["1", "2", "3"] as const).map((k) => <li key={k}>{t(`push.installStep${k}`)}</li>)}
      </ol>
    </section>
  );

  return (
    <section data-testid="push-ask-card" data-reason={reason} className={`card-soft relative overflow-hidden p-4 animate-in fade-in slide-in-from-bottom-2 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`push.askTitle.${reason}`)}</p>
          <p className="text-sm text-muted-foreground">{t(`push.askBody.${reason}`)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button data-testid="push-ask-allow" disabled={busy} onClick={on} className="tap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{t("push.allow")}</button>
            <button data-testid="push-ask-dismiss" onClick={dismiss} className="tap rounded-xl px-3 text-sm font-medium text-muted-foreground">{t("push.notNow")}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Worker is Online but this device has alerts off (after they said "Not now"). */
export function PushOffBanner() {
  const { t } = useTranslation(); const { support, enabled, loading } = usePushState();
  if (loading || enabled || !(support.supported || support.needsInstall) || canAsk()) return null;
  return <p data-testid="push-off-banner" className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t("push.offBanner")} <Link to="/settings" className="underline">{t("menu.settings")}</Link></p>;
}
