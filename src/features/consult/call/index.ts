import { createHmsProvider } from "./hms";
import { createWebRtcProvider } from "./webrtc";
import type { CallProvider } from "./types";
export * from "./types";

/**
 * Pick the media provider. Default: P2P WebRTC with ICE from the `ice-servers` function (STUN, or coturn TURN).
 * VITE_CALL_PROVIDER=hms tries 100ms first and falls back to WebRTC if the token/SDK is unavailable.
 */
export function createCallProvider(): CallProvider {
  if (import.meta.env.VITE_CALL_PROVIDER !== "hms") return createWebRtcProvider();
  const hms = createHmsProvider(); const rtc = createWebRtcProvider();
  let active: CallProvider = hms;
  return {
    get name() { return active.name; },
    async join(o) {
      try { active = hms; return await hms.join(o); }
      catch (e) { console.warn("100ms unavailable, using WebRTC:", (e as Error).message); await hms.leave().catch(() => undefined); active = rtc; return rtc.join(o); }
    },
    setMuted: (m) => active.setMuted(m),
    setCamera: (on) => active.setCamera(on),
    switchCamera: () => active.switchCamera(),
    leave: () => active.leave(),
  };
}
