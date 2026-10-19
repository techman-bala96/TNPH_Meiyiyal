import jsQR from "jsqr";

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
let detector: Detector | null | undefined;

function nativeDetector(): Detector | null {
  if (detector !== undefined) return detector;
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { detector = BD ? new BD({ formats: ["qr_code"] }) : null; } catch { detector = null; }
  return detector;
}

/** Decode a QR from a canvas: native BarcodeDetector when present (fast on Android Chrome), jsQR otherwise. */
export async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const nd = nativeDetector();
  if (nd) {
    try { const r = await nd.detect(canvas); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* fall through to jsQR */ }
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return hit?.data || null;
}

/** Decode a QR from an uploaded photo. Tries the full image and a downscaled copy (jsQR struggles on huge photos). */
export async function decodeFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  for (const max of [1600, 900, 2400]) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const v = await decodeCanvas(c);
    if (v) return v;
  }
  return null;
}
