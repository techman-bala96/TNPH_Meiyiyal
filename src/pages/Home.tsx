import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import { LangToggle } from "@/components/app/LangToggle";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { ChevronDown, MapPin } from "lucide-react";
import { placeLabel, useCurrentLocation } from "@/features/location/useCurrentLocation";

/** Temporary post-login screen. Location + Find Worker/Worker tabs come in the next gated step. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const { data: loc } = useCurrentLocation();
  const { user, signOut } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/location" state={{ from: "/" }} data-testid="loc-chip" aria-label={t("location.change")} className="tap flex min-w-0 flex-1 items-center gap-1.5">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0"><span className="block text-[11px] leading-none text-muted-foreground">{t("location.deliverTo")}</span>
            <span data-testid="loc-chip-label" className="flex items-center gap-0.5 truncate text-sm font-semibold">{placeLabel(loc ?? null, !!i18n.language?.startsWith("ta"))}<ChevronDown className="h-4 w-4 shrink-0" /></span></span>
        </Link>
        <LangToggle />
      </header>
      <Logo className="h-8 self-start" />
      <section className="card-soft p-5">
        <p className="text-sm text-muted-foreground">{t("auth.signedInAs")}</p>
        <p data-testid="signed-in-as" className="text-lg font-semibold break-all">{user?.email || user?.phone}</p>
        <Button data-testid="btn-signout" variant="outline" className="tap mt-4 rounded-xl" onClick={signOut}>{t("auth.signOut")}</Button>
      </section>
    </main>
  );
}
