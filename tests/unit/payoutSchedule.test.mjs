// Run with `npm run test:unit` (Node 22.6+ strips the TypeScript types itself).
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPayoutAt, formatIst, formatIstDate } from "../../src/lib/payoutSchedule.ts";

const ist = (s) => new Date(`${s}+05:30`);
const iso = (d) => d.toISOString();

test("cool-off from a Sunday verification waits for the Monday after it ends", () => {
  // Verified Sun 18 Oct 2026 16:00 IST, 3-day cool-off ends Wed 21 Oct 16:00 IST.
  const now = ist("2026-10-18T16:00:00");
  const coolingUntil = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  assert.equal(iso(nextPayoutAt(coolingUntil, now)), iso(ist("2026-10-26T10:00:00")));
  // Without the cool-off the very next Monday would have been 19 Oct (the old, wrong answer).
  assert.equal(iso(nextPayoutAt(null, now)), iso(ist("2026-10-19T10:00:00")));
});

test("matches the SQL test vectors for payout_next_at", () => {
  const now = ist("2026-10-18T12:00:00");
  assert.equal(iso(nextPayoutAt(ist("2026-10-21T12:00:00"), now)), iso(ist("2026-10-26T10:00:00")));
  assert.equal(iso(nextPayoutAt(ist("2026-10-26T10:00:00"), now)), iso(ist("2026-10-26T10:00:00")));
  assert.equal(iso(nextPayoutAt(ist("2026-10-26T10:01:00"), now)), iso(ist("2026-11-02T10:00:00")));
  assert.equal(iso(nextPayoutAt(ist("2026-11-04T15:00:00"), now)), iso(ist("2026-11-09T10:00:00")));
});

test("a cool-off ending on Monday morning before 10:00 still makes that day's batch", () => {
  const now = ist("2026-10-23T09:00:00");
  assert.equal(iso(nextPayoutAt(ist("2026-10-26T09:59:00"), now)), iso(ist("2026-10-26T10:00:00")));
});

test("a past or missing gate uses now; Monday after 10:00 IST rolls to next week", () => {
  const now = ist("2026-10-19T10:30:00");
  assert.equal(iso(nextPayoutAt(ist("2026-10-01T00:00:00"), now)), iso(ist("2026-10-26T10:00:00")));
  assert.equal(iso(nextPayoutAt(undefined, now)), iso(ist("2026-10-26T10:00:00")));
});

test("IST is used whatever the device timezone; UTC Sunday night is already Monday in India", () => {
  // 2026-10-25T20:00Z is Mon 26 Oct 01:30 IST, so the batch is the same day.
  assert.equal(iso(nextPayoutAt(new Date("2026-10-25T20:00:00Z"), new Date("2026-10-20T00:00:00Z"))), iso(ist("2026-10-26T10:00:00")));
});

test("result is always a Monday 10:00 IST and never before the gate", () => {
  const now = ist("2026-10-18T00:00:00");
  for (let h = 0; h < 24 * 21; h += 7) {
    const gate = new Date(now.getTime() + h * 3600 * 1000);
    const r = nextPayoutAt(gate, now);
    assert.ok(r.getTime() >= gate.getTime());
    assert.ok(r.getTime() - gate.getTime() < 7 * 24 * 3600 * 1000);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(r).map((x) => [x.type, x.value]));
    assert.equal(`${p.weekday} ${p.hour}:${p.minute}`, "Mon 10:00");
  }
});

test("formatIst names the zone and uses IST, in English and Tamil", () => {
  const s = formatIst("2026-10-26T04:30:00Z", "en");
  assert.match(s, /Mon/); assert.match(s, /26/); assert.match(s, /Oct/); assert.match(s, /10:00/); assert.match(s, /IST$/);
  const ta = formatIst("2026-10-26T04:30:00Z", "ta");
  assert.match(ta, /26/); assert.match(ta, /10:00/); assert.match(ta, /IST$/); assert.doesNotMatch(ta, /AM|PM/);
  assert.match(formatIst("2026-10-21T10:47:00Z", "ta"), /16:17/);
  assert.equal(formatIstDate("2026-10-18T20:00:00Z", "en"), "19 Oct 2026");
});
