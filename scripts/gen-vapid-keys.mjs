// Make a VAPID key pair for Web Push. Run: node scripts/gen-vapid-keys.mjs
// Prints env lines. Keep the private key secret (Edge Function secret / supabase/functions/.env, never git).
// Use a separate pair for production. Changing the pair later means every device must subscribe again.
const { subtle } = globalThis.crypto;
const k = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const j = await subtle.exportKey("jwk", k.privateKey);
const pub = Buffer.from(new Uint8Array(await subtle.exportKey("raw", k.publicKey))).toString("base64url");
console.log(`# browser (public, safe to ship)\nVITE_VAPID_PUBLIC_KEY=${pub}`);
console.log(`# Edge Function secrets (private)\nVAPID_PRIVATE_KEY_JWK=${JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d })}`);
console.log(`VAPID_SUBJECT=mailto:support@meiyiyal.in`);
