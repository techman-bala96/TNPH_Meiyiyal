// ICE servers for WebRTC calls. Pure (env injected) so tests/unit can exercise it.
// ICE_PROVIDER:
//   stun   (default) public STUN only — works on most home/office Wi-Fi, fails behind symmetric NAT / some mobile carriers.
//   coturn TURN REST credentials for your own coturn (use-auth-secret + static-auth-secret=TURN_SECRET):
//          TURN_URLS = "turn:turn.meiyiyal.com:3478?transport=udp,turn:turn.meiyiyal.com:3478?transport=tcp,turns:turn.meiyiyal.com:5349?transport=tcp"
//          TURN_TTL seconds (default 3600). Username = "<expiry>:<user id>", credential = base64(HMAC-SHA1(secret, username)).
//   static ICE_SERVERS_JSON = JSON array of RTCIceServer (e.g. a managed TURN vendor's long-lived credentials).
// STUN_URLS overrides the STUN list (comma separated).
export interface IceServer { urls: string | string[]; username?: string; credential?: string }

const enc = new TextEncoder();
async function hmacSha1B64(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig));
}

export async function iceServersFor(userId: string, env: (k: string) => string | undefined, nowSec = Math.floor(Date.now() / 1000)): Promise<{ provider: string; ttl: number; iceServers: IceServer[] }> {
  const stun = (env("STUN_URLS") ?? "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302").split(",").map((s) => s.trim()).filter(Boolean);
  const base: IceServer[] = stun.length ? [{ urls: stun }] : [];
  const p = (env("ICE_PROVIDER") ?? "stun").toLowerCase();
  if (p === "coturn") {
    const secret = env("TURN_SECRET"), urls = (env("TURN_URLS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (secret && urls.length) {
      const ttl = Math.max(300, Number(env("TURN_TTL") ?? 3600) || 3600);
      const username = `${nowSec + ttl}:${userId}`;
      return { provider: "coturn", ttl, iceServers: [...base, { urls, username, credential: await hmacSha1B64(secret, username) }] };
    }
  }
  if (p === "static") {
    try {
      const list = JSON.parse(env("ICE_SERVERS_JSON") ?? "[]");
      if (Array.isArray(list) && list.length) return { provider: "static", ttl: 3600, iceServers: [...base, ...list] };
    } catch { /* fall through */ }
  }
  return { provider: "stun", ttl: 3600, iceServers: base };
}

// 100ms (optional): app token for a room, HS256 JWT per 100ms "auth token" docs.
// HMS_ACCESS_KEY / HMS_APP_SECRET from the 100ms dashboard; HMS_TEMPLATE_ROLE (default "guest").
const b64url = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
export async function hmsAppToken(p: { accessKey: string; secret: string; roomId: string; userId: string; role: string; nowSec?: number; ttl?: number }) {
  const iat = p.nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ access_key: p.accessKey, room_id: p.roomId, user_id: p.userId, role: p.role, type: "app", version: 2,
    iat, nbf: iat, exp: iat + (p.ttl ?? 3600), jti: crypto.randomUUID() }));
  const key = await crypto.subtle.importKey("raw", enc.encode(p.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}
