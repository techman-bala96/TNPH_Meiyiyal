import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";

const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
const shot = (page: Page, name: string) => {
  const p = test.info().project.name;
  return page.screenshot({ path: `${SHOTS}/${p === "mobile" ? "" : "desktop-"}${name}.png` });
};
const CHENNAI = { latitude: 13.0317, longitude: 80.27 };
async function open(browser: Browser, at = CHENNAI) {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: at, permissions: ["geolocation", "camera", "microphone"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  return { ctx, page };
}
/** Account + profile via real UI; worker row approved directly (registration+approval UI is covered by worker-reg/marketplace specs). */
async function makeWorker(browser: Browser, prefix: string, name: string, photo: string, node: string, at: { latitude: number; longitude: number }, district: string) {
  const s = await open(browser, at);
  const email = await signInAt(s.page, s.page.request, prefix);
  await setProfile(s.page, name, photo);
  sql(`SELECT set_config('meiyiyal.trusted','on',false);
    INSERT INTO public.workers(user_id,display_name,photo_url,primary_node,locked_category,status,is_active,is_verified,base_geog,district_slug,years_experience,submitted_at,decided_at)
    SELECT u.id, '${name}', p.avatar_url, '${node}', public.node_category('${node}'), 'approved', true, true, ST_SetSRID(ST_MakePoint(${at.longitude},${at.latitude}),4326)::geography, '${district}', 10, now(), now()
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id=u.id WHERE u.email='${email}'
    ON CONFLICT (user_id) DO UPDATE SET status='approved', primary_node=EXCLUDED.primary_node, photo_url=EXCLUDED.photo_url;
    INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT w.id,'${node}',true FROM public.workers w JOIN auth.users u ON u.id=w.user_id WHERE u.email='${email}' ON CONFLICT DO NOTHING;`);
  await s.page.goto("/?tab=worker");
  await expect(s.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await s.page.getByTestId("go-online").click();
  await expect(s.page.getByTestId("go-online")).toBeChecked();
  return s;
}
const ringKind = (p: Page) => p.evaluate(() => (window as unknown as { __meiyiyalRing?: string }).__meiyiyalRing ?? null);
async function connected(p: Page, video: boolean) {
  await expect(p.getByTestId("call-view")).toHaveAttribute("data-state", "connected", { timeout: 25_000 });
  if (video) await expect.poll(() => p.getByTestId("remote-video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
}

test.setTimeout(300_000);
test("user ↔ lawyer: ring/decline/timeout/accept, chat + file, video + voice calls, metering, history; user ↔ doctor video", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'c-%@meiyiyal.test';`);
  const law = await makeWorker(browser, "c-lawyer", "Adv. Senthil Kumar", IMG("lawyer"), "professionals--lawyer--property-land", CHENNAI, "chennai");
  const u = await open(browser);
  await signInAt(u.page, u.page.request, "c-user");
  await setProfile(u.page, "Meena Lakshmi", IMG("engineer"));

  // ---- discover + request sheet with DB-driven rates
  await u.page.goto("/browse/professionals--lawyer--property-land");
  const card = u.page.locator('[data-testid="worker-card"][data-name="Adv. Senthil Kumar"][data-online="true"]').first();
  await expect(card).toBeVisible();
  await card.click();
  const sheet = u.page.getByTestId("request-sheet");
  await expect(sheet.getByTestId("rate-chat")).toHaveText("10 cr/min");
  await expect(sheet.getByTestId("rate-voice")).toHaveText("15 cr/min");
  await expect(sheet.getByTestId("rate-video")).toHaveText("25 cr/min");
  await expect(sheet.getByTestId("wallet-balance")).toHaveText("0");
  await expect(sheet.getByTestId("req-chat")).toBeDisabled(); // needs min 10 min × 10
  await sheet.getByTestId("get-test-credits").click();
  await expect(sheet.getByTestId("wallet-balance")).toHaveText("500");
  await expect(sheet.getByTestId("req-chat")).toBeEnabled();
  await shot(u.page, "16-request-sheet");

  // ---- decline
  await sheet.getByTestId("req-chat").click();
  await expect(u.page.getByTestId("outgoing-ring")).toBeVisible();
  await expect(law.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await expect(law.page.getByTestId("incoming-name")).toHaveText("Meena Lakshmi");
  expect(await ringKind(law.page)).toBe("incoming");
  expect(await ringKind(u.page)).toBe("outgoing");
  await shot(u.page, "16-request-calling"); await shot(law.page, "16-request-incoming");
  await law.page.getByTestId("ring-decline").click();
  await expect(u.page.getByText("Adv. Senthil Kumar declined your request")).toBeVisible({ timeout: 10_000 });
  await expect(u.page.getByTestId("outgoing-ring")).toHaveCount(0);
  expect(await ringKind(law.page)).toBeNull();

  // ---- timeout (expire server-side instead of waiting 45s)
  await card.click(); await u.page.getByTestId("req-voice").click();
  await expect(law.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  sql(`UPDATE public.consult_requests SET expires_at = now() - interval '1 second' WHERE status='ringing' AND user_name='Meena Lakshmi';`);
  await expect(u.page.getByText("didn't answer")).toBeVisible({ timeout: 15_000 });
  await expect(law.page.getByTestId("incoming-ring")).toHaveCount(0, { timeout: 15_000 });

  // ---- accept chat
  await card.click(); await u.page.getByTestId("req-chat").click();
  await law.page.getByTestId("ring-accept").click();
  await expect(law.page.getByTestId("session-page")).toBeVisible();
  await expect(u.page.getByTestId("session-page")).toBeVisible({ timeout: 10_000 });
  await expect(u.page.getByTestId("session-other")).toHaveText("Adv. Senthil Kumar");
  await expect(law.page.getByTestId("session-other")).toHaveText("Meena Lakshmi");
  await expect(u.page.getByTestId("credits-used")).toHaveText("10"); // first minute billed on open

  // ---- chat + file share both ways
  await u.page.getByTestId("chat-input").fill("Vanakkam sir, I need help with a patta transfer for my land.");
  await u.page.getByTestId("chat-send").click();
  await expect(law.page.getByTestId("msg").filter({ hasText: "patta transfer" })).toBeVisible();
  await law.page.getByTestId("chat-input").fill("Sure. Please share the sale deed and the current patta copy.");
  await law.page.keyboard.press("Enter");
  await expect(u.page.getByTestId("msg").filter({ hasText: "sale deed" })).toBeVisible();
  await u.page.getByTestId("file-input").setInputFiles(IMG("certificate"));
  await expect(law.page.getByTestId("msg-file").locator("img")).toBeVisible({ timeout: 10_000 });
  await law.page.getByTestId("file-input").setInputFiles({ name: "checklist.txt", mimeType: "text/plain", buffer: Buffer.from("1. Sale deed\n2. Patta\n3. EC") });
  await expect(u.page.getByTestId("msg-file").filter({ hasText: "checklist.txt" })).toBeVisible();
  await shot(u.page, "17-chat-user"); await shot(law.page, "17-chat-lawyer");

  // ---- video call: user calls, lawyer's phone rings, accept, media flows both ways
  await u.page.getByTestId("start-video").click();
  await expect(u.page.getByTestId("call-outgoing")).toBeVisible();
  await expect(law.page.getByTestId("call-incoming")).toBeVisible({ timeout: 10_000 });
  expect(await ringKind(law.page)).toBe("incoming");
  await shot(u.page, "18-call-ringing-user"); await shot(law.page, "18-call-ringing-lawyer");
  await law.page.getByTestId("call-accept").click();
  await connected(u.page, true); await connected(law.page, true);
  await shot(u.page, "18-call-video-user"); await shot(law.page, "18-call-video-lawyer");
  await law.page.getByTestId("call-hangup").click();
  await expect(u.page.getByTestId("call-view")).toHaveCount(0, { timeout: 10_000 });

  // ---- voice call: lawyer calls back, user accepts
  await law.page.getByTestId("start-voice").click();
  await expect(u.page.getByTestId("call-incoming")).toBeVisible({ timeout: 10_000 });
  await u.page.getByTestId("call-accept").click();
  await connected(u.page, false); await connected(law.page, false);
  await shot(u.page, "18-call-voice-user");
  await u.page.getByTestId("call-hangup").click();
  await expect(law.page.getByTestId("call-view")).toHaveCount(0, { timeout: 10_000 });

  // ---- end + summary + history
  await u.page.getByTestId("end-session").click();
  await expect(u.page.getByTestId("session-summary")).toBeVisible();
  await expect(law.page.getByTestId("session-summary")).toBeVisible({ timeout: 10_000 });
  const used = Number(await u.page.getByTestId("credits-used").textContent());
  expect(used).toBeGreaterThanOrEqual(10 + 25 + 15 + 10); // chat, video, voice, chat again (per started minute)
  await u.page.getByTestId("go-history").click();
  const row = u.page.locator('[data-testid="history-row"][data-name="Adv. Senthil Kumar"]');
  await expect(row).toBeVisible();
  await expect(row.getByTestId("history-prof")).toContainText("Lawyer");
  await expect(row.getByTestId("history-modes").locator("svg")).toHaveCount(3);
  await expect(row.getByTestId("history-credits")).toHaveText(`-${used}`);
  await expect(u.page.getByTestId("wallet-balance")).toHaveText(String(500 - used));
  await shot(u.page, "19-history-user");
  await law.page.goto("/history");
  const lrow = law.page.locator('[data-testid="history-row"][data-name="Meena Lakshmi"]');
  await expect(lrow).toHaveAttribute("data-role", "worker");
  await expect(lrow.getByTestId("history-credits")).toHaveText(`+${Math.round(used * 0.82 * 100) / 100}`);
  await shot(law.page, "19-history-lawyer");
  // transcript reopens read-only
  await row.click();
  await expect(u.page.getByTestId("session-page")).toHaveAttribute("data-status", "ended");
  await expect(u.page.getByTestId("msg").filter({ hasText: "patta transfer" })).toBeVisible();
  await expect(u.page.getByTestId("chat-input")).toHaveCount(0);

  // ---- doctor: direct video request → ring → accept → call connects immediately
  const doc = await makeWorker(browser, "c-doctor", "Dr. Kavitha Raman", IMG("doctor"), "professionals--doctor--allopathy--paediatrics", { latitude: 8.184, longitude: 77.4315 }, "kanniyakumari");
  await u.page.goto("/browse/professionals--doctor--allopathy--paediatrics");
  await u.page.getByTestId("list-all").click();
  const dcard = u.page.locator('[data-testid="worker-card"][data-name="Dr. Kavitha Raman"][data-online="true"]').first();
  await dcard.click();
  await expect(u.page.getByTestId("rate-video")).toHaveText("20 cr/min");
  await u.page.getByTestId("req-video").click();
  await expect(doc.page.getByTestId("incoming-ring")).toBeVisible({ timeout: 10_000 });
  await doc.page.getByTestId("ring-accept").click();
  await connected(doc.page, true); await connected(u.page, true);
  await shot(doc.page, "18-call-video-doctor");
  await doc.page.getByTestId("call-hangup").click();
  await expect(u.page.getByTestId("call-view")).toHaveCount(0, { timeout: 10_000 });
  await doc.page.getByTestId("end-session").click();
  await u.page.goto("/history");
  await expect(u.page.getByTestId("history-row")).toHaveCount(2);
  await expect(u.page.getByTestId("history-row").first()).toHaveAttribute("data-name", "Dr. Kavitha Raman");
  await shot(u.page, "19-history-user-2");
  for (const s of [law, u, doc]) await s.ctx.close();
  sql(`DELETE FROM auth.users WHERE email LIKE 'c-%@meiyiyal.test';`); // keep marketplace data clean
});
