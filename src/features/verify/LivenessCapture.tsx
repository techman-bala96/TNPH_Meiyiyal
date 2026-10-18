import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Camera, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type LivenessResult = { portrait: File };
type Challenge = { nonce: string; steps: string[]; expires_in: number };
const FRAMES_PER_STEP = 3;
const FRAME_GAP_MS = 450;
const LEAD_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Active liveness: the server issues a nonce and 3 random actions. For each action we show the prompt,
 * wait a beat, then grab a few frames. Frames go to the private kyc bucket; the verify service decides
 * (LIVENESS_PROVIDER). The last neutral frame becomes the consented portrait candidate.
 */
export function LivenessCapture({ userId, onDone, onNoCamera }: { userId: string; onDone: (r: LivenessResult) => void; onNoCamera: () => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "uploading" | "done" | "error">("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => { stream.current?.getTracks().forEach((tr) => tr.stop()); }, []);

  async function grab(): Promise<Blob> {
    const v = video.current!;
    const c = document.createElement("canvas");
    const w = Math.min(640, v.videoWidth || 640); const h = Math.round(w * ((v.videoHeight || 480) / (v.videoWidth || 640)));
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("frame"))), "image/jpeg", 0.85));
  }

  async function start() {
    setErr(null); setPreview(null); setStepIdx(0);
    if (!navigator.mediaDevices?.getUserMedia) { onNoCamera(); return; }
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
    } catch { onNoCamera(); return; }
    const v = video.current!; v.srcObject = stream.current; await v.play().catch(() => undefined);
    const { data, error } = await supabase.rpc("verification_liveness_start");
    if (error || !data) { setErr(error?.message ?? "error"); setPhase("error"); return; }
    const c = data as unknown as Challenge; setCh(c); setPhase("running");
    const shots: { step: string; blob: Blob }[] = [];
    try {
      for (let i = 0; i < c.steps.length; i++) {
        setStepIdx(i);
        await sleep(LEAD_MS);
        for (let k = 0; k < FRAMES_PER_STEP; k++) { shots.push({ step: c.steps[i], blob: await grab() }); await sleep(FRAME_GAP_MS); }
      }
      setStepIdx(c.steps.length);
      await sleep(600);
      const portrait = await grab();
      setPhase("uploading");
      const frames: { step: string; path: string }[] = [];
      for (let i = 0; i < shots.length; i++) {
        const path = `${userId}/live-${c.nonce}-${shots[i].step}-${i}.jpg`;
        const up = await supabase.storage.from("kyc").upload(path, shots[i].blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        frames.push({ step: shots[i].step, path });
      }
      const st = await supabase.rpc("verification_stage_liveness", { _nonce: c.nonce, _frames: frames });
      if (st.error) throw st.error;
      const file = new File([portrait], "portrait.jpg", { type: "image/jpeg" });
      setPreview(URL.createObjectURL(portrait));
      setPhase("done");
      stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null;
      onDone({ portrait: file });
    } catch (e) {
      const m = (e as Error).message || "";
      setErr(m.includes("expired") ? t("worker.liveExpired") : m); setPhase("error");
    }
  }

  const step = ch && stepIdx < ch.steps.length ? ch.steps[stepIdx] : null;
  return (
    <div className="space-y-3" data-testid="reg-live" data-phase={phase}>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl bg-muted">
        {preview ? <img src={preview} alt={t("worker.livePortrait")} className="h-full w-full object-cover" />
          : <video ref={video} data-testid="reg-live-video" muted playsInline className="h-full w-full -scale-x-100 object-cover" />}
        {phase === "idle" && !preview && <div className="absolute inset-0 flex items-center justify-center"><Camera className="h-10 w-10 text-muted-foreground" /></div>}
        <div aria-hidden className="pointer-events-none absolute inset-x-8 inset-y-10 rounded-[50%] border-2 border-white/70" />
      </div>
      <p role="status" aria-live="polite" data-testid="reg-liveness" hidden={phase === "idle"} className="min-h-[2.75rem] rounded-xl bg-primary/10 p-3 text-center text-sm font-semibold text-primary">
        {phase === "running" && step && ch ? t("worker.liveStep", { n: stepIdx + 1, total: ch.steps.length, challenge: t(`worker.challenge.${step}`) })
          : phase === "running" ? t("worker.livePortrait")
          : phase === "uploading" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          : phase === "done" ? <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4" />{t("worker.liveDone")}</span>
          : null}
      </p>
      {err && <p data-testid="reg-live-error" className="text-sm text-destructive">{err}</p>}
      {(phase === "idle" || phase === "error") && (
        <Button data-testid="reg-live-start" type="button" className="tap w-full rounded-xl" onClick={start}>
          {phase === "error" ? <><RotateCcw className="mr-2 h-4 w-4" />{t("worker.liveRetry")}</> : <><Camera className="mr-2 h-4 w-4" />{t("worker.liveStart")}</>}
        </Button>
      )}
      {phase !== "running" && phase !== "uploading" && (
        <button type="button" data-testid="reg-live-upload-instead" className="w-full text-center text-xs text-muted-foreground underline" onClick={onNoCamera}>{t("worker.liveUseUpload")}</button>
      )}
    </div>
  );
}
