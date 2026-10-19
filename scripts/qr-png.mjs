// Render .cache/verify-fixtures/qr-payloads.json → qr-<name>.png (numeric Secure QR text, error level L).
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
const dir = ".cache/verify-fixtures";
const p = JSON.parse(readFileSync(`${dir}/qr-payloads.json`, "utf8"));
for (const [k, v] of Object.entries(p)) {
  await QRCode.toFile(`${dir}/qr-${k}.png`, [{ data: v, mode: "numeric" }], { errorCorrectionLevel: "L", scale: 4, margin: 4 });
}
console.log("qr png", Object.keys(p).length);
