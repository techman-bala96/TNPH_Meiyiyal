import { expect, test, type Page } from "@playwright/test";
import { IMG, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, makeWorker, open, shot } from "./consultFlow";
import { mockSpeech, say, spoken } from "./scenario";

const PAED = "professionals--doctor--allopathy--paediatrics", SIDDHA = "professionals--doctor--siddha--general-siddha";
test.setTimeout(300_000);
test("voice agent: direct command, follow-up question, exclusion, online-only, Tamil", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'v-%@meiyiyal.test';`);
  const at = { latitude: 13.0317, longitude: 80.27 };
  const a = await makeWorker(browser, "v-paed-a", "Dr. Kavitha Raman", IMG("doctor"), PAED, at, "chennai");
  const b = await makeWorker(browser, "v-paed-b", "Dr. Arun Prakash", IMG("engineer"), PAED, at, "chennai");
  await b.page.getByTestId("go-online").click(); await expect(b.page.getByTestId("go-online")).not.toBeChecked(); // B is offline
  const c = await makeWorker(browser, "v-siddha", "Dr. Murugan Siddhar", IMG("lawyer"), SIDDHA, at, "chennai");

  const u = await open(browser); await mockSpeech(u.page);
  await u.page.goto("/login"); await expect(u.page.getByTestId("mic-toggle")).toHaveCount(0); // only after login
  await signInAt(u.page, u.page.request, "v-user"); await setProfile(u.page, "Meena Lakshmi", IMG("engineer"));
  await u.page.goto("/");
  const pill = u.page.getByTestId("voice-pill");

  // 1. direct command
  await u.page.getByTestId("mic-toggle").click();
  await expect(pill).toHaveAttribute("data-state", "listening");
  await shot(u.page, "25-voice-listening");
  await say(u.page, "show me a child doctor");
  await expect(u.page).toHaveURL(new RegExp(`/browse/${PAED}\\?list=1$`));
  await expect(u.page.getByTestId("voice-reply")).toContainText("Paediatrics");
  await expect(cardOf(u.page, a.id)).toBeVisible(); await expect(cardOf(u.page, b.id)).toBeVisible();
  await expect(pill).toHaveAttribute("data-state", "listening"); // back to listening after speaking
  await shot(u.page, "25-voice-direct");

  // 2. follow-up question (missing info) → spoken + shown with options → answer by voice
  await say(u.page, "I need a doctor");
  await expect(u.page.getByTestId("voice-reply")).toHaveAttribute("data-action", "ask");
  await expect(u.page.getByTestId("voice-reply")).toHaveText("What kind of doctor?");
  await expect(u.page.getByTestId("voice-option").first()).toBeVisible();
  expect((await spoken(u.page)).at(-1)?.text).toBe("What kind of doctor?");
  await expect(u.page).toHaveURL(new RegExp(`/browse/${PAED}`)); // didn't act yet
  await u.page.waitForTimeout(600); // let the option chips finish animating in
  await shot(u.page, "25-voice-followup");
  await u.page.getByTestId("voice-option").filter({ hasText: "Any doctor" }).click(); // tap answer works too
  await expect(u.page).toHaveURL(/\/browse\/professionals--doctor\?list=1$/);
  await expect(cardOf(u.page, c.id)).toBeVisible();

  // 3. exclusion
  await say(u.page, "show doctors except siddha");
  await expect(u.page).toHaveURL(/xn=professionals--doctor--siddha/);
  await expect(cardOf(u.page, a.id)).toBeVisible();
  await expect(cardOf(u.page, c.id)).toHaveCount(0);
  await expect(u.page.locator('[data-testid="filter-chip"][data-key="xn:professionals--doctor--siddha"]')).toBeVisible();
  await shot(u.page, "25-voice-exclusion");
  await u.page.locator('[data-testid="filter-chip"][data-key="xn:professionals--doctor--siddha"]').click(); // chip removable
  await expect(cardOf(u.page, c.id)).toBeVisible();

  // 4. online-only
  await say(u.page, "online child doctor");
  await expect(u.page).toHaveURL(/online=1/);
  await expect(cardOf(u.page, a.id)).toBeVisible();
  await expect(cardOf(u.page, b.id)).toHaveCount(0);
  await shot(u.page, "25-voice-online");
  await u.page.getByTestId("voice-close").click(); await expect(pill).toHaveCount(0);
  await expect(u.page.getByTestId("mic-toggle")).toHaveAttribute("data-on", "false");

  // 5. Tamil
  await u.page.evaluate(() => localStorage.setItem("i18nextLng", "ta")); await u.page.goto("/");
  await u.page.getByTestId("mic-toggle").click();
  expect(await u.page.evaluate(() => (window as unknown as { __voice: { lang: () => string } }).__voice.lang())).toBe("ta-IN");
  await say(u.page, "குழந்தை மருத்துவர் வேண்டும்");
  await expect(u.page).toHaveURL(new RegExp(`/browse/${PAED}`));
  await expect(u.page.getByTestId("voice-reply")).toContainText("குழந்தை நலம்");
  expect((await spoken(u.page)).at(-1)?.lang).toBe("ta");
  await expect(cardOf(u.page, a.id)).toBeVisible();
  await shot(u.page, "25-voice-tamil");

  for (const s of [a, b, c, u]) await s.ctx.close();
});

test("server speech-to-text: /agent/stt (mock adapter) transcribes, and the transcript drives the agent", async ({ page }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 'v-stt%@meiyiyal.test';`);
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.context().grantPermissions(["geolocation"]); await page.context().setGeolocation({ latitude: 13.0317, longitude: 80.27 });
  const { mockMapNetwork } = await import("./mocks"); await mockMapNetwork(page);
  await signInAt(page, page.request, "v-stt");
  const out = await page.evaluate(async () => {
    const m = await import("/src/features/voice/agent.ts");
    const text = await m.transcribeAudio(new Blob(["MOCK:child doctor online"], { type: "audio/webm" }), "en");
    const r = await m.askAgent(text, "en", null, {});
    let refused = "";
    try { await m.transcribeAudio(new Blob([new Uint8Array(1_000_001)], { type: "audio/webm" }), "en"); } catch (e) { refused = (e as Error).message; }
    return { text, action: r.action, node: r.node, online: r.filters.online_only, refused };
  });
  expect(out).toEqual({ text: "child doctor online", action: "navigate", node: "professionals--doctor--allopathy--paediatrics", online: true, refused: "stt 413" });
});
