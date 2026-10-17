import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CallProvider, CallState } from "./types";

const ICE: RTCIceServer[] = (import.meta.env.VITE_ICE_SERVERS ? JSON.parse(import.meta.env.VITE_ICE_SERVERS) : [{ urls: "stun:stun.l.google.com:19302" }]);

/** P2P WebRTC. Signaling over a private Realtime broadcast channel "call:<sessionId>" (RLS: only the two parties). */
export function createWebRtcProvider(): CallProvider {
  let pc: RTCPeerConnection | null = null; let ch: RealtimeChannel | null = null; let local: MediaStream | null = null; let callId = "";
  const pending: RTCIceCandidateInit[] = [];
  let again: ReturnType<typeof setInterval> | undefined;
  const send = (event: string, payload: Record<string, unknown>) => ch?.send({ type: "broadcast", event, payload: { ...payload, callId } });
  return {
    name: "webrtc",
    async join({ sessionId, callId: cid, isCaller, video, onState, onRemote }) {
      callId = cid; onState("connecting");
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 640, height: 480 } : false });
      pc = new RTCPeerConnection({ iceServers: ICE });
      local.getTracks().forEach((t) => pc!.addTrack(t, local!));
      pc.ontrack = (e) => onRemote(e.streams[0]);
      pc.onicecandidate = (e) => { if (e.candidate) send("ice", { c: e.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => {
        const s = pc?.connectionState; const map: Record<string, CallState> = { connected: "connected", failed: "failed", closed: "ended", disconnected: "connecting" };
        if (s && map[s]) onState(map[s]);
      };
      const makeOffer = async () => {
        if (!pc) return;
        // callee may have joined after our first offer: re-send it instead of dropping the retry
        if (pc.signalingState === "have-local-offer" && pc.localDescription) { send("offer", { sdp: pc.localDescription.toJSON() }); return; }
        if (pc.signalingState !== "stable" || pc.remoteDescription) return;
        const o = await pc.createOffer(); await pc.setLocalDescription(o); send("offer", { sdp: o });
      };
      ch = supabase.channel(`call:${sessionId}`, { config: { private: true, broadcast: { self: false } } });
      ch.on("broadcast", { event: "ready" }, ({ payload }) => { if (payload.callId === callId && isCaller) void makeOffer(); })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (payload.callId !== callId || isCaller || !pc || pc.signalingState !== "stable" || pc.remoteDescription) return;
          await pc.setRemoteDescription(payload.sdp); const a = await pc.createAnswer(); await pc.setLocalDescription(a); send("answer", { sdp: a });
          while (pending.length) await pc.addIceCandidate(pending.shift()!);
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.callId !== callId || !isCaller || !pc || pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription(payload.sdp); while (pending.length) await pc.addIceCandidate(pending.shift()!);
        })
        .on("broadcast", { event: "ice" }, async ({ payload }) => {
          if (payload.callId !== callId || !pc) return;
          if (pc.remoteDescription) await pc.addIceCandidate(payload.c).catch(() => undefined); else pending.push(payload.c);
        });
      await new Promise<void>((res, rej) => ch!.subscribe((st) => { if (st === "SUBSCRIBED") res(); else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") rej(new Error(st)); }));
      // both sides announce; caller (re)offers whenever callee announces
      if (isCaller) { void makeOffer(); } else { send("ready", {}); }
      again = setInterval(() => { if (pc?.connectionState === "connected") clearInterval(again); else if (!isCaller) send("ready", {}); }, 2000);
      return local;
    },
    setMuted(m) { local?.getAudioTracks().forEach((t) => (t.enabled = !m)); },
    setCamera(on) { local?.getVideoTracks().forEach((t) => (t.enabled = on)); },
    async leave() {
      if (again) clearInterval(again);
      local?.getTracks().forEach((t) => t.stop()); local = null;
      pc?.close(); pc = null;
      if (ch) { await supabase.removeChannel(ch); ch = null; }
    },
  };
}
