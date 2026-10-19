import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
// 1x1 light-grey PNG for tiles we don't have cached
const BLANK = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4/x8AAwMB/6Xl0WYAAAAASUVORK5CYII=", "base64");
export const nominatimCalls: string[] = [];

/** Deterministic map: cached real OSM tiles from e2e/fixtures/tiles, fixture Nominatim responses. */
export async function mockMapNetwork(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (r) => {
    const m = new URL(r.request().url()).pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);
    const f = m && path.join(FIX, "tiles", m[1], m[2], `${m[3]}.png`);
    return r.fulfill({ status: 200, contentType: "image/png", body: f && fs.existsSync(f) ? fs.readFileSync(f) : BLANK });
  });
  await page.route("https://nominatim.openstreetmap.org/**", (r) => {
    const u = new URL(r.request().url());
    nominatimCalls.push(u.pathname);
    if (u.pathname === "/reverse") {
      const lat = Number(u.searchParams.get("lat"));
      const body = lat < 10
        ? fs.readFileSync(path.join(FIX, "nominatim-reverse-kk.json"), "utf8")
        : JSON.stringify({ lat: String(lat), lon: u.searchParams.get("lon"), name: "Marina Beach", display_name: "Marina Beach, Triplicane, Chennai, Tamil Nadu, 600005, India",
            address: { suburb: "Triplicane", city: "Chennai", state: "Tamil Nadu", country_code: "in" } });
      return r.fulfill({ status: 200, contentType: "application/json", body });
    }
    if (u.pathname === "/search") {
      const q = (u.searchParams.get("q") || "").toLowerCase();
      const body = q.includes("marina") ? fs.readFileSync(path.join(FIX, "nominatim-search-marina.json"), "utf8") : "[]";
      return r.fulfill({ status: 200, contentType: "application/json", body });
    }
    return r.fulfill({ status: 404, body: "" });
  });
}

/** Fresh user via email magic link (local Mailpit). */
export async function loginNewEmail(page: Page, request: import("@playwright/test").APIRequestContext, prefix = "u", existing?: string) {
  const email = existing ?? `${prefix}+${Math.random().toString(36).slice(2, 8)}-${Date.now()}@meiyiyal.test`;
  await page.goto("/login");
  await page.getByTestId("btn-email").click();
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("btn-send-link").click();
  await page.getByTestId("email-sent").waitFor();
  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const res = await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent("to:" + email)}`);
    const id = (await res.json()).messages?.[0]?.ID;
    if (id) {
      const msg = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)).json();
      link = (msg.HTML || msg.Text).match(/https?:\/\/[^"'\s<>]+verify[^"'\s<>]+/)?.[0]?.replace(/&amp;/g, "&");
    }
    if (!link) await page.waitForTimeout(500);
  }
  if (!link) throw new Error("magic link not received");
  await page.goto(link);
  return email;
}
