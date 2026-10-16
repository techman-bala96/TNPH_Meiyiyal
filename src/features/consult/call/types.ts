export type CallState = "idle" | "connecting" | "connected" | "failed" | "ended";
/** Media transport for voice/video. WebRTC (P2P via Supabase Realtime signaling) works locally; a 100ms provider can replace it in production. */
export interface CallProvider {
  name: string;
  join(opts: { sessionId: string; callId: string; isCaller: boolean; video: boolean; onState: (s: CallState) => void; onRemote: (s: MediaStream) => void }): Promise<MediaStream>;
  setMuted(m: boolean): void;
  setCamera(on: boolean): void;
  leave(): Promise<void>;
}
