import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/app/PageShell";
import { grievanceOfficer, legalDoc, LEGAL_VERSION } from "@/features/legal/content";

export default function Legal({ kind }: { kind: "privacy" | "terms" }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ta") ? "ta" : "en";
  const doc = legalDoc(kind, lang); const g = grievanceOfficer();
  const other = kind === "privacy" ? "terms" : "privacy";
  return (
    <PageShell title={doc.title} testId={`legal-${kind}`} back={history.length > 1 ? "/settings" : "/login"}>
      <div role="note" data-testid="legal-draft" className="flex gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <p>{t("legal.draft")}</p>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("legal.updated", { date: doc.updated })} · {LEGAL_VERSION}</p>
      <article className="card-soft space-y-5 p-4 text-sm leading-relaxed">
        {doc.sections.map((s) => (
          <section key={s.h} className="space-y-1.5">
            <h2 className="font-semibold">{s.h}</h2>
            {s.p.length > 1 ? <ul className="list-disc space-y-1 pl-5">{s.p.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{s.p[0]}</p>}
          </section>
        ))}
        <section data-testid="grievance" className="space-y-1.5 rounded-xl bg-muted/60 p-3">
          <h2 className="font-semibold">{t("legal.grievance")}</h2>
          {g.name || g.email ? (
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              {g.name && <><dt className="text-muted-foreground">{t("legal.gName")}</dt><dd>{g.name}</dd></>}
              {g.email && <><dt className="text-muted-foreground">{t("legal.gEmail")}</dt><dd><a className="underline" href={`mailto:${g.email}`}>{g.email}</a></dd></>}
              {g.phone && <><dt className="text-muted-foreground">{t("legal.gPhone")}</dt><dd><a className="underline" href={`tel:${g.phone}`}>{g.phone}</a></dd></>}
              {g.address && <><dt className="text-muted-foreground">{t("legal.gAddress")}</dt><dd>{g.address}</dd></>}
            </dl>
          ) : <p data-testid="grievance-tba">{t("legal.tba")}</p>}
        </section>
      </article>
      <p className="px-1 text-center text-xs"><Link className="underline" to={`/${other}`}>{t(`legal.${other}`)}</Link></p>
    </PageShell>
  );
}
