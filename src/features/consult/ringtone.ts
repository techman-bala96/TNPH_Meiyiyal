/** In-app ring: generated dual-tone (no asset), repeating, plus vibration where supported. */
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
export let ringing = false;
let vibrated = false; // only cancel a vibration we started (Chrome logs an error for vibrate() before any tap)

function burst(freqs: number[], ms: number) {
  if (!ctx) return;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ctx.destination);
  const now = ctx.currentTime;
  g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
  for (const f of freqs) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(now); o.stop(now + ms / 1000); }
}
export function startRing(kind: "incoming" | "outgoing" = "incoming") {
  stopRing();
  ringing = true;
  try { ctx = ctx ?? new AudioContext(); void ctx.resume(); } catch { ctx = null; }
  const play = () => {
    if (kind === "incoming") { burst([440, 480], 400); setTimeout(() => burst([440, 480], 400), 550); }
    else burst([425], 900);
    if (kind === "incoming" && "vibrate" in navigator && navigator.userActivation?.hasBeenActive !== false) vibrated = navigator.vibrate?.([400, 200, 400]) || vibrated;
  };
  play();
  timer = setInterval(play, kind === "incoming" ? 2500 : 3000);
  (window as unknown as { __meiyiyalRing?: string }).__meiyiyalRing = kind;
}
export function stopRing() {
  ringing = false;
  if (timer) clearInterval(timer);
  timer = null;
  if (vibrated && "vibrate" in navigator) { navigator.vibrate?.(0); vibrated = false; }
  (window as unknown as { __meiyiyalRing?: string }).__meiyiyalRing = undefined;
}
