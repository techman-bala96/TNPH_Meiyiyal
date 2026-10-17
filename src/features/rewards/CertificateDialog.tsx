import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileDown, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { renderCertificate, toBlob, toPdf } from "./certificate";
import { tr, type Reward } from "./types";

const save = (b: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export function CertificateDialog({ reward, name, profession, open, onOpenChange }: { reward: Reward; name: string; profession: { en: string; ta?: string } | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<"en" | "ta">(i18n.language?.startsWith("ta") ? "ta" : "en");
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null); const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return; let alive = true; setUrl(null);
    void renderCertificate(reward, name, tr(profession, lang), lang).then((c) => { if (alive) { setCanvas(c); setUrl(c.toDataURL("image/png")); } });
    return () => { alive = false; };
  }, [open, lang, reward, name, profession]);
  const file = `Meiyiyal-${reward.cert_no ?? reward.slug}-${lang}`;
  const share = async () => {
    if (!canvas) return; const blob = await toBlob(canvas); const f = new File([blob], `${file}.png`, { type: "image/png" });
    const text = t("rewards.shareText", { name, title: tr(reward.title, lang) });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: tr(reward.title, lang), text }); } catch { /* cancelled */ } }
    else { await navigator.clipboard?.writeText(`${text} ${location.origin}/w/`).catch(() => undefined); save(blob, `${file}.png`); toast.success(t("rewards.shared")); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-4" data-testid="cert-dialog">
        <DialogTitle className="flex items-center justify-between pr-6">{tr(reward.title, lang)}
          <span className="flex rounded-full bg-muted p-0.5 text-xs font-semibold">
            {(["en", "ta"] as const).map((l) => <button key={l} data-testid={`cert-lang-${l}`} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 ${lang === l ? "bg-card shadow" : "text-muted-foreground"}`}>{l === "en" ? "EN" : "த"}</button>)}
          </span></DialogTitle>
        <DialogDescription className="sr-only">{t("rewards.certificate")}</DialogDescription>
        <div className="grid aspect-[1754/1240] place-items-center overflow-hidden rounded-xl border bg-muted">
          {url ? <img data-testid="cert-image" data-lang={lang} src={url} alt={t("rewards.certificate")} className="h-full w-full object-contain animate-in fade-in zoom-in-95" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
        <p className="text-center text-xs text-muted-foreground" data-testid="cert-no">{reward.cert_no}</p>
        <div className="grid grid-cols-3 gap-2">
          <button data-testid="cert-png" disabled={!canvas} onClick={async () => canvas && save(await toBlob(canvas), `${file}.png`)} className="flex items-center justify-center gap-1.5 rounded-xl bg-muted py-2.5 text-sm font-semibold"><Download className="h-4 w-4" />PNG</button>
          <button data-testid="cert-pdf" disabled={!canvas} onClick={async () => canvas && save(await toPdf(canvas), `${file}.pdf`)} className="flex items-center justify-center gap-1.5 rounded-xl bg-muted py-2.5 text-sm font-semibold"><FileDown className="h-4 w-4" />PDF</button>
          <button data-testid="cert-share" disabled={!canvas} onClick={share} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"><Share2 className="h-4 w-4" />{t("rewards.share")}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
