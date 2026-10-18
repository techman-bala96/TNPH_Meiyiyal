/**
 * Core consultation edge cases on both sides (two or three browser contexts), the ones not already driven by
 * consult.spec / nearby.spec / live.spec. DB: result checks, cleanup, marked TIME TRAVEL steps.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open } from "./consultFlow";
import { loginNewEmail } from "./mocks";
import { lang, snap, tag } from "./scenario";

const LAW = "professionals--lawyer--property-land";
const API = "http://127.0.0.1:54321";
const ANON = readFileSync(".env.local", "utf8").match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)![1].replace(/"/g, "").trim();
const token = (p: Page) => p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token"))!; return JSON.parse(localStorage.getItem(k)!).access_token as string; });
const trusted = (q: string) => sql(`SELECT set_config('meiyiyal.trusted','on',false); ${q}`);
test.setTimeout(240_000);
const clean = (id: string) => sql(`DELETE FROM auth.users WHERE email LIKE 'cl${tag()}-${id}%@meiyiyal.test';`);
const law = (b: Browser, id: string, name: string, at = { latitude: 13.0317, longitude: 80.27 }, district = "chennai") =>
  makeWorker(b, `cl${tag()}-${id}-law`, name, IMG("lawyer"), LAW, at, district);
async function client(b: Browser, id: string, name: string, at?: { latitude: number; longitude: number }) {
  const s = await open(b, at); const email = await signInAt(s.page, s.page.request, `cl${tag()}-${id}-u`); await setProfile(s.page, name, IMG("engineer"));
  return { ...s, email };
}
async function sheet(u: Page, workerId: string) {
  await u.goto(`/browse/${LAW}`); await cardOf(u, workerId).click();
  if ((await u.getByTestId("wallet-balance").innerText()) === "0") await u.getByTestId("get-test-credits").click();
}
async function chat(u: Page, w: { page: Page; id: string }) {
  await sheet(u, w.id); await u.getByTestId("req-chat").click();
  await w.page.getByTestId("ring-accept").click();
  await u.waitForURL(/\/session\//); await w.page.waitForURL(/\/session\//);
  return new URL(u.url()).pathname.split("/").pop()!;
}

test("[CL01] client cancels while it rings → the ring stops on the professional's side; a late Accept on a stale screen opens nothing and says it ended", async ({ browser }) => {
  clean("01");
  const w = await law(browser, "01", "Adv. Cancel Test"); const u = await client(browser, "01", "Cancel Client");
  await sheet(u.page, w.id); await u.page.getByTestId("req-chat").click();
  await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await u.page.getByTestId("ring-cancel").click();
  await expect(w.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 10_000 });
  await snap(w.page, "CL01", "ring-stopped");
  // race: the professional's phone missed the cancel (no network for a moment) and they tap Accept
  await sheet(u.page, w.id);
  trusted(`UPDATE public.consult_requests SET created_at = created_at - interval '31 minutes', responded_at = responded_at - interval '31 minutes', expires_at = expires_at - interval '31 minutes' WHERE user_name = 'Cancel Client' AND status <> 'ringing';`);
  await u.page.getByTestId("req-chat").click();
  await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await w.ctx.setOffline(true);
  await u.page.getByTestId("ring-cancel").click();
  await expect.poll(() => sql(`SELECT status FROM public.consult_requests WHERE user_name = 'Cancel Client' ORDER BY created_at DESC LIMIT 1`)).not.toBe("ringing");
  await w.ctx.setOffline(false);
  await w.page.getByTestId("ring-accept").click().catch(() => undefined);
  await expect(w.page).not.toHaveURL(/\/session\//, { timeout: 5000 });
  await expect(w.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 10_000 });
  await snap(w.page, "CL01", "late-accept");
  expect(sql(`SELECT count(*) FROM public.consult_sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email = '${u.email}'`)).toBe("0");
  await w.ctx.close(); await u.ctx.close();
});

test("[CL02] professional signed in on two devices → both ring; Accept on one → the other stops ringing and cannot accept", async ({ browser }) => {
  clean("02");
  const w = await law(browser, "02", "Adv. Two Devices"); const u = await client(browser, "02", "Two Device Client");
  const dev2 = await open(browser);
  await loginNewEmail(dev2.page, dev2.page.request, "x", w.email); await dev2.page.waitForURL((x) => !x.pathname.startsWith("/auth/callback"));
  if (dev2.page.url().includes("/location")) await dev2.page.getByTestId("btn-confirm").click();
  await dev2.page.goto("/?tab=worker");
  await sheet(u.page, w.id); await u.page.getByTestId("req-chat").click();
  await expect(w.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await expect(dev2.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await snap(dev2.page, "CL02", "both-ringing");
  await w.page.getByTestId("ring-accept").click();
  await w.page.waitForURL(/\/session\//);
  await expect(dev2.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 10_000 });
  await snap(dev2.page, "CL02", "second-stopped");
  expect(sql(`SELECT count(*) FROM public.consult_sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email = '${u.email}'`)).toBe("1");
  await w.page.getByTestId("end-session").click();
  await dev2.ctx.close(); await w.ctx.close(); await u.ctx.close();
});

test("[CL03] professional goes offline → shown Offline, cannot be requested; paid message instead: 3 a day, the 4th is refused with a clear message (en + ta)", async ({ browser }) => {
  lang("en + ta");
  clean("03");
  const w = await law(browser, "03", "Adv. Offline Pro"); const u = await client(browser, "03", "Message Client");
  await w.page.getByTestId("go-online").click(); await expect(w.page.getByTestId("go-online")).not.toBeChecked();
  await u.page.goto(`/w/${w.id}`);
  await expect(u.page.getByTestId("wp-message")).toBeVisible();
  await snap(u.page, "CL03", "offline-profile");
  await u.page.goto("/wallet"); // credits for messages
  await u.page.goto(`/browse/${LAW}`); await cardOf(u.page, w.id).click();
  await expect(u.page.getByTestId("req-chat")).toBeDisabled();
  if ((await u.page.getByTestId("wallet-balance").innerText()) === "0") await u.page.getByTestId("get-test-credits").click().catch(() => undefined);
  await u.page.keyboard.press("Escape");
  for (let i = 1; i <= 4; i++) {
    await u.page.goto(`/w/${w.id}`); await u.page.getByTestId("wp-message").click();
    const ms = u.page.getByTestId("message-sheet");
    await ms.getByTestId("message-body").fill(`Question ${i}: please call me about my land papers.`);
    await ms.getByTestId("message-send").click();
    if (i < 4) await expect(ms).toHaveCount(0, { timeout: 10_000 });
  }
  await expect(u.page.getByText("You have sent 3 messages to this professional today.")).toBeVisible();
  await snap(u.page, "CL03", "limit");
  await u.page.keyboard.press("Escape"); await expect(u.page.getByTestId("message-sheet")).toHaveCount(0);
  await u.page.getByTestId("lang-toggle").first().click();
  await u.page.getByTestId("wp-message").click();
  await u.page.getByTestId("message-sheet").getByTestId("message-body").fill("ஐந்தாவது கேள்வி");
  await u.page.getByTestId("message-send").click();
  await expect(u.page.getByText(/இன்று இவருக்கு 3 செய்திகள்/)).toBeVisible();
  await snap(u.page, "CL03", "limit-ta");
  await w.page.goto("/messages");
  await expect(w.page.getByTestId("message-row")).toHaveCount(3);
  await w.ctx.close(); await u.ctx.close();
});

test("[CL04] chat both ways in Tamil, English and emoji; history after the end keeps everything in order", async ({ browser }) => {
  lang("en + ta");
  clean("04");
  const w = await law(browser, "04", "Adv. Bilingual"); const u = await client(browser, "04", "Tamil Client");
  await chat(u.page, w);
  const lines: [Page, string][] = [[u.page, "வணக்கம் சார், பட்டா மாற்றம் பற்றி கேட்க வேண்டும் 🙏"], [w.page, "Sure 👍 send the patta copy"], [u.page, "சரி, இதோ அனுப்புகிறேன் 📄"], [w.page, "நன்றி! I'll check."]];
  for (const [p, text] of lines) { await p.getByTestId("chat-input").fill(text); await p.getByTestId("chat-send").click(); }
  for (const p of [u.page, w.page]) for (const [, text] of lines) await expect(p.getByTestId("msg").filter({ hasText: text })).toHaveCount(1);
  await snap(u.page, "CL04", "chat-client"); await snap(w.page, "CL04", "chat-pro");
  await u.page.getByTestId("end-session").click();
  await u.page.goto("/history"); await u.page.getByTestId("history-row").first().click();
  const texts = await u.page.getByTestId("msg").allInnerTexts();
  const order = lines.map(([, t]) => texts.findIndex((x) => x.includes(t)));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await snap(u.page, "CL04", "history");
  await w.ctx.close(); await u.ctx.close();
});

test("[CL05] video call controls: mute, camera off/on, switch camera (two cameras), end by the professional", async ({ browser }) => {
  clean("05");
  const w = await law(browser, "05", "Adv. Video Controls"); const u = await client(browser, "05", "Video Client");
  // this phone has a front and a back camera (Chrome's fake device answers both)
  await u.page.addInitScript(() => {
    const md = navigator.mediaDevices; const enumerate = md.enumerateDevices.bind(md); const gum = md.getUserMedia.bind(md);
    md.enumerateDevices = async () => { const l = await enumerate(); const cam = l.find((d) => d.kind === "videoinput"); return cam ? [...l, { deviceId: "back-cam", groupId: "g", kind: "videoinput", label: "Back camera", toJSON() { return this; } } as MediaDeviceInfo] : l; };
    md.getUserMedia = (c?: MediaStreamConstraints) => { const v = c?.video as MediaTrackConstraints | undefined; const exact = (v?.deviceId as ConstrainDOMStringParameters | undefined)?.exact; (window as unknown as { __flip?: number }).__flip = ((window as unknown as { __flip?: number }).__flip ?? 0) + (exact === "back-cam" ? 1 : 0); return gum(exact === "back-cam" ? { ...c, video: { width: 640, height: 480 } } : c); };
  });
  await chat(u.page, w); await u.page.reload();
  await u.page.getByTestId("start-video").click();
  await w.page.getByTestId("call-accept").click();
  await expect(u.page.getByTestId("call-view")).toHaveAttribute("data-state", "connected", { timeout: 25_000 });
  const localTrack = (kind: "audio" | "video") => u.page.getByTestId("local-video").evaluate((v: HTMLVideoElement, k) => { const s = v.srcObject as MediaStream; const tr = k === "audio" ? s.getAudioTracks()[0] : s.getVideoTracks()[0]; return tr ? tr.enabled : null; }, kind);
  await u.page.getByTestId("call-mute").click();
  await expect(u.page.getByTestId("call-mute")).toHaveAttribute("aria-pressed", "true");
  expect(await localTrack("audio")).toBe(false);
  await u.page.getByTestId("call-cam").click();
  await expect(u.page.getByTestId("call-cam")).toHaveAttribute("aria-pressed", "true");
  expect(await localTrack("video")).toBe(false);
  await snap(u.page, "CL05", "muted-camera-off");
  await u.page.getByTestId("call-cam").click(); await u.page.getByTestId("call-mute").click();
  expect(await localTrack("video")).toBe(true); expect(await localTrack("audio")).toBe(true);
  await u.page.getByTestId("call-flip").click();
  await expect.poll(() => u.page.evaluate(() => (window as unknown as { __flip?: number }).__flip ?? 0)).toBe(1);
  await expect.poll(() => w.page.getByTestId("remote-video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(u.page.getByTestId("call-view")).toHaveAttribute("data-state", "connected");
  await snap(u.page, "CL05", "switched-camera");
  await w.page.getByTestId("call-hangup").click();
  await expect(u.page.getByTestId("call-view")).toHaveCount(0, { timeout: 10_000 });
  await w.page.getByTestId("end-session").click();
  await expect(u.page.getByTestId("session-summary")).toBeVisible({ timeout: 10_000 });
  await w.ctx.close(); await u.ctx.close();
});

test("[CL06] both sides lose the connection → billing pauses; nobody back in 3 minutes → ended at the pause, both can reconnect", async ({ browser }) => {
  clean("06");
  const w = await law(browser, "06", "Adv. Both Drop"); const u = await client(browser, "06", "Both Drop Client");
  const sid = await chat(u.page, w);
  await u.page.goto("about:blank"); await w.page.goto("about:blank");
  // TIME TRAVEL: 40 s with no heartbeat from either side (the 5 s sweep pauses the session)
  trusted(`UPDATE public.consult_sessions SET user_seen_at = now() - interval '40 seconds', worker_seen_at = now() - interval '40 seconds' WHERE id = '${sid}';`);
  await expect.poll(() => sql(`SELECT paused_at IS NOT NULL FROM public.consult_sessions WHERE id = '${sid}'`), { timeout: 25_000 }).toBe("t");
  const used = sql(`SELECT credits_used FROM public.consult_sessions WHERE id = '${sid}'`);
  trusted(`UPDATE public.consult_sessions SET started_at = started_at - interval '5 minutes', paused_at = paused_at - interval '4 minutes', user_seen_at = now() - interval '5 minutes', worker_seen_at = now() - interval '5 minutes' WHERE id = '${sid}';`);
  await expect.poll(() => sql(`SELECT end_reason FROM public.consult_sessions WHERE id = '${sid}'`), { timeout: 25_000 }).toBe("dropped");
  expect(sql(`SELECT credits_used FROM public.consult_sessions WHERE id = '${sid}'`)).toBe(used); // nothing billed while both were away
  await u.page.goto(`/session/${sid}`); await w.page.goto(`/session/${sid}`);
  await expect(u.page.getByTestId("end-title")).toHaveAttribute("data-reason", "dropped");
  await expect(u.page.getByTestId("reconnect")).toBeVisible();
  await snap(u.page, "CL06", "client-ended"); await snap(w.page, "CL06", "pro-ended");
  await w.ctx.close(); await u.ctx.close();
});

test("[CL07] documents: photo + PDF both ways, opened by the other side; wrong type and over 20 MB refused; a third person and a signed-out visitor cannot fetch them; still there after the end", async ({ browser }) => {
  clean("07");
  const w = await law(browser, "07", "Adv. Documents"); const u = await client(browser, "07", "Document Client");
  const sid = await chat(u.page, w);
  await u.page.getByTestId("file-input").setInputFiles(IMG("certificate"));
  await w.page.getByTestId("file-input").setInputFiles({ name: "advice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%advice\ntrailer<<>>\n%%EOF") });
  await expect(w.page.getByTestId("msg-file").locator("img")).toBeVisible({ timeout: 15_000 });
  const pdf = u.page.getByTestId("msg-file").filter({ hasText: "advice.pdf" });
  await expect(pdf).toBeVisible({ timeout: 15_000 });
  const href = await pdf.locator("a").getAttribute("href");
  expect(href).toMatch(/\/storage\/v1\/object\/sign\/consult-files\//);
  const got = await u.page.request.get(href!); expect(got.status()).toBe(200); expect((await got.body()).toString()).toContain("%advice");
  await snap(u.page, "CL07", "files-both-ways");
  await u.page.getByTestId("file-input").setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(u.page.getByText("Send a photo, PDF or Word file.")).toBeVisible();
  await u.page.getByTestId("file-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(21 * 1024 * 1024, 1) });
  await expect(u.page.getByText("File too large (max 20 MB)")).toBeVisible();
  await snap(u.page, "CL07", "refused");
  // upload fails half way (network) → plain message, nothing half-posted
  await u.page.route("**/storage/v1/object/consult-files/**", (r) => r.abort("failed"));
  await u.page.getByTestId("file-input").setInputFiles(IMG("lawyer"));
  await expect(u.page.getByText("No connection. Check your internet and try again.")).toBeVisible();
  await u.page.unroute("**/storage/v1/object/consult-files/**");
  // access control: the storage path is useless to anyone else
  const path = sql(`SELECT file_path FROM public.consult_messages WHERE session_id = '${sid}' AND file_name = 'advice.pdf'`);
  const third = await client(browser, "07x", "Nosy Third");
  const tk = await token(third.page);
  const sign = await third.page.request.post(`${API}/storage/v1/object/sign/consult-files/${path}`, { headers: { apikey: ANON, authorization: `Bearer ${tk}`, "content-type": "application/json" }, data: { expiresIn: 60 } });
  expect(sign.ok()).toBe(false);
  const direct = await third.page.request.get(`${API}/storage/v1/object/authenticated/consult-files/${path}`, { headers: { apikey: ANON, authorization: `Bearer ${tk}` } });
  expect(direct.ok()).toBe(false);
  const anon = await third.page.request.get(`${API}/storage/v1/object/public/consult-files/${path}`);
  expect(anon.ok()).toBe(false);
  // after the end the files are still in the read-only history for both
  await u.page.getByTestId("end-session").click();
  await w.page.goto(`/session/${sid}`);
  await expect(w.page.getByTestId("msg-file").locator("img")).toBeVisible();
  await snap(w.page, "CL07", "after-end");
  await third.ctx.close(); await w.ctx.close(); await u.ctx.close();
});

test("[CL08] location: distances are whole km (or under 1 km) and nearest first across districts; exact coordinates of professionals are never sent to clients", async ({ browser }) => {
  clean("08");
  const near = await law(browser, "08n", "Adv. Very Near", { latitude: 13.0350, longitude: 80.2700 }, "chennai");           // ~0.4 km
  const mid = await law(browser, "08m", "Adv. Kanchi Mid", { latitude: 12.8342, longitude: 79.7036 }, "kancheepuram");  // ~65 km
  const far = await law(browser, "08f", "Adv. Madurai Far", { latitude: 9.9252, longitude: 78.1198 }, "madurai");       // ~420 km
  const u = await client(browser, "08", "Distance Client");
  const res = u.page.waitForResponse((r) => r.url().includes("/rpc/search_workers"));
  await u.page.goto(`/browse/${LAW}`);
  await u.page.getByTestId("list-all").click().catch(() => undefined);
  const rows = await (await res).json() as Record<string, unknown>[];
  for (const r of rows) {
    expect(Object.keys(r).some((k) => /lat|lng|lon|geog|coord/i.test(k))).toBe(false);
    expect(Number.isInteger(Number(r.distance_km))).toBe(true);
  }
  await expect(cardOf(u.page, near.id)).toBeVisible();
  const ids = await u.page.getByTestId("worker-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const pos = [near.id, mid.id, far.id].map((id) => ids.indexOf(id)).filter((i) => i >= 0);
  expect(pos).toEqual([...pos].sort((a, b) => a - b));
  await expect(cardOf(u.page, near.id)).toContainText(/<\s?1 km|1 km/);
  await snap(u.page, "CL08", "distances");
  const prof = u.page.waitForResponse((r) => r.url().includes("/rpc/") && r.url().includes("worker"));
  await u.page.goto(`/w/${far.id}`);
  const body = await (await prof).text();
  expect(body).not.toMatch(/9\.925|78\.119/);
  for (const s of [near, mid, far]) await s.ctx.close(); await u.ctx.close();
});

test("[CL09] professional moves: going online from a new place moves them in search; a new location while online moves them again", async ({ browser }) => {
  clean("09");
  const w = await law(browser, "09", "Adv. Travelling", { latitude: 13.0317, longitude: 80.27 }, "chennai");
  const u = await client(browser, "09", "Search Client", { latitude: 9.9252, longitude: 78.1198 });
  const km = async () => { await u.page.goto(`/browse/${LAW}`); await u.page.getByTestId("list-all").click().catch(() => undefined); return (await cardOf(u.page, w.id).innerText()); };
  expect(await km()).toMatch(/4\d\d km/);
  // the professional travels to Madurai: off, confirms the new place, on again
  await w.page.getByTestId("go-online").click(); await expect(w.page.getByTestId("go-online")).not.toBeChecked();
  await w.ctx.setGeolocation({ latitude: 9.93, longitude: 78.12 });
  await w.page.getByTestId("loc-chip").click().catch(async () => { await w.page.goto("/location"); });
  await w.page.getByTestId("btn-locate").click().catch(() => undefined);
  await w.page.getByTestId("btn-confirm").click();
  await w.page.goto("/?tab=worker"); await w.page.getByTestId("go-online").click(); await expect(w.page.getByTestId("go-online")).toBeChecked();
  await expect.poll(km, { timeout: 15_000 }).toMatch(/<\s?1 km|^[^0-9]*1 km|\b[0-2] km/);
  await snap(u.page, "CL09", "moved-near");
  await w.ctx.close(); await u.ctx.close();
});
