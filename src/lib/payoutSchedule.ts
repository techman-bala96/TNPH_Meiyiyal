// Payout schedule helpers. The server (`payout_next_at` / `my_earnings`) decides the date;
// this mirrors that rule for display, tests, and the screenshot fixtures.

const IST_OFFSET_MS = 330 * 60 * 1000; // Asia/Kolkata is UTC+05:30 all year (no DST)
const DAY_MS = 24 * 60 * 60 * 1000;

/** First Monday 10:00 IST batch at or after both `now` and `notBefore` (cool-off end, hold release, block end). */
export function nextPayoutAt(notBefore: Date | string | null | undefined, now: Date = new Date()): Date {
  const nb = notBefore ? new Date(notBefore).getTime() : now.getTime();
  const at = Math.max(now.getTime(), nb);
  const local = new Date(at + IST_OFFSET_MS); // UTC fields of this date are the IST wall clock
  const daysToMonday = (8 - (local.getUTCDay() || 7)) % 7; // ISO weekday: Mon=1 … Sun=7
  let slot = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToMonday, 10, 0, 0) - IST_OFFSET_MS;
  if (slot < at) slot += 7 * DAY_MS;
  return new Date(slot);
}

/** A moment shown in IST with the zone named, in the app language (e.g. "Mon, 26 Oct, 10:00 am IST"). */
export function formatIst(iso: string | Date, lang?: string): string {
  const ta = !!lang?.startsWith("ta");
  // Tamil uses a 24-hour clock so the line does not mix in English "AM/PM".
  const s = new Date(iso).toLocaleString(ta ? "ta-IN" : "en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(ta ? { hourCycle: "h23" as const } : {}) });
  return `${s} IST`;
}

/** A calendar date in IST (e.g. "18 Oct 2026"), for rows where the time does not matter. */
export function formatIstDate(iso: string | Date, lang?: string): string {
  const locale = lang?.startsWith("ta") ? "ta-IN" : "en-IN";
  return new Date(iso).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}
