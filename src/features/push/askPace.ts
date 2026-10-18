// When our own "turn on alerts" card may show: first time, then after a 'Not now' wait 7 days, and stop after 3 'Not now's.
export type AskState = { n: number; last: number };
export const ASK_WAIT_MS = 7 * 864e5;
export const ASK_MAX = 3;
export function canAskFrom(s: AskState | null | undefined, now: number): boolean {
  const n = s?.n ?? 0; const last = s?.last ?? 0;
  return n === 0 || (n < ASK_MAX && now - last > ASK_WAIT_MS);
}
export const snoozed = (s: AskState | null | undefined, now: number): AskState => ({ n: (s?.n ?? 0) + 1, last: now });
