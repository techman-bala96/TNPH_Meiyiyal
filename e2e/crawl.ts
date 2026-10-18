/**
 * Screen checks + click crawl, shared by e2e/crawl.spec.ts.
 * For one (role, route, language, viewport): screenshot, layout/i18n checks, then click every visible
 * clickable element once (fresh page each time) and record what happened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

export const SHOTS = process.env.SCENARIO_SHOTS ?? "/workspace/scenario-shots";
mkdirSync(SHOTS, { recursive: true });
mkdirSync(".cache/crawl", { recursive: true });

function flatKeys(o: Record<string, unknown>, pre = "", out = new Set<string>()) {
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object") flatKeys(v as Record<string, unknown>, key, out); else out.add(key);
  }
  return out;
}
const KEYS = [...flatKeys(JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8")))];
// Latin words that are fine inside Tamil UI: brand, acronyms, units, payment/ID terms people use as-is.
const LATIN_OK = /^(meiyiyal|upi|ifsc|gst|otp|pdf|jpg|png|km|min|mbbs|md|ms|bds|llb|be|btech|me|pan|id|ok|sms|email|e-mail|google|gmail|whatsapp|razorpay|razorpayx|tnmc|nmc|bci|coa|cmda|rci|vci|tnvc|dpdp|pwa|qr|ios|android|iphone|safari|chrome|app|wi-fi|wifi|gps|url|csv|json|rs|inr|ist|am|pm|en|ta|totp|mfa|admin|utr|tds|kyc|dlt|msg91|mock|test|dr|adv|er|mr|mrs|ms|uid|aadhaar|https?|www|com|in|co|draft|supabase|msg|maps|openstreetmap|osm|nominatim|turnstile|hostinger|surepass)$/i;

export type Row = { role: string; route: string; lang: string; size: string; key: string; label: string; kind: string; result: string; detail?: string };
export type Issue = { role: string; route: string; lang: string; size: string; check: string; detail: string };

export class Recorder {
  rows: Row[] = []; issues: Issue[] = []; shots: string[] = [];
  role: string;
  constructor(role: string) { this.role = role; }
  save() {
    const p = test.info().project.name;
    writeFileSync(`.cache/crawl/${p}-${this.role}.json`, JSON.stringify({ project: p, role: this.role, rows: this.rows, issues: this.issues, shots: this.shots }, null, 1));
  }
}

const slug = (s: string) => s.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

/** Stamp visible clickables in DOM order; returns their descriptors. Same order on every fresh load. */
async function stamp(page: Page) {
  return page.evaluate(() => {
    const sel = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="radio"], [role="link"], input[type="checkbox"], input[type="radio"], label[for], summary, select';
    const out: { id: number; key: string; label: string; kind: string; disabled: boolean; href: string | null; tag: string }[] = [];
    let n = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || el.closest("[aria-hidden='true'], [inert]")) continue;
      if (el.closest("[data-sonner-toaster], .leaflet-control-attribution")) continue;
      const tid = el.getAttribute("data-testid") ?? el.closest("[data-testid]")?.getAttribute("data-testid") ?? "";
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || (el as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 60);
      const kind = el.getAttribute("role") || el.tagName.toLowerCase();
      el.setAttribute("data-crawl", String(n));
      out.push({ id: n, key: `${tid}|${kind}|${label}`, label, kind, disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true", href: el.getAttribute("href"), tag: el.tagName });
      n++;
    }
    return out;
  });
}

export async function checkScreen(page: Page, rec: Recorder, route: string, lang: string) {
  const size = test.info().project.name;
  const add = (check: string, detail: string) => rec.issues.push({ role: rec.role, route, lang, size, check, detail });
  const r = await page.evaluate(({ keys, ta }) => {
    const res: { overflow: number; missing: string[]; latin: string[]; small: string[]; clipped: string[]; blank: boolean } = { overflow: 0, missing: [], latin: [], small: [], clipped: [], blank: false };
    res.overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const text = document.body.innerText;
    res.blank = text.trim().length < 3;
    const keySet = new Set(keys);
    for (const m of text.matchAll(/\b[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+\b/g)) if (keySet.has(m[0])) res.missing.push(m[0]);
    if (ta) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement; if (!el || el.closest("[data-i18n-skip], [translate='no'], input, textarea, script, style, .leaflet-container, [data-testid*='name'], [data-testid*='email'], [data-testid='signed-in-as'], [data-testid='lang-toggle'], [data-testid*='version']")) continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
        for (const w of (n.textContent ?? "").match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []) res.latin.push(w);
      }
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role='button'], [role='tab'], [role='switch'], input:not([type='hidden']), select"))) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest(".leaflet-control-attribution, [data-sonner-toaster]")) continue;
      if (el.tagName === "A" && el.closest("p, li") && cs.display === "inline") continue; // inline text links (WCAG 2.5.8 exception)
      if (r.width < 24 || r.height < 24) res.small.push(`${el.getAttribute("data-testid") ?? el.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, p, span, button, a, label, td, th, li"))) {
      if (!el.innerText || el.children.length > 2) continue;
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.width === 0) continue;
      if (cs.textOverflow === "ellipsis" || el.closest("[data-truncate-ok]") || r.width <= 2 || cs.position === "absolute" && cs.clip !== "auto") continue;
      if ((cs.overflow === "hidden" || cs.overflowX === "hidden") && el.scrollWidth > el.clientWidth + 2) res.clipped.push(`${el.getAttribute("data-testid") ?? el.tagName}:"${el.innerText.slice(0, 40)}"`);
    }
    return res;
  }, { keys: KEYS, ta: lang === "ta" });
  if (r.blank) add("blank", "page has no text");
  if (r.overflow > 1) add("overflow-x", `${r.overflow}px wider than the screen`);
  for (const k of r.missing) add("missing-key", k);
  const latin = [...new Set(r.latin.filter((w) => !LATIN_OK.test(w)))];
  if (latin.length) add("english-in-tamil", latin.slice(0, 25).join(", "));
  for (const s of [...new Set(r.small)]) add("tap-target<24px", s);
  for (const s of [...new Set(r.clipped)]) add("clipped-text", s);
}

export async function shotScreen(page: Page, rec: Recorder, route: string, lang: string, tag = "") {
  const file = `${SHOTS}/CRAWL-${test.info().project.name}-${rec.role}-${slug(route)}${tag ? "-" + tag : ""}-${lang}.png`;
  await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important} *{caret-color:transparent!important}" });
  await page.screenshot({ path: file, fullPage: true });
  rec.shots.push(file);
}

const SKIP = /btn-signout|delete-submit|go-online|admin-reject|admin-approve|appeal-overturn|appeal-uphold|payout-run|payout-pause|mfa-reset|setting-save|pack-save|reg-submit/;

/** Click every clickable on `route` once. `open` must bring a fresh copy of the screen up. */
export async function crawl(page: Page, rec: Recorder, route: string, lang: string, open: () => Promise<void>, seen: Set<string>) {
  const size = test.info().project.name;
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  await open();
  const items = await stamp(page);
  for (const it of items) {
    const key = `${route}|${it.key}`;
    if (seen.has(key)) continue; seen.add(key);
    const row: Row = { role: rec.role, route, lang, size, key: it.key, label: it.label, kind: it.kind, result: "" };
    rec.rows.push(row);
    if (it.disabled) { row.result = "disabled"; continue; }
    if (SKIP.test(it.key)) { row.result = "covered-by-scenario"; continue; }
    if (it.href && /^(https?:|mailto:|tel:)/.test(it.href) && !it.href.startsWith("http://localhost")) { row.result = "external-link"; row.detail = it.href; continue; }
    try {
      await open();
      const el = page.locator(`[data-crawl="${it.id}"]`);
      const now = await stamp(page).then((l) => l.find((x) => x.id === it.id));
      if (!now || now.key !== it.key) { row.result = "moved"; continue; }
      errors.length = 0;
      const before = { url: page.url(), sig: await page.evaluate(() => document.body.innerHTML.length + "|" + document.activeElement?.outerHTML.slice(0, 80)) };
      await page.evaluate(() => { (window as unknown as { __mut: number }).__mut = 0; new MutationObserver((l) => { (window as unknown as { __mut: number }).__mut += l.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
      const events: string[] = [];
      const onDl = () => events.push("download"), onFc = () => events.push("filechooser"), onPop = () => events.push("popup"), onDlg = (d: import("@playwright/test").Dialog) => { events.push("dialog"); void d.dismiss(); };
      page.on("download", onDl); page.on("filechooser", onFc); page.on("popup", onPop); page.on("dialog", onDlg);
      await el.click({ timeout: 4000, noWaitAfter: true });
      await page.waitForTimeout(700);
      await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
      page.off("download", onDl); page.off("filechooser", onFc); page.off("popup", onPop); page.off("dialog", onDlg);
      const after = await page.evaluate(() => ({ url: location.href, mut: (window as unknown as { __mut?: number }).__mut ?? 0, sig: document.body.innerHTML.length + "|" + document.activeElement?.outerHTML.slice(0, 80), text: document.body.innerText.trim().length })).catch(() => ({ url: page.url(), mut: 1, sig: "", text: 1 }));
      // a language toggle is a real click with a real effect; switch back so the rest of this pass stays in one language
      const home = new URL(page.url()).origin === new URL(before.url).origin;
      if (home && await page.evaluate(() => localStorage.getItem("i18nextLng")).catch(() => lang) !== lang) {
        await page.getByTestId("lang-toggle").first().click({ timeout: 3000 }).catch(() => undefined); await page.waitForTimeout(300);
        if (!row.detail) row.detail = "language switched (restored)";
      }
      const errs = errors.filter((e) => !/Failed to load resource: the server responded with a status of 4\d\d|favicon|ResizeObserver|Download the React DevTools/.test(e));
      if (after.text < 3) { row.result = "FAIL"; row.detail = "blank screen"; }
      else if (errs.length) { row.result = "FAIL"; row.detail = "console: " + errs.join(" | "); }
      else if (after.url !== before.url) { row.result = "ok"; row.detail = "→ " + new URL(after.url).pathname + new URL(after.url).search; }
      else if (events.length) { row.result = "ok"; row.detail = events.join(","); }
      else if (after.mut > 0 || after.sig !== before.sig) row.result = "ok";
      else { row.result = "FAIL"; row.detail = "dead click (nothing changed)"; }
    } catch (e) {
      row.result = "FAIL"; row.detail = "click failed: " + (e as Error).message.split("\n")[0].slice(0, 160);
    }
  }
}

/** Double tap on primary actions: no console errors, no duplicate effect toasts. */
export async function doubleTap(page: Page, rec: Recorder, route: string, lang: string, testids: string[], open: () => Promise<void>) {
  const size = test.info().project.name;
  for (const tid of testids) {
    await open();
    const el = page.getByTestId(tid).first();
    if (!(await el.count()) || !(await el.isEnabled().catch(() => false))) continue;
    const errs: string[] = []; const h = (e: Error) => errs.push(e.message); page.on("pageerror", h);
    await el.dblclick({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    page.off("pageerror", h);
    rec.rows.push({ role: rec.role, route, lang, size, key: `${tid}|double-tap|`, label: tid, kind: "double-tap", result: errs.length ? "FAIL" : "ok", detail: errs.join(" | ") || undefined });
  }
}

export function assertClean(rec: Recorder) {
  rec.save();
  const fails = rec.rows.filter((r) => r.result === "FAIL");
  const hard = rec.issues.filter((i) => ["blank", "overflow-x", "missing-key"].includes(i.check));
  expect.soft(fails, "click failures").toEqual([]);
  expect.soft(hard, "screen failures").toEqual([]);
}
