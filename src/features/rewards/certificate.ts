import { color, tr, type Reward } from "./types";

const T = {
  en: { head: "Certificate of Recognition", sub: "This certificate is proudly presented to", for: "for", date: "Awarded on", no: "Certificate No.", sign: "Meiyiyal Trust & Quality", place: "Tamil Nadu · meiyiyal.app" },
  ta: { head: "அங்கீகாரச் சான்றிதழ்", sub: "இந்தச் சான்றிதழ் பெருமையுடன் வழங்கப்படுகிறது", for: "சாதனை", date: "வழங்கிய நாள்", no: "சான்றிதழ் எண்", sign: "மெய்யியல் நம்பிக்கை & தரம்", place: "தமிழ்நாடு · meiyiyal.app" },
};
const img = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Renders a designed A4-landscape certificate on a canvas (EN/TA). */
export async function renderCertificate(r: Reward, name: string, profession: string, lang: "en" | "ta"): Promise<HTMLCanvasElement> {
  const W = 1754, H = 1240; const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d")!;
  const L = T[lang]; const accent = color(r.color).hex; const font = (w: number, s: number, serif = false) => `${w} ${s}px ${serif ? "Georgia, 'Noto Serif Tamil', 'Noto Sans Tamil', serif" : "Inter, 'Noto Sans Tamil', sans-serif"}`;
  try { await Promise.all([document.fonts.load(font(700, 40)), document.fonts.load("700 40px 'Noto Sans Tamil'", "தமிழ்")]); } catch { /* offline: system fonts */ }
  // paper
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#fffdf7"); bg.addColorStop(1, "#fbf3e2"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // guilloche-ish rings
  g.save(); g.globalAlpha = 0.06; g.strokeStyle = accent; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(W / 2, H / 2 + 40, 300 + i * 22, 180 + i * 14, (i * Math.PI) / 26, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  // borders
  const border = g.createLinearGradient(0, 0, W, 0); border.addColorStop(0, "#0f766e"); border.addColorStop(0.5, accent); border.addColorStop(1, "#b45309");
  g.strokeStyle = border; g.lineWidth = 18; g.strokeRect(36, 36, W - 72, H - 72);
  g.strokeStyle = "#c9a227"; g.lineWidth = 3; g.strokeRect(70, 70, W - 140, H - 140);
  // corner ornaments
  g.fillStyle = "#c9a227";
  for (const [x, y] of [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-14, -14, 28, 28); g.restore(); }
  // logo + brand
  try { const logo = await img("/icon-512.png"); g.save(); g.beginPath(); g.arc(W / 2, 175, 62, 0, Math.PI * 2); g.clip(); g.drawImage(logo, W / 2 - 62, 113, 124, 124); g.restore(); } catch { /* ignore */ }
  g.textAlign = "center"; g.fillStyle = "#0f766e"; g.font = font(700, 34); g.fillText(lang === "ta" ? "மெய்யியல்" : "MEIYIYAL", W / 2, 290);
  // heading
  g.fillStyle = "#1f2937"; g.font = font(700, lang === "ta" ? 64 : 72, true); g.fillText(L.head, W / 2, 400);
  g.fillStyle = "#6b7280"; g.font = font(400, 30); g.fillText(L.sub, W / 2, 470);
  // name
  g.fillStyle = "#111827"; g.font = font(700, 92, true); g.fillText(name, W / 2, 590);
  g.strokeStyle = "#c9a227"; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 420, 620); g.lineTo(W / 2 + 420, 620); g.stroke();
  g.fillStyle = "#4b5563"; g.font = font(500, 30); g.fillText(profession, W / 2, 672);
  // achievement ribbon
  const title = tr(r.title, lang); g.font = font(700, 46); const tw = Math.max(g.measureText(title).width + 120, 520);
  g.fillStyle = accent; roundRect(g, W / 2 - tw / 2, 715, tw, 88, 44); g.fill();
  g.fillStyle = "#fff"; g.fillText(title, W / 2, 775);
  g.fillStyle = "#374151"; g.font = font(400, 30); g.fillText(tr(r.desc, lang), W / 2, 862);
  // seal
  g.save(); g.translate(W - 300, H - 290);
  for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.fillStyle = "#c9a227"; g.beginPath(); g.moveTo(0, -112); g.lineTo(14, -92); g.lineTo(-14, -92); g.fill(); }
  const seal = g.createRadialGradient(0, 0, 10, 0, 0, 95); seal.addColorStop(0, "#fde68a"); seal.addColorStop(1, "#b45309");
  g.fillStyle = seal; g.beginPath(); g.arc(0, 0, 95, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fff"; g.font = font(800, 54); g.fillText("★", 0, 4); g.font = font(700, 18); g.fillText("VERIFIED", 0, 40);
  g.restore();
  // footer
  const d = r.awarded_at ? new Date(r.awarded_at) : new Date();
  g.textAlign = "left"; g.fillStyle = "#6b7280"; g.font = font(500, 24);
  g.fillText(`${L.date}: ${d.toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })}`, 160, H - 230);
  g.fillText(`${L.no}: ${r.cert_no ?? "—"}`, 160, H - 190);
  g.strokeStyle = "#9ca3af"; g.beginPath(); g.moveTo(160, H - 300); g.lineTo(560, H - 300); g.stroke();
  g.fillStyle = "#111827"; g.font = font(700, 26); g.fillText(L.sign, 160, H - 320);
  g.textAlign = "center"; g.fillStyle = "#9ca3af"; g.font = font(500, 22); g.fillText(L.place, W / 2, H - 110);
  return c;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), type, q));

/** Minimal single-page PDF (A4 landscape) embedding the certificate as JPEG. No dependency. */
export async function toPdf(c: HTMLCanvasElement): Promise<Blob> {
  const jpg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer());
  const pw = 842, ph = 595; const enc = new TextEncoder(); const parts: BlobPart[] = []; const offs: number[] = []; let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u as Uint8Array<ArrayBuffer>); len += u.length; };
  const obj = (n: number, body: string | (() => void)) => { offs[n] = len; push(`${n} 0 obj\n`); if (typeof body === "string") push(body); else body(); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push("\nendstream"); });
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}
