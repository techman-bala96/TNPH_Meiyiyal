import { createWebRtcProvider } from "./webrtc";
import type { CallProvider } from "./types";
export * from "./types";
/** Pick the media provider. 100ms needs VITE_HMS_TOKEN_URL (server-issued room tokens); without it we use local P2P WebRTC. */
export function createCallProvider(): CallProvider {
  if (import.meta.env.VITE_HMS_TOKEN_URL) {
    // Placeholder: implement with @100mslive/hms-video-store once keys exist (join room with token from Edge Function `call-token`).
    console.warn("100ms provider not configured in this build; using WebRTC fallback");
  }
  return createWebRtcProvider();
}
