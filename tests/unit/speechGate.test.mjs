import test from "node:test";
import assert from "node:assert/strict";
import { SpeechGate, rms } from "../../src/features/voice/speechGate.ts";

test("gate starts on speech, ends after silence, drops blips, caps length", () => {
  const g = new SpeechGate({ threshold: 0.02, silenceMs: 1000, maxMs: 5000, minMs: 300 });
  assert.equal(g.feed(0.001, 0), null);
  assert.equal(g.feed(0.1, 100), "start");
  assert.equal(g.feed(0.1, 900), null);
  assert.equal(g.feed(0.0, 1500), null);
  assert.equal(g.feed(0.0, 1950), "end");
  // blip
  assert.equal(g.feed(0.5, 3000), "start");
  assert.equal(g.feed(0.0, 4100), "drop");
  // long speech is cut at maxMs
  assert.equal(g.feed(0.5, 10000), "start");
  let ev = null; for (let t = 10100; t <= 15100 && !ev; t += 100) ev = g.feed(0.5, t);
  assert.equal(ev, "end");
});

test("rms", () => {
  assert.equal(rms(new Float32Array([0, 0, 0])), 0);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);
});
