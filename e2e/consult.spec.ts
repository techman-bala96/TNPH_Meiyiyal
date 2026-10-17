import { expect, test, type Page } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { CHENNAI, cardOf, makeWorker, open, shot } from "./consultFlow";

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
  const card = cardOf(u.page, law.id);
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
  // new workers pay the 15% introductory fee (commission_new_pct, M6)
  await expect(lrow.getByTestId("history-credits")).toHaveText(`+${Math.round(used * 0.85 * 100) / 100}`);
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
  const dcard = cardOf(u.page, doc.id);
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
