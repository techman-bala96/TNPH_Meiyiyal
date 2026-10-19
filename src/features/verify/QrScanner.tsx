import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ClipboardPaste, ImageUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { decodeCanvas, decodeFile } from "./qrDecode";

type Mode = "camera" | "image" | "paste";
const hasCamera = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Aadhaar QR input: live camera scan, photo upload, or paste. Calls onChange with the decoded text. */
export function QrScanner({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(hasCamera() ? "camera" : "image");
  const [msg, setMsg] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (mode !== "camera") return;
    let stream: MediaStream | null = null; let stop = false; let timer = 0;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stop) return;
        const v = video.current!; v.srcObject = stream; await v.play().catch(() => undefined);
        setMsg(t("worker.qrScanning"));
        const tick = async () => {
          if (stop) return;
          if (v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            canvas.getContext("2d")!.drawImage(v, 0, 0);
            const hit = await decodeCanvas(canvas);
            if (hit) { onChange(hit); setMsg(t("worker.qrFound")); setMode("paste"); return; }
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setMsg(t("worker.qrNoCamera")); setMode("image");
      }
    })();
    return () => { stop = true; window.clearTimeout(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [mode, onChange, t]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const hit = await decodeFile(f).catch(() => null);
    if (hit) { onChange(hit); setMsg(t("worker.qrFound")); setMode("paste"); } else setMsg(t("worker.qrImageFail"));
  }

  const tab = (m: Mode, icon: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={mode === m} data-testid={`reg-qr-mode-${m}`} onClick={() => { setMsg(null); setMode(m); }}
      disabled={m === "camera" && !hasCamera()}
      className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
      {icon}{t(`worker.qrMode.${m}`)}
    </button>
  );

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("worker.qrLabel")} className="flex gap-1 rounded-xl bg-muted p-1">
        {tab("camera", <Camera className="h-4 w-4" />)}{tab("image", <ImageUp className="h-4 w-4" />)}{tab("paste", <ClipboardPaste className="h-4 w-4" />)}
      </div>
      {mode === "camera" && (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
          <video ref={video} data-testid="reg-qr-video" muted playsInline className="h-full w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />
        </div>
      )}
      {mode === "image" && (
        <label className="card-soft flex cursor-pointer items-center justify-between gap-3 p-4 text-sm">
          <span className="flex items-center gap-2"><ImageUp className="h-5 w-5 text-primary" />{t("worker.qrImagePick")}</span>
          <input data-testid="reg-qr-image" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      {mode === "paste" && (
        <div className="space-y-1.5">
          <label htmlFor="qr" className="text-sm font-medium">{t("worker.qrLabel")}</label>
          <Textarea id="qr" data-testid="reg-qr" value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="rounded-xl font-mono text-xs" placeholder={t("worker.qrPlaceholder")} />
        </div>
      )}
      {msg && <p role="status" data-testid="reg-qr-msg" className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
