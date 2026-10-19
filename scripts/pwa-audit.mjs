#!/usr/bin/env node
// PWA + Lighthouse audit of the PRODUCTION build (dist/). Run `npm run build` first; `npm run test:pwa` does both.
// 1) PWA checks with Playwright: manifest fields/icons, service worker controls the page, app shell loads offline.
// 2) Lighthouse (mobile emulation) on /login: performance / accessibility / best-practices / SEO against budgets below.
// Reports: test-results/lighthouse/*.html
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const PORT = 4173, BASE = `http://localhost:${PORT}`;
const BUDGET = { performance: 0.6, accessibility: 0.95, "best-practices": 0.9, seo: 0.9 };
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails.push(msg); };

const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore", detached: true });
const stopPreview = () => { try { process.kill(-preview.pid, "SIGTERM"); } catch { /* gone */ } };
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error("preview did not start"); };

try {
  await up();
  // ---------- PWA ----------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  const href = await page.getAttribute('link[rel="manifest"]', "href");
  check(!!href, "manifest is linked");
  const m = await (await fetch(new URL(href ?? "/manifest.webmanifest", BASE))).json();
  check(m.name && m.short_name, "manifest name + short_name");
  check(m.display === "standalone" && m.start_url === "/", "standalone display, start_url /");
  check(!!m.theme_color && !!m.background_color, "theme + background colours");
  const sizes = (m.icons ?? []).map((i) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ""}`);
  check(sizes.includes("192x192") && sizes.includes("512x512") && sizes.some((s) => s.endsWith(":maskable")), `icons 192/512/maskable (${sizes.join(", ")})`);
  for (const i of m.icons ?? []) check((await fetch(new URL(i.src, BASE))).ok, `icon ${i.src} served`);
  check(!!(await page.getAttribute('meta[name="theme-color"]', "content")), "theme-color meta");
  check(!!(await page.getAttribute('link[rel="apple-touch-icon"]', "href")), "apple-touch-icon");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 15_000 }).catch(() => undefined);
  await page.reload(); await page.waitForTimeout(1500);
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { reg: !!r?.active, ctl: !!navigator.serviceWorker.controller }; });
  check(sw.reg, "service worker active"); check(sw.ctl, "service worker controls the page");
  await ctx.setOffline(true);
  await page.goto(`${BASE}/privacy`).catch(() => undefined);
  check(await page.getByTestId("legal-privacy").isVisible().catch(() => false), "app shell + /privacy load offline");
  await ctx.setOffline(false); await browser.close();

  // ---------- Lighthouse ----------
  mkdirSync("test-results/lighthouse", { recursive: true });
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new", "--no-sandbox"] });
  try {
    for (const path of ["/login", "/privacy"]) {
      const r = await lighthouse(`${BASE}${path}`, { port: chrome.port, output: "html", onlyCategories: Object.keys(BUDGET), formFactor: "mobile", screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } });
      writeFileSync(`test-results/lighthouse/${path.slice(1) || "home"}.html`, r.report);
      for (const [k, min] of Object.entries(BUDGET)) {
        const s = r.lhr.categories[k]?.score ?? 0;
        check(s >= min, `lighthouse ${path} ${k} ${Math.round(s * 100)} ≥ ${min * 100}`);
      }
    }
  } finally { await chrome.kill(); }
} finally {
  stopPreview();
}
if (fails.length) { console.error(`\n${fails.length} PWA/Lighthouse check(s) failed`); process.exit(1); }
console.log("\nPWA + Lighthouse: all checks passed");
process.exit(0);
