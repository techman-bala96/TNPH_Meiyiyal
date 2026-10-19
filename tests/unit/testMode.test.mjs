// VITE_TEST_MODE: flag parsing, index.html noindex/class, robots.txt, banner copy in both languages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTestModeValue, testModeHtml, NOINDEX_ROBOTS_TXT, TEST_MODE } from "../../src/lib/testMode.ts";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const en = JSON.parse(readFileSync(new URL("../../src/i18n/locales/en.json", import.meta.url), "utf8"));
const ta = JSON.parse(readFileSync(new URL("../../src/i18n/locales/ta.json", import.meta.url), "utf8"));

test("only the string true turns test mode on", () => {
  for (const v of ["true", "TRUE", " true "]) assert.equal(isTestModeValue(v), true, v);
  for (const v of [undefined, null, "", "false", "0", "1", "yes", "no"]) assert.equal(isTestModeValue(v), false, String(v));
  assert.equal(TEST_MODE, false, "off when import.meta.env is absent");
});
test("flag off: index.html is untouched", () => {
  assert.equal(testModeHtml(html, false), html);
  assert.doesNotMatch(html, /noindex/);
});
test("flag on: noindex meta and html.test-mode, once", () => {
  const out = testModeHtml(html, true);
  assert.match(out, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(out, /<html lang="ta" class="test-mode">/);
  assert.equal(out.match(/name="robots"/g).length, 1);
  assert.match(testModeHtml('<html class="dark"><title>x</title>', true), /<html class="dark test-mode">/);
});
test("flag on: robots.txt blocks every crawler", () => assert.equal(NOINDEX_ROBOTS_TXT, "User-agent: *\nDisallow: /\n"));
test("banner text in English and natural Tamil", () => {
  assert.equal(en.testMode.banner, "Test version — payments and OTP are not real");
  assert.match(ta.testMode.banner, /^சோதனைப் பதிப்பு — /);
  assert.match(ta.testMode.banner, /OTP/);
});
test("layout: page, sticky headers, full-height screens and the session pill move below the bar", () => {
  const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");
  for (const r of [/html\.test-mode body \{ padding-top: var\(--tm-h\)/, /html\.test-mode \.sticky\.top-0/, /html\.test-mode \.h-dvh/, /html\.test-mode\.has-session-pill body/]) assert.match(css, r);
  assert.match(readFileSync(new URL("../../src/features/consult/ConsultProvider.tsx", import.meta.url), "utf8"), /var\(--tm-h/);
});
