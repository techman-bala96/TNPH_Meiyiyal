import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Coins, FileText, Loader2, Paperclip, PauseCircle, Phone, PhoneOff, Radar, RotateCcw, Send, Undo2, Video, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { initials } from "@/features/profile/useProfile";
import type { Call, Message, Mode, SessionInfo } from "@/features/consult/api";
import { ModeIcon } from "@/features/consult/ConsultProvider";
import { CallView } from "@/features/consult/CallView";
import { startRing, stopRing } from "@/features/consult/ringtone";
import { FeedbackCard } from "@/features/feedback/FeedbackCard";
import { useConsult } from "@/features/consult/context";
import { useCurrentLocation } from "@/features/location/useCurrentLocation";
import type { SessionState } from "@/features/nearby/api";

type Info = SessionInfo & { worker_id?: string; ended_by?: "me" | "other" | null; refunded?: number; reconnect_until?: string | null };
const RESUME_MIN = 3;

const fmt = (x: number) => { const s = Math.max(0, x); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
const MAX = 20 * 1024 * 1024;

export default function Session() {
  const { id = "" } = useParams(); const { user } = useAuth(); const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const nav = useNavigate(); const qc = useQueryClient();
  const info = useQuery({ queryKey: ["session", id], queryFn: async () => { const { data, error } = await supabase.rpc("session_info", { _sid: id }); if (error) throw error; return data as unknown as Info; } });
  const { request, startSearch } = useConsult(); const { data: here } = useCurrentLocation();
  const s = info.data;
  const [msgs, setMsgs] = useState<Message[]>([]); const [calls, setCalls] = useState<Call[]>([]);
  const [meter, setMeter] = useState<SessionState | null>(null);
  const [now, setNow] = useState(Date.now()); const [text, setText] = useState(""); const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null);

  // realtime: messages, calls, session row
  useEffect(() => {
    void supabase.from("consult_messages").select("*").eq("session_id", id).order("created_at").then(({ data }) => setMsgs((data ?? []) as unknown as Message[]));
    void supabase.from("session_calls").select("*").eq("session_id", id).order("created_at").then(({ data }) => setCalls((data ?? []) as unknown as Call[]));
    const ch = supabase.channel(`session:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "consult_messages", filter: `session_id=eq.${id}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message])))
      .on("postgres_changes", { event: "*", schema: "public", table: "session_calls", filter: `session_id=eq.${id}` }, (p) => {
        const c = p.new as Call; setCalls((cs) => [...cs.filter((x) => x.id !== c.id), c]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consult_sessions", filter: `id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["session", id] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [id, qc]);

  // metering tick (server-authoritative, idempotent)
  const active = s?.status === "active";
  const tickRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    if (!active) return;
    const tick = tickRef.current = async () => {
      const { data } = await supabase.rpc("session_tick", { _sid: id });
      if (data) { const d = data as unknown as SessionState;
        setMeter(d); if (d.status !== "active") qc.invalidateQueries({ queryKey: ["session", id] }); }
    };
    // every 10 s: tells the server this side is here (a silent side for 30 s pauses billing), and bills
    void tick(); const a = setInterval(tick, 10_000);
    const vis = () => { if (document.visibilityState === "visible") void tick(); }; document.addEventListener("visibilitychange", vis); const b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener("visibilitychange", vis); };
  }, [active, id, qc]);
  useEffect(() => { if (s?.status === "ended") qc.invalidateQueries({ queryKey: ["wallet"] }); }, [s?.status, qc]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const live = useMemo(() => [...calls].reverse().find((c) => c.status === "ringing" || c.status === "active"), [calls]);
  const ringingIn = live?.status === "ringing" && live.caller !== user?.id; const ringingOut = live?.status === "ringing" && live.caller === user?.id;
  useEffect(() => { if (active) void tickRef.current(); }, [active, live?.id, live?.status]);
  useEffect(() => { if (ringingIn) startRing("incoming"); else if (ringingOut) startRing("outgoing"); else stopRing(); return () => stopRing(); }, [ringingIn, ringingOut, live?.id]);
  useEffect(() => { // caller gives up after 45s
    if (!ringingOut || !live) return; const tm = setTimeout(() => void supabase.rpc("call_end", { _call: live.id }).then(), 45_000); return () => clearTimeout(tm);
  }, [ringingOut, live]);

  if (info.isError) return <div className="p-8 text-center"><p>{t("consult.notFound")}</p><Link to="/" className="text-primary">{t("consult.home")}</Link></div>;
  if (!s || !user) return <div className="grid h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const elapsed = fmt(((s.ended_at ? new Date(s.ended_at).getTime() : now) - new Date(s.started_at).getTime()) / 1000);
  const used = Math.max(Number(s.credits_used), active ? Number(meter?.credits_used ?? 0) : 0);
  const prof = s.node_name ? (ta && s.node_name.ta) || s.node_name.en : "";
  const paused = active && !!meter?.paused;
  const lowBal = s.role === "user" && meter?.minutes_left != null && meter.minutes_left <= 2 && active && !paused;
  const resumeLeft = paused && meter?.paused_at ? Math.max(0, RESUME_MIN * 60 - (now - new Date(meter.paused_at).getTime()) / 1000) : 0;
  const answer = async (yes: boolean) => { const { data, error } = await supabase.rpc("session_resume_answer", { _sid: id, _yes: yes });
    if (error) toast.error(error.message); else { setMeter(data as unknown as SessionState); qc.invalidateQueries({ queryKey: ["session", id] }); } };
  const reconnectUntil = s.reconnect_until ? new Date(s.reconnect_until).getTime() : 0; const canReconnect = s.role === "user" && reconnectUntil > now && !!s.worker_id;
  const target = { id: s.worker_id ?? "", display_name: s.other.name, photo_url: s.other.photo, spec: prof, node: s.node_slug };
  const reason = s.end_reason ?? "";

  const send = async () => {
    const body = text.trim(); if (!body) return; setText("");
    const { error } = await supabase.from("consult_messages").insert({ session_id: id, sender: user.id, body, kind: "text" });
    if (error) { toast.error(error.message); setText(body); }
  };
  const upload = async (f: File) => {
    if (f.size > MAX) { toast.error(t("consult.tooBig")); return; }
    setUploading(true);
    const path = `${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from("consult-files").upload(path, f, { contentType: f.type || "application/octet-stream" });
    if (up.error) { setUploading(false); toast.error(up.error.message); return; }
    const { error } = await supabase.from("consult_messages").insert({ session_id: id, sender: user.id, kind: "file", file_path: path, file_name: f.name, mime: f.type, size_bytes: f.size });
    setUploading(false); if (error) toast.error(error.message);
  };
  const startCall = async (m: "voice" | "video") => { const { error } = await supabase.rpc("call_start", { _sid: id, _mode: m }); if (error) toast.error(error.message); };
  const end = async () => { const { error } = await supabase.rpc("session_end", { _sid: id }); if (error) toast.error(error.message); qc.invalidateQueries({ queryKey: ["session", id] }); };

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col bg-background" data-testid="session-page" data-status={s.status}>
      <header className="flex items-center gap-3 border-b bg-card/80 px-3 py-2.5 backdrop-blur">
        <button onClick={() => nav(-1)} aria-label="back" className="rounded-full p-1.5 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <Avatar className="h-10 w-10">{s.other.photo && <AvatarImage src={s.other.photo} className="object-cover" />}<AvatarFallback className="bg-primary/10 text-primary">{initials(s.other.name)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold" data-testid="session-other">{s.other.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><ModeIcon mode={s.mode} className="h-3 w-3" />{prof} · <span data-testid="session-timer" className="tabular-nums">{elapsed}</span></p></div>
        {active && <>
          <button data-testid="start-voice" onClick={() => startCall("voice")} disabled={!!live || paused} className="rounded-full p-2 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40"><Phone className="h-5 w-5" /></button>
          <button data-testid="start-video" onClick={() => startCall("video")} disabled={!!live || paused} className="rounded-full p-2 text-violet-600 hover:bg-violet-500/10 disabled:opacity-40"><Video className="h-5 w-5" /></button>
          <button data-testid="end-session" onClick={end} className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white">{t("consult.end")}</button></>}
      </header>
      <div className="flex items-center justify-between bg-muted/50 px-4 py-1.5 text-xs">
        <span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-amber-500" />{s.role === "user" ? t("consult.spent") : t("consult.earning")} <b data-testid="credits-used" className="tabular-nums">{used}</b></span>
        {s.role === "user" && meter?.balance != null && <span>{t("consult.balance")} <b data-testid="session-balance" className="tabular-nums">{Number(meter.balance).toFixed(0)}</b></span>}
        <span className="text-muted-foreground">{t("consult.perMin", { rate: meter?.rate ?? s.rates[s.mode]?.rate })}</span>
      </div>
      {lowBal && <div data-testid="low-balance" className="flex items-center justify-center gap-3 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
        <span className="animate-pulse">{t("consult.lowBalance", { n: meter?.minutes_left })}</span>
        <Link to="/wallet" data-testid="low-topup" className="rounded-full bg-amber-500 px-2.5 py-0.5 text-white">{t("nearby.session.lowTopUp")}</Link></div>}
      {paused && !meter?.resume_ask && (
        <div data-testid="session-paused" data-side={meter?.pause_side} className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-sm text-white animate-in slide-in-from-top-2">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1"><p className="font-semibold">{t("nearby.session.paused", { name: s.other.name })}</p>
            <p className="text-xs text-white/70">{t("nearby.session.notCharged")} · <span className="tabular-nums" data-testid="resume-left">{t("nearby.session.endsIn", { t: fmt(resumeLeft) })}</span></p></div>
          <PauseCircle className="h-5 w-5 shrink-0 animate-pulse text-white/60" />
        </div>)}

      <main className="flex-1 space-y-2 overflow-y-auto px-3 py-4" data-testid="messages">
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.sender === user.id} />)}
        <div ref={endRef} />
      </main>

      {active ? (
        <footer className="flex items-end gap-2 border-t bg-card p-2">
          <input ref={fileRef} type="file" data-testid="file-input" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <button data-testid="attach" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full p-2.5 text-muted-foreground hover:bg-muted">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}</button>
          <textarea data-testid="chat-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("consult.typeMsg")}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="max-h-32 flex-1 resize-none rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          <button data-testid="chat-send" onClick={send} disabled={!text.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-90 disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </footer>
      ) : (
        <footer data-testid="session-summary" className="max-h-[70dvh] space-y-2 overflow-y-auto border-t bg-card p-4 text-center animate-in slide-in-from-bottom-2">
          <p className="font-semibold" data-testid="end-title" data-reason={reason}>{["early_end", "dropped", "low_balance", "not_resumed"].includes(reason) && s.role === "user"
            ? t(`nearby.session.ended.${reason}`, { name: s.other.name }) : t(`consult.ended.${reason === "credits_exhausted" ? "credits" : "normal"}`)}</p>
          <p className="text-sm text-muted-foreground">{t("consult.summary", { dur: elapsed, credits: used })}</p>
          {Number(s.refunded ?? 0) > 0 && (s.role === "user"
            ? <p data-testid="refund-note" className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Undo2 className="h-4 w-4" />{t("nearby.session.refunded", { n: Number(s.refunded) })}</p>
            : <p data-testid="refund-note" className="text-xs text-muted-foreground">{t("nearby.session.refundedWorker")}</p>)}
          {s.role === "user" && reason === "dropped" && <p className="text-xs text-muted-foreground">{t("nearby.session.droppedSub")}</p>}
          {s.role === "user" && (reason === "low_balance" || reason === "credits_exhausted") && canReconnect && <p className="text-xs text-muted-foreground">{t("nearby.session.lowSub", { name: s.other.name })}</p>}
          {s.role === "user" && reconnectUntil > 0 && (
            <div data-testid="reconnect-box" className="mx-auto grid max-w-sm gap-2 py-1">
              {(reason === "low_balance" || reason === "credits_exhausted") && <Link to="/wallet" data-testid="reconnect-topup" className="rounded-2xl bg-amber-500 py-2.5 text-sm font-semibold text-white shadow-md">{t("nearby.auto.topUp")}</Link>}
              {canReconnect && reason !== "early_end" && <button data-testid="reconnect" onClick={() => void request(target, s.mode)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-md active:scale-[.98]"><RotateCcw className="h-4 w-4" />{t("nearby.session.reconnect", { name: s.other.name })}
                <span className="text-[11px] font-normal opacity-80">· {fmt((reconnectUntil - now) / 1000)}</span></button>}
              {here && <button data-testid="find-other" onClick={() => void startSearch({ node: s.node_slug, nodeLabel: prof, mode: s.mode, lat: here.lat, lng: here.lng })}
                className="flex items-center justify-center gap-2 rounded-2xl border py-2.5 text-sm font-semibold active:scale-[.98]"><Radar className="h-4 w-4" />{t("nearby.session.findOther")}</button>}
            </div>)}
          {s.role === "user" && <FeedbackCard sessionId={id} workerName={s.other.name} />}
          <div className="flex justify-center gap-3"><Link to="/history" data-testid="go-history" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{t("consult.history")}</Link>
            <Link to="/" className="rounded-full bg-muted px-4 py-2 text-sm font-semibold">{t("consult.home")}</Link></div>
        </footer>
      )}

      {paused && meter?.resume_ask && (
        <div data-testid="resume-ask" className="fixed inset-0 z-[96] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 text-center shadow-2xl animate-in zoom-in-95">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><RotateCcw className="h-7 w-7" /></span>
            <div><h2 className="text-lg font-bold">{t("nearby.session.resumeTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("nearby.session.resumeSub")}</p></div>
            {meter.my_answer ? <p data-testid="resume-waiting" className="flex items-center justify-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin" />{t("nearby.session.waitingOther", { name: s.other.name })}</p> : (
              <div className="grid grid-cols-2 gap-2">
                <button data-testid="resume-no" onClick={() => void answer(false)} className="rounded-2xl bg-muted py-3 text-sm font-semibold">{t("nearby.session.no")}</button>
                <button data-testid="resume-yes" onClick={() => void answer(true)} className="rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md">{t("nearby.session.yes")}</button>
              </div>)}
          </div>
        </div>)}
      {live && ringingIn && (
        <div data-testid="call-incoming" className="fixed inset-x-3 top-3 z-[95] mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-slate-900 p-4 text-white shadow-2xl animate-in slide-in-from-top-4">
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-primary"><span className="absolute inset-0 animate-ping rounded-full bg-primary/50" /><ModeIcon mode={live.mode as Mode} className="relative h-5 w-5" /></span>
          <div className="flex-1"><p className="font-semibold">{s.other.name}</p><p className="text-xs text-white/70">{t(`consult.incoming.${live.mode}`)}</p></div>
          <button data-testid="call-decline" onClick={() => void supabase.rpc("call_answer", { _call: live.id, _accept: false }).then()} className="grid h-11 w-11 place-items-center rounded-full bg-red-500"><PhoneOff className="h-5 w-5" /></button>
          <button data-testid="call-accept" onClick={async () => { const { error } = await supabase.rpc("call_answer", { _call: live.id, _accept: true }); if (error) toast.error(error.message); }}
            className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500 ring-4 ring-emerald-500/30 animate-pulse"><ModeIcon mode={live.mode as Mode} className="h-5 w-5" /></button>
        </div>
      )}
      {live && ringingOut && (
        <div data-testid="call-outgoing" className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-6 bg-slate-950/95 text-white animate-in fade-in">
          <span className="relative grid h-28 w-28 place-items-center"><span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
            <Avatar className="h-24 w-24">{s.other.photo && <AvatarImage src={s.other.photo} />}<AvatarFallback className="bg-primary text-2xl">{initials(s.other.name)}</AvatarFallback></Avatar></span>
          <p className="text-xl font-bold">{s.other.name}</p><p className="text-sm text-white/70">{t("consult.ringing")}</p>
          <button data-testid="call-cancel" onClick={() => void supabase.rpc("call_end", { _call: live.id }).then()} className="grid h-16 w-16 place-items-center rounded-full bg-red-500"><PhoneOff /></button>
        </div>
      )}
      {live?.status === "active" && active && <CallView call={live} me={user.id} other={s.other} elapsed={elapsed} onHangup={() => void supabase.rpc("call_end", { _call: live.id }).then()} />}
    </div>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  const { t } = useTranslation(); const [url, setUrl] = useState<string | null>(null);
  const img = m.kind === "file" && m.mime?.startsWith("image/");
  useEffect(() => { if (m.kind === "file" && m.file_path) void supabase.storage.from("consult-files").createSignedUrl(m.file_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null)); }, [m]);
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (m.kind === "system") return <p data-testid="msg-system" className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{t(`consult.sys.${m.body}`, { defaultValue: m.body ?? "" })} · {time}</p>;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1`}>
      <div data-testid={m.kind === "file" ? "msg-file" : "msg"} data-mine={mine}
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card"}`}>
        {m.kind === "text" && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        {m.kind === "file" && (img && url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.file_name ?? ""} className="max-h-56 rounded-xl" /></a>
          : <a href={url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline-offset-2 hover:underline"><FileText className="h-5 w-5 shrink-0" /><span className="truncate">{m.file_name}</span><span className="text-[10px] opacity-70">{Math.ceil((m.size_bytes ?? 0) / 1024)} KB</span></a>)}
        <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{time}</p>
      </div>
    </div>
  );
}
