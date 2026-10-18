/** Shared helpers for the scenario specs: per-step screenshots named <scenario-id>-<project>-<step>.png. */
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
export const SCENARIO_SHOTS = process.env.SCENARIO_SHOTS ?? "/workspace/scenario-shots";
mkdirSync(SCENARIO_SHOTS, { recursive: true });
export const snap = (page: Page, id: string, step: string, fullPage = false) =>
  page.screenshot({ path: `${SCENARIO_SHOTS}/${id}-${test.info().project.name}-${step}.png`, fullPage }).catch(() => undefined);
export const tag = () => (test.info().project.name.includes("mobile") ? "m" : "d");
/** Record the language(s) a scenario ran in for docs/TEST-SCENARIOS.md. */
export const lang = (l: "en" | "ta" | "en + ta") => test.info().annotations.push({ type: "lang", description: l });
export const mode = (m: string) => test.info().annotations.push({ type: "mode", description: m });

/** Fake Web Speech: the test "speaks" with window.__voice.say(text); TTS finishes instantly but is logged. */
export async function mockSpeech(page: Page) {
  await page.addInitScript(() => {
    type L = ((e: unknown) => void) | null;
    const live: FakeRec[] = [];
    class FakeRec { lang = ""; continuous = false; interimResults = false; maxAlternatives = 1; onresult: L = null; onerror: L = null; onend: L = null; running = false;
      start() { this.running = true; live.push(this); }
      stop() { this.abort(); }
      abort() { this.running = false; const i = live.indexOf(this); if (i >= 0) live.splice(i, 1); } }
    const emit = (text: string, isFinal: boolean) => {
      const r = live.find((x) => x.running); if (!r) return false;
      const res = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal });
      r.onresult?.({ resultIndex: 0, results: [res] }); return true;
    };
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRec; w.webkitSpeechRecognition = FakeRec;
    w.__voice = { say: (t: string) => { emit(t.split(" ").slice(0, 2).join(" "), false); return emit(t, true); }, listening: () => live.some((x) => x.running), lang: () => live.find((x) => x.running)?.lang };
    const synth = { speaking: false, cancel() {}, getVoices: () => [], speak(u: { onend?: () => void }) { setTimeout(() => u.onend?.(), 30); } };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  });
}
export const say = async (p: Page, text: string) => {
  await expect.poll(() => p.evaluate(() => (window as unknown as { __voice: { listening: () => boolean } }).__voice.listening())).toBe(true);
  await p.evaluate((t) => (window as unknown as { __voice: { say: (t: string) => boolean } }).__voice.say(t), text);
};
export const spoken = (p: Page) => p.evaluate(() => ((window as unknown as { __meiyiyalSpoken?: { text: string; lang: string }[] }).__meiyiyalSpoken ?? []));

