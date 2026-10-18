import test from "node:test";
import assert from "node:assert/strict";
import { captureReferral, pendingReferral, clearReferral, normalizeCode, inviteLinks } from "../../src/features/referral/capture.ts";
import { toCsv } from "../../src/features/admin/csv.ts";

class Mem { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

test("normalizeCode trims, upper-cases and rejects junk", () => {
  assert.equal(normalizeCode(" mabc234 "), "MABC234");
  assert.equal(normalizeCode("fb-diwali"), "FB-DIWALI");
  assert.equal(normalizeCode("ab"), null);
  assert.equal(normalizeCode("<script>"), null);
  assert.equal(normalizeCode(null), null);
});

test("captures ?ref from user and worker links, expires after 30 days", () => {
  const s = new Mem(); const now = 1_800_000_000_000;
  assert.equal(captureReferral({ search: "", pathname: "/" }, s, now), null);
  assert.deepEqual(captureReferral({ search: "?ref=mabc234", pathname: "/" }, s, now), { code: "MABC234", landing: "user", at: now });
  assert.equal(pendingReferral(s, now + 1000).code, "MABC234");
  captureReferral({ search: "?x=1&ref=MXYZ789", pathname: "/worker/register" }, s, now);
  assert.equal(pendingReferral(s, now).landing, "worker");
  assert.equal(pendingReferral(s, now + 31 * 24 * 3600 * 1000), null);
  clearReferral(s); assert.equal(pendingReferral(s, now), null);
});

test("invite links", () => {
  assert.deepEqual(inviteLinks("MABC234", "https://meiyiyal.com"), { user: "https://meiyiyal.com/?ref=MABC234", worker: "https://meiyiyal.com/worker/register?ref=MABC234" });
});

test("CSV: BOM, quoting, Tamil, formula-injection guard", () => {
  const out = toCsv([["district", "n"], ["அரியலூர்", 3], ['A "quoted", one', 0], ["=HYPERLINK(1)", "-2"]]);
  assert.ok(out.startsWith("\uFEFF"));
  assert.ok(out.includes("அரியலூர்,3\r\n"));
  assert.ok(out.includes('"A ""quoted"", one",0'));
  assert.ok(out.includes("'=HYPERLINK(1),'-2"));
});
