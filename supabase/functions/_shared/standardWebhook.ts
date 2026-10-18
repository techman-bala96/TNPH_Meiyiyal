// Standard Webhooks signature check (used by Supabase Auth hooks).
// signed = `${webhook-id}.${webhook-timestamp}.${body}`, HMAC-SHA256 keyed with base64(secret after "v1,whsec_"),
// header webhook-signature = space-separated "v1,<base64>" entries. Timestamps older than 5 minutes are rejected.
const enc = new TextEncoder();
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

export async function verifyStandardWebhook(secret: string, headers: Headers, body: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sig = headers.get("webhook-signature");
  if (!secret || !id || !ts || !sig) return false;
  if (!/^\d+$/.test(ts) || Math.abs(nowSec - Number(ts)) > 300) return false;
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", fromB64(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toB64(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`)));
  return sig.split(" ").some((part) => {
    const v = part.split(",")[1] ?? "";
    if (v.length !== expected.length) return false;
    let d = 0; for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return d === 0;
  });
}
