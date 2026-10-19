import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { PageShell, Section } from "@/components/app/PageShell";
import { WorkerBadge } from "@/components/app/WorkerBadge";
import { useProfile, useUpdateProfile, type Prefs } from "@/features/profile/useProfile";
import { PushSettings } from "@/features/push/PushSettings";
import { YourData } from "@/features/privacy/YourData";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: p } = useProfile(); const update = useUpdateProfile();
  const prefs: Prefs = p?.prefs ?? {};
  const savePrefs = (patch: Prefs) => update({ prefs: { ...prefs, ...patch } }).catch(() => undefined);
  const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const seg = "tap flex flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition";
  const on = "bg-card text-foreground shadow"; const off = "text-muted-foreground";

  return (
    <PageShell title={t("menu.settings")} testId="settings-page">
      <WorkerBadge />
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
        <PushSettings prefs={prefs} savePrefs={savePrefs} />
        <p className="mt-3 text-xs text-muted-foreground">{t("settings.notifyNote")}</p>
      </Section>
      <Section title={t("privacy.title")}>
        <YourData />
      </Section>
    </PageShell>
  );
}
