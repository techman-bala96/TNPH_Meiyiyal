/** Six-digit TOTP input clean-up shared by the MFA screen and its tests. */
export function cleanCode(s: string): string { return s.replace(/\D/g, "").slice(0, 6); }
/** Group a base32 secret in fours so it can be typed into an authenticator by hand. */
export function groupSecret(s: string): string { return s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(); }
/** Minutes of inactivity → ms, clamped to the server's allowed range. */
export function idleMs(minutes: number | undefined): number { const m = Number(minutes) || 30; return Math.min(240, Math.max(5, m)) * 60_000; }
/** Admin may only run on the configured admin host (when one is set). Returns the URL to go to, or null to stay. */
export function adminHostRedirect(adminHost: string | undefined, loc: { host: string; pathname: string; protocol: string }): string | null {
  const h = (adminHost || "").trim().toLowerCase();
  if (!h || loc.host.toLowerCase() === h) return null;
  return `${loc.protocol === "http:" ? "http:" : "https:"}//${h}${loc.pathname.startsWith("/admin") ? loc.pathname : "/admin"}`;
}
