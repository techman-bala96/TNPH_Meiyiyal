import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellOff, CheckCircle2, Clock, Mail, Mic, Undo2, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/app/PageShell";
import { initials } from "@/features/profile/useProfile";
import { errText, useMyMessages, type WorkerMessage } from "@/features/nearby/api";

const STATUS_STYLE: Record<WorkerMessage["status"], string> = {
  sent: "bg-amber-500/15 text-amber-700 dark:text-amber-300", read: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  responded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", refunded: "bg-muted text-muted-foreground" };

/** Paid messages: users see what they sent and when it's refunded; workers can say "I'm available now" or mute. */
export default function Messages() {
  const { t } = useTranslation(); const q = useMyMessages(); const rows = q.data ?? [];
  const received = rows.filter((r) => r.role === "worker"); const sent = rows.filter((r) => r.role === "user");
  const [tab, setTab] = useState<"received" | "sent">("sent");
  useEffect(() => { if (q.data) setTab(received.length && !sent.length ? "received" : sent.length ? "sent" : received.length ? "received" : "sent"); }, [q.data?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = tab === "received" ? received : sent; const both = received.length > 0 && sent.length > 0;
  return (
    <PageShell title={t("nearby.messages.title")} back="/history" testId="messages-page">
      {both && (
        <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-muted p-1">
          {(["sent", "received"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`msgs-tab-${k}`} onClick={() => setTab(k)}
            className={`tap rounded-xl text-sm font-semibold transition ${tab === k ? "bg-card shadow" : "text-muted-foreground"}`}>{t(`nearby.messages.${k}`)}</button>)}
        </div>)}
      {q.isLoading && [0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
      {!q.isLoading && list.length === 0 && (
        <div data-testid="messages-empty" className="card-soft flex flex-col items-center gap-2 p-8 text-center">
          <Mail className="h-10 w-10 text-muted-foreground" /><p className="font-semibold">{t("nearby.messages.empty")}</p>
          <p className="text-sm text-muted-foreground">{t("nearby.messages.emptyWorker")}</p></div>)}
      <ul className="space-y-2">{list.map((m, i) => <Row key={m.id} m={m} i={i} />)}</ul>
    </PageShell>
  );
}

function Row({ m, i }: { m: WorkerMessage; i: number }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [audio, setAudio] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (m.voice_path) void supabase.storage.from("voice-notes").createSignedUrl(m.voice_path, 3600).then(({ data }) => setAudio(data?.signedUrl ?? null)); }, [m.voice_path]);
  useEffect(() => { if (m.role === "worker" && m.status === "sent") void supabase.rpc("worker_message_read", { _id: m.id }); }, [m.id, m.role, m.status]);
  const ready = m.role === "user" && m.status === "responded" && m.reserved_until && new Date(m.reserved_until).getTime() > Date.now();
  const act = async (fn: "worker_message_respond" | "worker_mute_user") => {
    setBusy(true); const { error } = await supabase.rpc(fn, fn === "worker_mute_user" ? { _message: m.id } : { _id: m.id }); setBusy(false);
    if (error) toast.error(errText(error)); else { if (fn === "worker_message_respond") toast.success(t("nearby.messages.respondedToast")); qc.invalidateQueries({ queryKey: ["worker-messages"] }); qc.invalidateQueries({ queryKey: ["my-worker"] }); }
  };
  return (
    <li data-testid="message-row" data-status={m.status} data-role={m.role} style={{ animationDelay: `${i * 40}ms` }} className="card-soft space-y-2 p-3 animate-in fade-in slide-in-from-bottom-2 fill-mode-both">
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11 rounded-2xl">{m.other_photo && <AvatarImage src={m.other_photo} className="object-cover" />}<AvatarFallback className="rounded-2xl bg-primary/10 text-primary">{initials(m.other_name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.other_name}</p>
          <p className="text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}{m.role === "user" ? ` · ${Number(m.credits)} cr` : ""}</p></div>
        <span data-testid="message-status" className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[m.status]}`}>{t(`nearby.messages.status.${m.status}`)}</span>
      </div>
      {m.body && <p className="whitespace-pre-wrap break-words rounded-2xl bg-muted/50 px-3 py-2 text-sm">{m.body}</p>}
      {m.voice_path && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mic className="h-4 w-4 text-rose-500" />{t("nearby.messages.voice", { s: m.voice_seconds ?? 0 })}
        {audio && <audio data-testid="message-audio" src={audio} controls className="h-9 min-w-0 flex-1" />}</div>}
      {m.role === "user" && m.refund_at && m.status !== "responded" && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Undo2 className="h-3.5 w-3.5" />{t("nearby.messages.refundOn", { date: new Date(m.refund_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) })}</p>}
      {ready && <Link to={`/w/${m.worker_id}?connect=1`} data-testid="message-connect" className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md ring-4 ring-emerald-500/20 transition hover:bg-emerald-700">
        <Zap className="h-4 w-4" />{t("nearby.messages.ready", { name: m.other_name })} · {t("nearby.messages.connect")}</Link>}
      {m.role === "worker" && (m.status === "sent" || m.status === "read") && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button data-testid="message-respond" disabled={busy} onClick={() => void act("worker_message_respond")} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md active:scale-95 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{t("nearby.messages.available")}</button>
          <button data-testid="message-mute" disabled={busy || m.muted} onClick={() => void act("worker_mute_user")} className="flex h-10 items-center gap-1.5 rounded-xl bg-muted px-3 text-sm font-semibold disabled:opacity-50"><BellOff className="h-4 w-4" />{m.muted ? t("nearby.messages.muted") : t("nearby.messages.mute")}</button>
        </div>)}
      {m.role === "worker" && m.status === "responded" && m.reserved_until && new Date(m.reserved_until).getTime() > Date.now() && <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300"><Clock className="h-3.5 w-3.5" />{t("nearby.messages.respondedToast")}</p>}
    </li>
  );
}
