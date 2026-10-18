import { supabase } from "@/integrations/supabase/client";
import type { CallProvider, CallState } from "./types";

/**
 * Optional 100ms media provider (VITE_CALL_PROVIDER=hms). Not bundled by default: install
 * `@100mslive/hms-video-store` and set HMS_* secrets for the `call-token` Edge Function.
 * If the SDK or the token is unavailable, join() throws and createCallProvider's wrapper falls back to WebRTC.
 */
export function createHmsProvider(): CallProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK is optional and untyped here
  let actions: any = null; let store: any = null; let local: MediaStream | null = null; let unsub: (() => void) | null = null;
  return {
    name: "hms",
    async join({ sessionId, video, onState, onRemote }) {
      onState("connecting");
      const { data, error } = await supabase.functions.invoke("call-token", { body: { session_id: sessionId } });
      if (error || !data?.token) throw new Error("hms_token_unavailable");
      const mod = "@100mslive/hms-video-store";
      const sdk = await import(/* @vite-ignore */ mod).catch(() => { throw new Error("hms_sdk_not_installed"); });
      const hms = new sdk.HMSReactiveStore(); hms.triggerOnSubscribe();
      actions = hms.getActions(); store = hms.getStore();
      await actions.join({ userName: "meiyiyal", authToken: data.token, settings: { isAudioMuted: false, isVideoMuted: !video } });
      unsub = store.subscribe((peers: { isLocal: boolean; videoTrack?: string; audioTrack?: string }[]) => {
        const remote = peers.find((p) => !p.isLocal);
        if (!remote) return;
        const tracks = [remote.audioTrack, remote.videoTrack].filter(Boolean).map((id) => store.getState(sdk.selectTrackByID(id))?.nativeTrack).filter(Boolean);
        if (tracks.length) { onRemote(new MediaStream(tracks)); onState("connected" as CallState); }
      }, sdk.selectPeers);
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      return local;
    },
    setMuted(m) { void actions?.setLocalAudioEnabled(!m); },
    setCamera(on) { void actions?.setLocalVideoEnabled(on); },
    async leave() { unsub?.(); local?.getTracks().forEach((t) => t.stop()); local = null; await actions?.leave(); actions = null; },
  };
}
