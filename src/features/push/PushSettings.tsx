import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, Moon, Send } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useIsAdmin } from "@/features/worker/api";
import type { NotifyPrefs, Prefs } from "@/features/profile/useProfile";
import { usePushState } from "./api";
import { disablePush, enablePush, kickPush } from "./webPush";
import { QUIET_DEFAULT, quietNow } from "./text";

const CATS = ["requests", "chat", "money", "account", "promos"] as const;
const notifyDefaults = (n: NotifyPrefs | undefined): Required<Omit<NotifyPrefs, "quiet">> => ({
  requests: n?.requests ?? true, chat: n?.chat ?? true, money: n?.money ?? true, account: n?.account ?? true, promos: n?.promos ?? false, admin: n?.admin ?? true,
});

/** Settings → Notifications: this device, categories, quiet hours, test. */
export function PushSettings({ prefs, savePrefs }: { prefs: Prefs; savePrefs: (p: Prefs) => void }) {
  const { t, i18n } = useTranslation(); const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const { support, enabled, refresh } = usePushState(); const admin = useIsAdmin();
  const cfg = useQuery({ queryKey: ["push-config"], queryFn: async () => (await supabase.rpc("push_config")).data as unknown as { mock: boolean } | null });
  const [busy, setBusy] = useState(false);
  const n = notifyDefaults(prefs.notify);
  const quiet = { ...QUIET_DEFAULT, ...(prefs.notify?.quiet ?? {}) };
  const setNotify = (patch: Partial<NotifyPrefs>) => savePrefs({ notify: { ...(prefs.notify ?? {}), ...n, quiet, ...patch } });
  const cats = admin.data ? [...CATS, "admin" as const] : CATS;

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush(lang).catch(() => "unsupported" as const);
    setBusy(false); await refresh();
    if (r === "on") toast.success(t("push.turnedOn"));
    else if (r === "denied") toast(t("push.deniedHint"));
    else if (r === "no_key") toast.error(t("push.noKey"));
    else if (r !== "install") toast.error(t("push.unsupported"));
  };
  const turnOff = async () => { setBusy(true); await disablePush().catch(() => undefined); setBusy(false); await refresh(); toast(t("push.turnedOff")); };
  const test = async () => {
    const { error } = await supabase.rpc("push_test");
    if (error) { toast.error(error.message); return; }
    void kickPush(); toast.success(t("push.testSent"));
  };

  let status: string; let tone = "text-muted-foreground";
  if (support.needsInstall) status = t("push.installBody");
  else if (!support.supported) status = t("push.unsupported");
  else if (support.permission === "denied") { status = t("push.deniedHint"); tone = "text-destructive"; }
  else if (enabled) { status = t("push.on"); tone = "text-primary"; }
  else status = t("push.statusOff");

  return (
    <div className="space-y-4" data-testid="push-settings">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{enabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p data-testid="push-status" data-enabled={enabled} className={`text-sm font-medium ${tone}`}>{status}</p>
          {support.needsInstall && <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">{(["1", "2", "3"] as const).map((k) => <li key={k}>{t(`push.installStep${k}`)}</li>)}</ol>}
          <div className="mt-2 flex flex-wrap gap-2">
            {support.supported && !enabled && support.permission !== "denied" && <button data-testid="push-turn-on" disabled={busy} onClick={turnOn} className="tap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{t("push.turnOn")}</button>}
            {enabled && <button data-testid="push-turn-off" disabled={busy} onClick={turnOff} className="tap rounded-xl border px-3 text-sm font-medium">{t("push.turnOff")}</button>}
            <button data-testid="push-test" onClick={test} className="tap flex items-center gap-1.5 rounded-xl border px-3 text-sm font-medium"><Send className="h-4 w-4" />{t("push.test")}</button>
          </div>
          {cfg.data?.mock && <p data-testid="push-mock-note" className="mt-2 text-[11px] text-muted-foreground">{t("push.mockNote")}</p>}
        </div>
      </div>

      <ul className="divide-y border-t">
        {cats.map((k) => (
          <li key={k} className="flex min-h-12 items-center justify-between gap-3">
            <span className="text-sm">{t(`settings.notify.${k}`)}</span>
            <Switch data-testid={`notify-${k}`} checked={!!n[k]} onCheckedChange={(v) => setNotify({ [k]: v })} aria-label={t(`settings.notify.${k}`)} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("push.alwaysNote")}</p>

      <div className="space-y-2 border-t pt-3">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm"><Moon className="h-4 w-4 text-muted-foreground" />{t("push.quiet")}
            {quiet.on && quietNow(quiet) && <span data-testid="quiet-now" className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{t("push.quietNow")}</span>}</span>
          <Switch data-testid="quiet-on" checked={quiet.on} onCheckedChange={(v) => setNotify({ quiet: { ...quiet, on: v } })} aria-label={t("push.quiet")} />
        </div>
        {quiet.on && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex flex-1 items-center gap-2">{t("push.from")}
              <input data-testid="quiet-from" type="time" value={quiet.from} onChange={(e) => e.target.value && setNotify({ quiet: { ...quiet, from: e.target.value } })} className="min-h-10 flex-1 rounded-xl border bg-background px-2" /></label>
            <label className="flex flex-1 items-center gap-2">{t("push.to")}
              <input data-testid="quiet-to" type="time" value={quiet.to} onChange={(e) => e.target.value && setNotify({ quiet: { ...quiet, to: e.target.value } })} className="min-h-10 flex-1 rounded-xl border bg-background px-2" /></label>
          </div>)}
        <p className="text-xs text-muted-foreground">{t("push.quietHint")}</p>
      </div>
    </div>
  );
}
