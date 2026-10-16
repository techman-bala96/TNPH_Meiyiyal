import { useTranslation } from "react-i18next";
/** EN | தமிழ். `compact` shows EN | த for tight headers (e.g. the map page). */
export function LangToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { i18n } = useTranslation();
  const ta = i18n.language?.startsWith("ta");
  return (
    <button data-testid="lang-toggle" onClick={() => i18n.changeLanguage(ta ? "en" : "ta")} aria-label={ta ? "Switch to English" : "தமிழுக்கு மாற்று"}
      className={`tap shrink-0 whitespace-nowrap rounded-full border bg-card font-medium ${compact ? "px-2.5 text-xs" : "px-3 text-sm"} ${className}`}>
      <span className={ta ? "text-muted-foreground" : "text-primary"}>EN</span>
      <span className="mx-1 text-muted-foreground">|</span>
      <span className={ta ? "text-primary" : "text-muted-foreground"}>{compact ? "த" : "தமிழ்"}</span>
    </button>
  );
}
