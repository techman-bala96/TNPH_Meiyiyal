import { supabase } from "@/integrations/supabase/client";

const FALLBACK: RTCIceServer[] = import.meta.env.VITE_ICE_SERVERS ? JSON.parse(import.meta.env.VITE_ICE_SERVERS) : [{ urls: "stun:stun.l.google.com:19302" }];
let cache: { at: number; ttl: number; servers: RTCIceServer[]; provider: string } | null = null;

/** ICE from the `ice-servers` Edge Function (short-lived TURN creds). Cached for half the TTL; STUN fallback on any error. */
export async function getIceServers(): Promise<{ servers: RTCIceServer[]; provider: string }> {
  if (cache && Date.now() - cache.at < (cache.ttl * 1000) / 2) return cache;
  try {
    const { data, error } = await supabase.functions.invoke("ice-servers", { method: "GET" });
    if (error || !Array.isArray(data?.iceServers) || !data.iceServers.length) throw error ?? new Error("no ice");
    cache = { at: Date.now(), ttl: Number(data.ttl) || 3600, servers: data.iceServers, provider: String(data.provider ?? "stun") };
    return cache;
  } catch {
    return { servers: FALLBACK, provider: "fallback" };
  }
}
