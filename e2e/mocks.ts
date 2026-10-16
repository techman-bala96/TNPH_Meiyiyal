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
