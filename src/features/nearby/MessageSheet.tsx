import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mic, Send, ShieldCheck, Square, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/features/profile/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { WalletChip } from "@/features/consult/RequestSheet";
import { errText } from "./api";
import type { MsgTarget } from "./AutoSearchScreen";

const COST = 5; const MAX_S = 30; const MAX_CHARS = 300;

/** Paid message (text and/or ≤30 s voice note) to someone who didn't answer. Refunded if no reply in 24 h. */
export function MessageSheet({ target, onClose }: { target: MsgTarget | null; onClose: () => void }) {
  const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient();
  const [body, setBody] = useState(""); const [blob, setBlob] = useState<Blob | null>(null); const [secs, setSecs] = useState(0);
  const [rec, setRec] = useState(false); const [sending, setSending] = useState(false);
  const mr = useRef<MediaRecorder | null>(null); const timer = useRef<number | null>(null); const started = useRef(0);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (!target) { setBody(""); setBlob(null); setSecs(0); stop(); } }, [target]);

  function stop() { if (timer.current) window.clearInterval(timer.current); timer.current = null; if (mr.current && mr.current.state !== "inactive") mr.current.stop(); setRec(false); }
  async function record() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((x) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(x)) ?? "";
      const m = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const parts: Blob[] = [];
      m.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      m.onstop = () => { stream.getTracks().forEach((x) => x.stop()); setBlob(new Blob(parts, { type: (m.mimeType || "audio/webm").split(";")[0] })); setSecs(Math.max(1, Math.min(MAX_S, Math.round((Date.now() - started.current) / 1000)))); };
      mr.current = m; started.current = Date.now(); m.start(); setRec(true); setSecs(0); setBlob(null);
      timer.current = window.setInterval(() => { const s = Math.floor((Date.now() - started.current) / 1000); setSecs(s); if (s >= MAX_S) stop(); }, 250);
    } catch { toast.error(t("nearby.msg.noMic")); }
  }
  async function send() {
    if (!target || !user) return; setSending(true);
    try {
      let path: string | null = null;
      if (blob) {
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("voice-notes").upload(path, blob, { contentType: blob.type || "audio/webm" });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.rpc("worker_message_send", { _worker: target.id, _body: body.trim() || null, _voice_path: path, _voice_seconds: blob ? secs : null });
      if (error) throw error;
      toast.success(t("nearby.msg.sent")); qc.invalidateQueries({ queryKey: ["wallet"] }); qc.invalidateQueries({ queryKey: ["worker-messages"] }); onClose();
    } catch (e) { toast.error(errText(e as { message?: string })); } finally { setSending(false); }
  }
  const tooLong = body.length > MAX_CHARS; const can = (body.trim().length > 0 || !!blob) && !tooLong && !rec && !sending;
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="z-[110] mx-auto max-w-lg rounded-t-3xl" data-testid="message-sheet">
        {target && <>
          <SheetHeader className="flex-row items-center gap-3 space-y-0 text-left">
            <Avatar className="h-12 w-12">{target.photo_url && <AvatarImage src={target.photo_url} className="object-cover" />}<AvatarFallback className="bg-primary/10 text-primary">{initials(target.display_name)}</AvatarFallback></Avatar>
            <div><SheetTitle>{t("nearby.msg.title", { name: target.display_name })}</SheetTitle><SheetDescription>{t("nearby.msg.sub")}</SheetDescription></div>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="relative">
              <textarea data-testid="message-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={MAX_CHARS + 50} placeholder={t("nearby.msg.placeholder")}
                className="w-full resize-none rounded-2xl border bg-background p-3 pb-6 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <span className={`absolute bottom-2 right-3 text-[10px] tabular-nums ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>{body.length}/{MAX_CHARS}</span>
            </div>
            {tooLong && <p className="text-xs text-destructive">{t("nearby.msg.tooLong")}</p>}
            <div className="flex items-center gap-2">
              {!rec ? <button type="button" data-testid="voice-record" onClick={() => void record()} className="flex h-10 items-center gap-2 rounded-xl bg-muted px-3 text-sm font-semibold hover:bg-muted/70"><Mic className="h-4 w-4 text-rose-500" />{t("nearby.msg.record")}</button>
                : <button type="button" data-testid="voice-stop" onClick={stop} className="flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-3 text-sm font-semibold text-white"><Square className="h-4 w-4" />{t("nearby.msg.stop")} · {t("nearby.msg.recording", { s: secs })}</button>}
              {blob && url && !rec && <><audio data-testid="voice-preview" src={url} controls className="h-10 min-w-0 flex-1" />
                <button type="button" aria-label={t("nearby.msg.delete")} onClick={() => { setBlob(null); setSecs(0); }} className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /></button></>}
            </div>
            <WalletChip />
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("nearby.msg.cost", { n: COST })} {t("nearby.msg.privacy")}</p>
            <button type="button" data-testid="message-send" disabled={!can} onClick={() => void send()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-semibold text-primary-foreground shadow-md transition active:scale-[.98] disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t("nearby.msg.send", { n: COST })}</button>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}
