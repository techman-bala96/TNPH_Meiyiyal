import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const headers = readFileSync(new URL("../../deploy/cloudflare/_headers", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../../deploy/cloudflare/_redirects", import.meta.url), "utf8");
const htaccess = readFileSync(new URL("../../deploy/hostinger/.htaccess", import.meta.url), "utf8");

// Parse Cloudflare's _headers format: unindented line = path rule, indented "Name: value" = header for it.
const rules = {};
let cur = null;
for (const line of headers.split("\n")) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  if (!/^\s/.test(line)) { cur = line.trim(); rules[cur] = {}; continue; }
  const i = line.indexOf(":");
  rules[cur][line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
}

test("Cloudflare _headers: same CSP as the Hostinger fallback", () => {
  const ht = htaccess.match(/Content-Security-Policy "([^"]+)"/)[1];
  assert.equal(rules["/*"]["content-security-policy"], ht);
  for (const h of ["strict-transport-security", "x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy"]) assert.ok(rules["/*"][h], h);
  assert.match(rules["/*"]["content-security-policy"], /font-src 'self' https:\/\/fonts\.gstatic\.com/);
  assert.match(rules["/*"]["content-security-policy"], /style-src [^;]*https:\/\/fonts\.googleapis\.com/);
});

test("Cloudflare _headers: caching and admin noindex", () => {
  assert.equal(rules["/assets/*"]["cache-control"], "public, max-age=31536000, immutable");
  for (const p of ["/", "/index.html", "/sw.js", "/manifest.webmanifest"]) assert.equal(rules[p]["cache-control"], "no-cache", p);
  assert.equal(rules["/*"]["cache-control"], undefined, "Cache-Control on /* would be joined with the per-path values");
  for (const p of ["https://admin.meiyiyal.com/*", "/admin", "/admin/*"]) assert.equal(rules[p]["x-robots-tag"], "noindex, nofollow", p);
});

test("Cloudflare _redirects: no SPA catch-all (Pages does it; the rule would be ignored as a loop)", () => {
  const active = redirects.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  assert.deepEqual(active, []);
  assert.equal(existsSync(new URL("../../public/404.html", import.meta.url)), false, "a top-level 404.html turns off Pages SPA mode");
});
