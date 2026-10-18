import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, MapPin } from "lucide-react";
import { UserMenu } from "@/components/app/UserMenu";
import { LangToggle } from "@/components/app/LangToggle";
import { MicButton } from "@/features/voice/MicButton";
import { NotificationBell } from "@/features/push/NotificationBell";
import { placeLabel, useCurrentLocation } from "@/features/location/useCurrentLocation";

/** Location chip + language toggle, shared by Home and Browse. */
export function HomeHeader({ from = "/" }: { from?: string }) {
  const { t, i18n } = useTranslation();
  const { data: loc } = useCurrentLocation();
  return (
    <header className="flex items-center justify-between gap-2">
      <Link to="/location" state={{ from }} data-testid="loc-chip" className="tap flex min-w-0 flex-1 items-center gap-1.5">
        <MapPin className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0"><span className="block text-[11px] leading-none text-muted-foreground">{t("location.deliverTo")}</span>
          <span data-testid="loc-chip-label" className="flex items-center gap-0.5 truncate text-sm font-semibold">{placeLabel(loc ?? null, !!i18n.language?.startsWith("ta"))}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden /></span></span>
        <span className="sr-only"> · {t("location.change")}</span>
      </Link>
      <MicButton />
      <LangToggle compact />
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
