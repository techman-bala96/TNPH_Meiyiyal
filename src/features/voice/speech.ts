/** Speech-to-text behind an interface: browser Web Speech API today; a server STT (streaming to the agent service) can replace it. */
export type SttLang = "en" | "ta";
export interface Recognizer {
  readonly name: string;
  readonly supported: boolean;
  start(lang: SttLang): void;
  stop(): void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (code: string) => void;
  onEnd?: () => void;
}

type SR = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type SRCtor = new () => SR;

export class WebSpeechRecognizer implements Recognizer {
  readonly name = "web-speech";
  private ctor: SRCtor | undefined;
  private rec: SR | null = null;
  private want = false;
  onInterim?: (text: string) => void; onFinal?: (text: string) => void; onError?: (code: string) => void; onEnd?: () => void;
  constructor() {
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    this.ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }
  get supported() { return !!this.ctor; }
  start(lang: SttLang) {
    if (!this.ctor) { this.onError?.("unsupported"); return; }
    this.stop(); this.want = true;
    const r = new this.ctor();
    r.lang = lang === "ta" ? "ta-IN" : "en-IN"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]; const txt = res[0].transcript.trim();
        if (res.isFinal) { if (txt) this.onFinal?.(txt); } else interim += txt + " ";
      }
      if (interim.trim()) this.onInterim?.(interim.trim());
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") this.onError?.(e.error); };
    // browsers end sessions after silence; keep listening until the user turns the mic off
    r.onend = () => { if (this.want && this.rec === r) { try { r.start(); } catch { this.onEnd?.(); } } else this.onEnd?.(); };
    this.rec = r;
    try { r.start(); } catch { this.onError?.("start-failed"); }
  }
  stop() { this.want = false; const r = this.rec; this.rec = null; try { r?.abort(); } catch { /* already stopped */ } }
}

export function createRecognizer(): Recognizer {
  // if (import.meta.env.VITE_STT === "server") return new ServerRecognizer(); // streams audio to the agent's /agent/stt (future)
  return new WebSpeechRecognizer();
}

/** Speaks a reply; resolves when done (or immediately when TTS is unavailable). */
export function speak(text: string, lang: SttLang): Promise<void> {
  const log = ((window as unknown as { __meiyiyalSpoken?: { text: string; lang: string }[] }).__meiyiyalSpoken ??= []);
  log.push({ text, lang });
  if (!("speechSynthesis" in window) || !text) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "ta" ? "ta-IN" : "en-IN"; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "ta" ? "ta" : "en-in"));
    if (v) u.voice = v;
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(done, Math.min(12000, 1500 + text.length * 80));
    u.onend = done; u.onerror = done;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
export function stopSpeaking() { if ("speechSynthesis" in window) speechSynthesis.cancel(); }
