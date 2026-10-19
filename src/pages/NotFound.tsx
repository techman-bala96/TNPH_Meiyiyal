import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { LangToggle } from "@/components/app/LangToggle";

/** Unknown address: say so (a silent redirect hides broken links), offer the way home. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <main data-testid="not-found" className="mx-auto grid min-h-dvh max-w-md place-items-center p-6 text-center">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><Logo /><LangToggle /></div>
        <Compass className="mx-auto h-14 w-14 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFound.body")}</p>
        <Link to="/" data-testid="not-found-home" className="tap inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{t("notFound.home")}</Link>
      </div>
    </main>
  );
}
