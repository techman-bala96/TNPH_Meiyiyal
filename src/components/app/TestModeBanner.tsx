import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { TEST_MODE, TEST_MODE_HTML_CLASS } from "@/lib/testMode";

/** VITE_TEST_MODE=true builds only: a slim, non-dismissable bar on every screen. The page, sticky headers and the
 *  session pill are pushed down by html.test-mode (index.css), so the bar never covers a header or the bottom nav. */
export function TestModeBanner({ on = TEST_MODE }: { on?: boolean }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!on) return;
    document.documentElement.classList.add(TEST_MODE_HTML_CLASS);
    return () => document.documentElement.classList.remove(TEST_MODE_HTML_CLASS);
  }, [on]);
  if (!on) return null;
  return (
    <div data-testid="test-mode-banner" role="note" title={t("testMode.banner")}
      className="test-mode-bar fixed inset-x-0 top-0 z-[65] flex items-end justify-center bg-violet-700 px-3 text-center text-[11px] font-semibold text-white shadow-sm pt-[env(safe-area-inset-top)]">
      <span className="flex h-6 min-w-0 items-center gap-1.5"><FlaskConical aria-hidden className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{t("testMode.banner")}</span></span>
    </div>
  );
}
