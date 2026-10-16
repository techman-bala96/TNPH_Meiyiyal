import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

export function PageShell({ title, children, back = "/", testId }: { title: string; children: ReactNode; back?: string; testId?: string }) {
  const nav = useNavigate(); const { t } = useTranslation();
  return (
    <main data-testid={testId} className="mx-auto flex min-h-dvh max-w-md flex-col pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-background/90 px-3 py-2 backdrop-blur">
        <button data-testid="page-back" aria-label={t("auth.back")} onClick={() => nav(back)} className="tap grid w-11 place-items-center rounded-full"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold">{title}</h1>
      </header>
      <div className="space-y-4 px-4">{children}</div>
    </main>
  );
}
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>}
      <div className="card-soft p-4">{children}</div>
    </section>
  );
}
