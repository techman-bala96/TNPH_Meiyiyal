import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Phone, PhoneOff, PauseCircle, Video, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorker } from "@/features/worker/api";
import { initials } from "@/features/profile/useProfile";
import { startRing, stopRing } from "./ringtone";
import { closeNotifications, REQUESTED_KEY } from "@/features/push/webPush";
import type { ConsultRequest, Mode } from "./api";
import { errText, type SearchView } from "@/features/nearby/api";
import { AutoSearchScreen, type MsgTarget } from "@/features/nearby/AutoSearchScreen";
import { NoAnswerPanel, type NoAnswer } from "@/features/nearby/NoAnswerPanel";
import { MessageSheet } from "@/features/nearby/MessageSheet";
import { useCurrentLocation } from "@/features/location/useCurrentLocation";
import { nodeName, useTaxonomy } from "@/features/taxonomy/useTaxonomy";
import { friendlyError } from "@/lib/friendlyError";

import { ConsultCtx as C, type SearchArgs, type Target } from "./context";
export function ModeIcon({ mode, className }: { mode: Mode; className?: string }) {
  return mode === "chat" ? <MessageCircle className={className} /> : mode === "voice" ? <Phone className={className} /> : <Video className={className} />;
}


function useCountdown(until: string | undefined) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const f = () => setLeft(Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)));
    f(); const id = setInterval(f, 500); return () => clearInterval(id);
  }, [until]);
  return left;
}

export function ConsultProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const nav = useNavigate(); const qc = useQueryClient(); const { t, i18n } = useTranslation();
  const { data: here } = useCurrentLocation(); const tax = useTaxonomy();
  const { data: me } = useMyWorker();
  const online = !!user && me?.status === "approved" && !!me?.is_online;
  const meId = me?.id; const meStatus = me?.status; const uid = user?.id;
  const [incoming, setIncoming] = useState<ConsultRequest | null>(null);
  const [outgoing, setOutgoing] = useState<{ req: ConsultRequest; target: Target } | null>(null);
  const outRef = useRef(outgoing); outRef.current = outgoing;
  const loc = useLocation();
  const [noAnswer, setNoAnswer] = useState<NoAnswer | null>(null);
  const [msgTarget, setMsgTarget] = useState<MsgTarget | null>(null);
  const [search, setSearch] = useState<{ v: SearchView; nodeLabel: string } | null>(null);
  const searchRef = useRef(search); searchRef.current = search;
  const label = useCallback((slug: string) => { const n = tax.data?.find((x) => x.slug === slug); return n ? nodeName(n, i18n.language?.startsWith("ta") ? "ta" : "en") : ""; }, [tax.data, i18n.language]);

  // ---- auto request (server-side cascade): restore after reload, follow by realtime + 3 s poll
  const applySearch = useCallback((v: SearchView | null, nodeLabel?: string) => {
    if (!v || v.status === "cancelled") { setSearch(null); return; }
    if (v.status === "matched" && v.session_id) { setSearch(null); qc.invalidateQueries({ queryKey: ["wallet"] }); nav(`/session/${v.session_id}`); return; }
    setSearch((cur) => ({ v, nodeLabel: nodeLabel ?? cur?.nodeLabel ?? "" }));
  }, [nav, qc]);
  useEffect(() => {
    if (!uid) { setSearch(null); return; }
    void supabase.rpc("my_live_search").then(({ data }) => { if (data) applySearch(data as SearchView); });
  }, [uid, applySearch]);
  const searchId = search?.v.id; const searching = search?.v.status === "searching";
  useEffect(() => {
    if (!searchId || !searching) return;
    const tick = () => void supabase.rpc("search_tick", { _sid: searchId }).then(({ data }) => { if (data && searchRef.current?.v.id === searchId) applySearch(data as SearchView); });
    const ch = supabase.channel(`search:${searchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consult_searches", filter: `id=eq.${searchId}` }, () => tick()).subscribe();
    const id = setInterval(tick, 3000);
    return () => { clearInterval(id); void supabase.removeChannel(ch); };
  }, [searchId, searching, applySearch]);
  useEffect(() => { if (search && !search.nodeLabel && tax.data) setSearch((c) => (c ? { ...c, nodeLabel: label(c.v.node) } : c)); }, [search, tax.data, label]);

  const startSearch = useCallback(async (a: SearchArgs) => {
    setNoAnswer(null);
    const { data, error } = await supabase.rpc("search_start", { _node: a.node, _mode: a.mode, _lat: a.lat, _lng: a.lng, _all: false });
    if (error) { creditError(errText(error)); return; }
    try { localStorage.setItem(REQUESTED_KEY, "1"); } catch { /* private mode */ }
    applySearch(data as SearchView, a.nodeLabel);
  }, [applySearch]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchCall = async (fn: "search_cancel" | "search_continue", extra: Record<string, unknown> = {}) => {
    const cur = searchRef.current; if (!cur) return;
    const { data, error } = await supabase.rpc(fn, { _sid: cur.v.id, ...extra });
    if (error) { creditError(errText(error)); return; }
    applySearch(data as SearchView);
  };
  function creditError(msg: string) {
    if (/insufficient credits/i.test(msg)) toast.error(t("nearby.auto.needCredits", { n: msg.match(/need ([\d.]+)/)?.[1] ?? "" }), { action: { label: t("nearby.auto.topUp"), onClick: () => nav("/wallet") } });
    else toast.error(friendlyError(t, msg));
  }

  // ---- presence: any open screen keeps the active consultation alive (the session page also ticks)
  const active = useActiveSession(uid);
  const onSessionPage = !!active.data && loc.pathname === `/session/${active.data.id}`;
  useEffect(() => {
    const sid = active.data?.id; if (!sid || onSessionPage) return;
    const beat = () => { if (document.visibilityState === "visible") void supabase.rpc("session_tick", { _sid: sid }).then(({ data }) => {
      const d = data as unknown as { status?: string; paused?: boolean } | null; if (d) active.setPaused(!!d.paused); if (d?.status && d.status !== "active") void active.refetch(); }); };
    beat(); const id = setInterval(beat, 10_000); document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", beat); };
  }, [active.data?.id, onSessionPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // presence heartbeat (any page) + realtime presence channel
  useEffect(() => {
    if (!online) return;
    const beat = () => void supabase.rpc("worker_heartbeat").then();
    beat(); const id = setInterval(beat, 45_000);
    const vis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", vis);
    const pres = supabase.channel("presence:workers", { config: { presence: { key: meId } } });
    pres.subscribe((s) => { if (s === "SUBSCRIBED") void pres.track({ worker_id: meId, at: Date.now() }); });
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); void supabase.removeChannel(pres); };
  }, [online, meId]);

  // incoming rings for me as a worker
  useEffect(() => {
    if (!uid || !meId || meStatus !== "approved") return;
    // initial fetch + slow poll as a safety net if a realtime event is missed (reconnects, slow channel join)
    const check = () => void supabase.from("consult_requests").select("*").eq("worker_user_id", uid).eq("status", "ringing").gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).then(({ data }) => { if (data?.[0]) setIncoming((cur) => (cur?.id === data[0].id ? cur : (data[0] as unknown as ConsultRequest))); });
    check(); const poll = setInterval(check, 5000);
    const ch = supabase.channel(`ring:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "consult_requests", filter: `worker_user_id=eq.${uid}` }, (p) => {
        const r = p.new as ConsultRequest;
        if (r.status === "ringing") setIncoming(r); else setIncoming((cur) => (cur?.id === r.id ? null : cur));
      }).subscribe();
    return () => { clearInterval(poll); void supabase.removeChannel(ch); };
  }, [uid, meId, meStatus]);

  // outgoing request status
  useEffect(() => {
    if (!outgoing) return;
    const id = outgoing.req.id;
    const ch = supabase.channel(`req:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consult_requests", filter: `id=eq.${id}` }, (p) => {
        const r = p.new as ConsultRequest; handleOutcome(r);
      }).subscribe();
    // poll fallback (also expires stale rings server-side)
    const poll = setInterval(async () => {
      await supabase.rpc("request_expire_due");
      const { data } = await supabase.from("consult_requests").select("*").eq("id", id).maybeSingle();
      if (data) handleOutcome(data as unknown as ConsultRequest);
    }, 4000);
    return () => { clearInterval(poll); void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outgoing?.req.id]);

  function handleOutcome(r: ConsultRequest) {
    const cur = outRef.current; if (!cur || cur.req.id !== r.id || r.status === "ringing") return;
    setOutgoing(null);
    if (r.status === "accepted" && r.session_id) { qc.invalidateQueries({ queryKey: ["wallet"] }); nav(`/session/${r.session_id}`); }
    else if (r.status === "declined" || r.status === "timeout")
      setNoAnswer({ target: { id: cur.target.id, display_name: cur.target.display_name, photo_url: cur.target.photo_url, spec: cur.target.spec }, node: cur.target.node ?? r.node_slug, reason: r.status, at: Date.now() });
  }

  // the ring is over (answered here, expired, or cancelled): remove its phone notification too
  const lastRing = useRef<string | null>(null);
  useEffect(() => {
    if (lastRing.current && lastRing.current !== incoming?.id) void closeNotifications(`req-${lastRing.current}`);
    lastRing.current = incoming?.id ?? null;
  }, [incoming?.id]);

  // opened from the notification's Accept / Decline buttons: /?ring=<id>&act=accept|decline
  useEffect(() => {
    const sp = new URLSearchParams(loc.search); const ring = sp.get("ring"); const act = sp.get("act");
    if (!ring || !incoming || incoming.id !== ring) return;
    sp.delete("ring"); sp.delete("act");
    nav({ pathname: loc.pathname, search: sp.toString() ? `?${sp}` : "" }, { replace: true });
    if (act === "accept" || act === "decline") void respond(act === "accept");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.id, loc.search]);

  // ring sounds
  useEffect(() => {
    if (incoming) startRing("incoming"); else if (outgoing || searching) startRing("outgoing"); else stopRing();
    return () => stopRing();
  }, [incoming?.id, outgoing?.req.id, searching]); // eslint-disable-line react-hooks/exhaustive-deps

  const request = useCallback(async (w: Target, mode: Mode) => {
    const { data, error } = await supabase.rpc("request_create", { _worker: w.id, _mode: mode });
    if (error) { creditError(error.message); return false; }
    setNoAnswer(null);
    try { localStorage.setItem(REQUESTED_KEY, "1"); } catch { /* private mode */ }
    const { data: r } = await supabase.from("consult_requests").select("*").eq("id", data as string).single();
    setOutgoing({ req: r as unknown as ConsultRequest, target: w });
    lastMode.current = mode;
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastMode = useRef<Mode>("chat");

  const respond = async (accept: boolean) => {
    if (!incoming) return; const r = incoming; setIncoming(null);
    const { data, error } = await supabase.rpc("request_respond", { _id: r.id, _accept: accept });
    if (error) { toast.error(friendlyError(t, error.message)); return; }
    if (accept && data) nav(`/session/${data}`);
  };

  return (
    <C.Provider value={{ request, startSearch, messageWorker: setMsgTarget }}>
      {children}
      {search && <AutoSearchScreen v={search.v} nodeLabel={search.nodeLabel || label(search.v.node)}
        onCancel={() => void searchCall("search_cancel")} onClose={() => void searchCall("search_cancel")}
        onMore={() => void searchCall("search_continue", { _all: false })} onAllTn={() => void searchCall("search_continue", { _all: true })}
        onMessage={(w) => { void searchCall("search_cancel"); setMsgTarget(w); }} />}
      {noAnswer && !outgoing && !search && <NoAnswerPanel n={noAnswer} lat={here?.lat} lng={here?.lng} waitS={60} onClose={() => setNoAnswer(null)}
        onMessage={() => { setMsgTarget(noAnswer.target); setNoAnswer(null); }}
        onAskAgain={() => void request({ ...noAnswer.target, node: noAnswer.node }, lastMode.current)} />}
      <MessageSheet target={msgTarget} onClose={() => setMsgTarget(null)} />
      {active.data && !onSessionPage && !incoming && !outgoing && !search && !/^\/(login|auth)/.test(loc.pathname) && (
        <button data-testid="active-session-pill" data-paused={active.paused} onClick={() => nav(`/session/${active.data!.id}`)}
          className={`fixed inset-x-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-sm items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-xl animate-in slide-in-from-top-2 ${active.paused ? "bg-amber-600" : "bg-emerald-600"}`}>
          {active.paused ? <PauseCircle className="h-4 w-4" /> : <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-white/70" /><span className="relative h-2.5 w-2.5 rounded-full bg-white" /></span>}
          <span className="flex-1 truncate text-left">{active.paused ? t("nearby.session.backPaused") : t("nearby.session.back")}</span>
        </button>)}
      {incoming && <IncomingRing r={incoming} onAnswer={respond} onExpire={() => setIncoming(null)} />}
      {outgoing && <OutgoingRing o={outgoing} onCancel={async () => { await supabase.rpc("request_cancel", { _id: outgoing.req.id }); setOutgoing(null); }} />}
    </C.Provider>
  );
}

function Pulse({ name, photo }: { name: string; photo: string | null }) {
  return (
    <div className="relative mx-auto grid h-36 w-36 place-items-center">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:1.6s]" />
      <span className="absolute inset-3 animate-ping rounded-full bg-primary/20 [animation-delay:.4s] [animation-duration:1.6s]" />
      <Avatar className="h-28 w-28 ring-4 ring-white/80">
        {photo && <AvatarImage src={photo} className="object-cover" />}
        <AvatarFallback className="bg-primary text-3xl font-bold text-primary-foreground">{initials(name)}</AvatarFallback>
      </Avatar>
    </div>
  );
}

function IncomingRing({ r, onAnswer, onExpire }: { r: ConsultRequest; onAnswer: (a: boolean) => void; onExpire: () => void }) {
  const { t } = useTranslation(); const left = useCountdown(r.expires_at);
  useEffect(() => { if (left === 0 && new Date(r.expires_at).getTime() < Date.now()) { void supabase.rpc("request_expire_due").then(); onExpire(); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-testid="incoming-ring" className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-slate-900 via-slate-900/95 to-primary/80 p-8 pb-12 text-white animate-in fade-in zoom-in-95">
      <div className="mt-10 space-y-6 text-center">
        <p className="flex items-center justify-center gap-2 text-sm uppercase tracking-widest text-white/70"><ModeIcon mode={r.mode} className="h-4 w-4" />{t(`consult.incoming.${r.mode}`)}</p>
        <Pulse name={r.user_name ?? "User"} photo={null} />
        <div><h2 className="text-2xl font-bold" data-testid="incoming-name">{r.user_name ?? t("consult.someone")}</h2>
          <p className="mt-1 text-sm text-white/70">{t("consult.rateLine", { rate: r.rate, min: r.min_minutes })}</p>
          <p className="mt-3 text-xs tabular-nums text-white/60" data-testid="ring-countdown">{t("consult.ringsFor", { s: left })}</p></div>
      </div>
      <div className="flex w-full max-w-xs justify-between">
        <button data-testid="ring-decline" onClick={() => onAnswer(false)} className="flex flex-col items-center gap-2 text-sm">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg shadow-red-500/40 transition active:scale-90"><PhoneOff className="h-7 w-7" /></span>{t("consult.decline")}</button>
        <button data-testid="ring-accept" onClick={() => onAnswer(true)} className="flex flex-col items-center gap-2 text-sm">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 ring-8 ring-emerald-500/25 animate-pulse shadow-lg shadow-emerald-500/40 transition active:scale-90"><ModeIcon mode={r.mode} className="h-7 w-7" /></span>{t("consult.accept")}</button>
      </div>
    </div>
  );
}

function OutgoingRing({ o, onCancel }: { o: { req: ConsultRequest; target: Target }; onCancel: () => void }) {
  const { t } = useTranslation(); const left = useCountdown(o.req.expires_at);
  return (
    <div data-testid="outgoing-ring" className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-primary/90 via-slate-900/95 to-slate-900 p-8 pb-12 text-white animate-in fade-in slide-in-from-bottom-4">
      <div className="mt-10 space-y-6 text-center">
        <p className="flex items-center justify-center gap-2 text-sm uppercase tracking-widest text-white/70"><ModeIcon mode={o.req.mode} className="h-4 w-4" />{t("consult.calling")}</p>
        <Pulse name={o.target.display_name} photo={o.target.photo_url} />
        <div><h2 className="text-2xl font-bold">{o.target.display_name}</h2><p className="text-sm text-white/70">{o.target.spec}</p>
          <p className="mt-3 text-xs tabular-nums text-white/60">{t("consult.waiting", { s: left })}</p></div>
      </div>
      <button data-testid="ring-cancel" onClick={onCancel} className="flex flex-col items-center gap-2 text-sm">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg shadow-red-500/40 transition active:scale-90"><X className="h-7 w-7" /></span>{t("consult.cancel")}</button>
    </div>
  );
}

/** My one active consultation (either side), refreshed every 15 s and on session changes. */
function useActiveSession(uid: string | undefined) {
  const [data, setData] = useState<{ id: string } | null>(null); const [paused, setPaused] = useState(false);
  const refetch = useCallback(async () => {
    if (!uid) { setData(null); return; }
    const { data: rows } = await supabase.from("consult_sessions").select("id").eq("status", "active").or(`user_id.eq.${uid},worker_user_id.eq.${uid}`).order("started_at", { ascending: false }).limit(1);
    setData(rows?.[0] ? { id: rows[0].id as string } : null);
  }, [uid]);
  useEffect(() => {
    void refetch(); if (!uid) return;
    const id = setInterval(() => void refetch(), 15_000);
    const ch = supabase.channel(`my-sessions:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "consult_sessions", filter: `user_id=eq.${uid}` }, () => void refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "consult_sessions", filter: `worker_user_id=eq.${uid}` }, () => void refetch()).subscribe();
    return () => { clearInterval(id); void supabase.removeChannel(ch); };
  }, [uid, refetch]);
  return { data, paused, setPaused, refetch };
}
