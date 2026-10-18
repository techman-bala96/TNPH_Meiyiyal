// Invite codes: ?ref=CODE on any URL (e.g. /?ref=MABC234 or /worker/register?ref=MABC234) is remembered on this device
// before routing (guests are redirected to /login, which would drop the query), then claimed once after sign-in.
const KEY = "mei.ref";
export type Pending = { code: string; landing: "user" | "worker"; at: number };
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,19}$/;
const TTL = 30 * 24 * 3600 * 1000;

export function normalizeCode(raw: string | null | undefined): string | null {
  const c = (raw ?? "").trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

export function captureReferral(loc: { search: string; pathname: string } = window.location, store: Storage = localStorage, now = Date.now()): Pending | null {
  const code = normalizeCode(new URLSearchParams(loc.search).get("ref"));
  if (!code) return null;
  const p: Pending = { code, landing: loc.pathname.startsWith("/worker") ? "worker" : "user", at: now };
  try { store.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  return p;
}

export function pendingReferral(store: Storage = localStorage, now = Date.now()): Pending | null {
  try {
    const p = JSON.parse(store.getItem(KEY) ?? "null") as Pending | null;
    if (!p || !normalizeCode(p.code) || now - p.at > TTL) return null;
    return p;
  } catch { return null; }
}
export function clearReferral(store: Storage = localStorage) { try { store.removeItem(KEY); } catch { /* ignore */ } }

export function inviteLinks(code: string, origin = window.location.origin) {
  return { user: `${origin}/?ref=${encodeURIComponent(code)}`, worker: `${origin}/worker/register?ref=${encodeURIComponent(code)}` };
}
