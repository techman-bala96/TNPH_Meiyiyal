import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RewardIcon } from "./RewardIcon";
import { CertificateDialog } from "./CertificateDialog";
import { color, tr, type I18n, type Reward } from "./types";

export function RewardsGrid({ rewards, name, profession }: { rewards: Reward[]; name: string; profession: I18n | null }) {
  const { t, i18n } = useTranslation(); const [open, setOpen] = useState<Reward | null>(null);
  if (!rewards.length) return <p data-testid="rewards-empty" className="text-sm text-muted-foreground">{t("rewards.none")}</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rewards.map((r, i) => (
          <li key={r.slug} style={{ animationDelay: `${i * 60}ms` }} className="animate-in fade-in zoom-in-95 fill-mode-both">
            <button data-testid="reward" data-slug={r.slug} onClick={() => setOpen(r)} className="group flex w-full flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 text-center transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className={`grid h-12 w-12 place-items-center rounded-full ${color(r.color).bg} ${color(r.color).fg} transition group-hover:scale-110 group-hover:rotate-6`}><RewardIcon icon={r.icon} className="h-6 w-6" /></span>
              <span className="text-xs font-semibold leading-tight">{tr(r.title, i18n.language)}</span>
              <span className="text-[10px] text-primary">{t("rewards.viewCert")}</span>
            </button>
          </li>))}
      </ul>
      {open && <CertificateDialog reward={open} name={name} profession={profession} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />}
    </>
  );
}
