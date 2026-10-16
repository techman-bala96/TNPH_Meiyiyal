import { useTranslation } from "react-i18next";
export function LangToggle() {
  const { i18n } = useTranslation();
  const ta = i18n.language?.startsWith("ta");
  return (
    <button data-testid="lang-toggle" onClick={() => i18n.changeLanguage(ta ? "en" : "ta")}
      className="tap rounded-full border px-3 text-sm font-medium">
      <span className={ta ? "text-muted-foreground" : "text-primary"}>EN</span>
      <span className="mx-1 text-muted-foreground">|</span>
      <span className={ta ? "text-primary" : "text-muted-foreground"}>தமிழ்</span>
    </button>
  );
}
