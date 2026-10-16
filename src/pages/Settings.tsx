import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageShell, Section } from "@/components/app/PageShell";
import { useProfile, useUpdateProfile, type Prefs } from "@/features/profile/useProfile";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: p } = useProfile(); const update = useUpdateProfile();
  const prefs: Prefs = p?.prefs ?? {};
  const savePrefs = (patch: Prefs) => update({ prefs: { ...prefs, ...patch } }).catch(() => undefined);
  const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const seg = "tap flex flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition";
  const on = "bg-card text-foreground shadow"; const off = "text-muted-foreground";
  const notify = prefs.notify ?? { requests: true, chat: true, promos: false };

  return (
    <PageShell title={t("menu.settings")} testId="settings-page">
      <Section title={t("settings.language")}>
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {(["en", "ta"] as const).map((l) => (
            <button key={l} data-testid={`lang-${l}`} aria-pressed={lang === l} className={`${seg} ${lang === l ? on : off}`}
              onClick={() => { i18n.changeLanguage(l); savePrefs({ lang: l }); }}>{l === "en" ? "English" : "தமிழ்"}</button>
          ))}
        </div>
      </Section>
      <Section title={t("settings.theme")}>
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {([["light", Sun], ["dark", Moon], ["system", Monitor]] as const).map(([k, Icon]) => (
            <button key={k} data-testid={`theme-${k}`} aria-pressed={theme === k} className={`${seg} ${theme === k ? on : off}`}
              onClick={() => { setTheme(k); savePrefs({ theme: k }); }}><Icon className="h-4 w-4" />{t(`settings.${k}`)}</button>
          ))}
        </div>
      </Section>
      <Section title={t("settings.notifications")}>
        <ul className="divide-y">
          {(["requests", "chat", "promos"] as const).map((k) => (
            <li key={k} className="flex min-h-12 items-center justify-between gap-3">
              <span className="text-sm">{t(`settings.notify.${k}`)}</span>
              <Switch data-testid={`notify-${k}`} checked={!!notify[k]} onCheckedChange={(v) => savePrefs({ notify: { ...notify, [k]: v } })} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("settings.notifyNote")}</p>
      </Section>
    </PageShell>
  );
}
