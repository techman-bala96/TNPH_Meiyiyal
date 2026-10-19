/** Voice-activity gate for the server recogniser: decides when an utterance starts and ends from RMS levels. Pure, unit-tested. */
export type GateOpts = { threshold: number; silenceMs: number; maxMs: number; minMs: number };
export const GATE_DEFAULTS: GateOpts = { threshold: 0.02, silenceMs: 1200, maxMs: 12000, minMs: 350 };

export class SpeechGate {
  private speaking = false; private startedAt = 0; private lastLoud = 0;
  private o: GateOpts;
  constructor(o: GateOpts = GATE_DEFAULTS) { this.o = o; }
  get active() { return this.speaking; }
  /** Returns "start" when speech begins, "end" when it should be cut (silence or max length), "drop" for a too-short blip, else null. */
  feed(rms: number, now: number): "start" | "end" | "drop" | null {
    const loud = rms >= this.o.threshold;
    if (!this.speaking) {
      if (!loud) return null;
      this.speaking = true; this.startedAt = now; this.lastLoud = now; return "start";
    }
    if (loud) this.lastLoud = now;
    if (now - this.startedAt >= this.o.maxMs || now - this.lastLoud >= this.o.silenceMs) {
      this.speaking = false;
      return this.lastLoud - this.startedAt < this.o.minMs ? "drop" : "end";
    }
    return null;
  }
}

export function rms(buf: Float32Array): number {
  let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}
