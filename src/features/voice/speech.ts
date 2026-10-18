/** Speech-to-text behind an interface: the browser Web Speech API, or the agent service's /agent/stt (VITE_STT=server|auto). */
import { transcribeAudio } from "./agent";
import { SpeechGate, rms } from "./speechGate";
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

/** Records one utterance at a time (voice-activity gate), uploads it to /agent/stt and reports the transcript. Audio is never stored. */
export class ServerRecognizer implements Recognizer {
  readonly name = "server";
  onInterim?: (text: string) => void; onFinal?: (text: string) => void; onError?: (code: string) => void; onEnd?: () => void;
  private want = false; private stream: MediaStream | null = null; private ctx: AudioContext | null = null; private timer: number | null = null;
  private rec: MediaRecorder | null = null; private chunks: Blob[] = [];
  get supported() { return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"; }
  async start(lang: SttLang) {
    if (!this.supported) { this.onError?.("unsupported"); return; }
    this.stop(); this.want = true;
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { this.want = false; this.onError?.("not-allowed"); this.onEnd?.(); return; }
    if (!this.want) { this.release(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC(); const an = this.ctx.createAnalyser(); an.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(an);
    const buf = new Float32Array(an.fftSize); const gate = new SpeechGate();
    const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
    this.timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const ev = gate.feed(rms(buf), performance.now());
      if (ev === "start") {
        this.chunks = []; this.rec = new MediaRecorder(this.stream!, mime ? { mimeType: mime } : undefined);
        this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
        this.rec.start(250); this.onInterim?.("…");
      } else if (ev === "end" || ev === "drop") {
        const r = this.rec; this.rec = null; if (!r) return;
        r.onstop = () => {
          if (ev === "drop" || !this.chunks.length) return;
          const blob = new Blob(this.chunks, { type: r.mimeType || mime || "audio/webm" });
          transcribeAudio(blob, lang).then((t) => { if (t) this.onFinal?.(t); }).catch((e: Error) => this.onError?.(e.message === "rate" ? "rate" : "network"));
        };
        try { r.stop(); } catch { /* already stopped */ }
      }
    }, 100);
  }
  private release() {
    if (this.timer != null) window.clearInterval(this.timer); this.timer = null;
    if (this.rec) { this.rec.onstop = null; try { this.rec.stop(); } catch { /* ignore */ } } this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    void this.ctx?.close().catch(() => undefined); this.ctx = null;
  }
  stop() { const was = this.want; this.want = false; this.release(); if (was) this.onEnd?.(); }
}

/** VITE_STT: "browser" (default) | "server" | "auto" (browser when it has Web Speech, else server). */
export function createRecognizer(mode: string = (import.meta.env.VITE_STT as string | undefined) ?? "browser"): Recognizer {
  const web = new WebSpeechRecognizer();
  if (mode === "server") { const s = new ServerRecognizer(); return s.supported ? s : web; }
  if (mode === "auto" && !web.supported) { const s = new ServerRecognizer(); if (s.supported) return s; }
  return web;
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
