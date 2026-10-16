import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/features/profile/useProfile";
import { createCallProvider, type CallState } from "./call";
import type { Call } from "./api";

export function CallView({ call, me, other, onHangup, elapsed }: { call: Call; me: string; other: { name: string; photo: string | null }; onHangup: () => void; elapsed: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CallState>("connecting"); const [muted, setMuted] = useState(false); const [cam, setCam] = useState(true);
  const [remote, setRemote] = useState<MediaStream | null>(null); const [err, setErr] = useState<string | null>(null);
  const localRef = useRef<HTMLVideoElement>(null); const remoteRef = useRef<HTMLVideoElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const prov = useRef(createCallProvider());
  const video = call.mode === "video";
  useEffect(() => {
    const p = prov.current; let alive = true;
    p.join({ sessionId: call.session_id, callId: call.id, isCaller: call.caller === me, video, onState: (s) => alive && setState(s), onRemote: (s) => alive && setRemote(s) })
      .then((ls) => { if (localRef.current) localRef.current.srcObject = ls; })
      .catch((e) => { setErr(String(e?.message ?? e)); setState("failed"); });
    return () => { alive = false; void p.leave(); };
  }, [call.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (remoteRef.current && remote) remoteRef.current.srcObject = remote;
    if (audioRef.current && remote) audioRef.current.srcObject = remote;
  }, [remote]);
  return (
    <div data-testid="call-view" data-state={state} data-mode={call.mode} className="fixed inset-0 z-[90] flex flex-col bg-slate-950 text-white animate-in fade-in zoom-in-95">
      {video ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <video ref={remoteRef} data-testid="remote-video" autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          {state !== "connected" && <div className="absolute inset-0 grid place-items-center bg-slate-950/70"><Who other={other} sub={t(`consult.call.${state}`)} /></div>}
          <video ref={localRef} data-testid="local-video" autoPlay playsInline muted className="absolute right-3 top-3 h-40 w-28 rounded-2xl border-2 border-white/30 object-cover shadow-xl md:h-48 md:w-36" />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-emerald-900/60 to-slate-950">
          <audio ref={audioRef} autoPlay data-testid="remote-audio" />
          <Who other={other} sub={state === "connected" ? elapsed : t(`consult.call.${state}`)} />
        </div>
      )}
      <div className="absolute left-0 right-0 top-3 text-center text-sm">
        <span data-testid="call-state" className="rounded-full bg-black/40 px-3 py-1 tabular-nums backdrop-blur">{state === "connected" ? elapsed : t(`consult.call.${state}`)}</span>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      </div>
      <div className="flex items-center justify-center gap-5 p-6 pb-10">
        <button data-testid="call-mute" onClick={() => { setMuted(!muted); prov.current.setMuted(!muted); }} className="grid h-14 w-14 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-90">{muted ? <MicOff /> : <Mic />}</button>
        {video && <button data-testid="call-cam" onClick={() => { setCam(!cam); prov.current.setCamera(!cam); }} className="grid h-14 w-14 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-90">{cam ? <Video /> : <VideoOff />}</button>}
        <button data-testid="call-hangup" onClick={onHangup} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg shadow-red-500/40 transition active:scale-90"><PhoneOff /></button>
      </div>
    </div>
  );
}
function Who({ other, sub }: { other: { name: string; photo: string | null }; sub: string }) {
  return (
    <div className="space-y-4 text-center">
      <Avatar className="mx-auto h-28 w-28 ring-4 ring-white/20">{other.photo && <AvatarImage src={other.photo} className="object-cover" />}
        <AvatarFallback className="bg-primary text-3xl font-bold text-primary-foreground">{initials(other.name)}</AvatarFallback></Avatar>
      <div><p className="text-2xl font-bold">{other.name}</p><p className="text-sm tabular-nums text-white/70">{sub}</p></div>
    </div>
  );
}
