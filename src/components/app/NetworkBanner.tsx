import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

/** Slim bar while the phone has no network; a short "back online" toast when it returns. Screens reload their data on "online". */
export function NetworkBanner() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => { setOnline(true); toast.success(t("net.back"), { id: "net" }); };
    const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [t]);
  if (online) return null;
  return (
    <div data-testid="net-offline" role="status" aria-live="polite"
      className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-amber-950 shadow pt-[max(0.375rem,env(safe-area-inset-top))]">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />{t("net.offline")}
    </div>
  );
}
