import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import { LangToggle } from "@/components/app/LangToggle";
import { useAuth } from "@/hooks/useAuth";

/** Temporary post-login screen. Location + Find Worker/Worker tabs come in the next gated step. */
export default function Home() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between"><Logo className="h-8" /><LangToggle /></header>
      <section className="card-soft p-5">
        <p className="text-sm text-muted-foreground">{t("auth.signedInAs")}</p>
        <p data-testid="signed-in-as" className="text-lg font-semibold break-all">{user?.email || user?.phone}</p>
        <Button data-testid="btn-signout" variant="outline" className="tap mt-4 rounded-xl" onClick={signOut}>{t("auth.signOut")}</Button>
      </section>
    </main>
  );
}
