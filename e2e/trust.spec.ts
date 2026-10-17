import { expect, test, type Page } from "@playwright/test";
import { IMG, grantAdmin, setProfile, signInAt, sql } from "./workerFlow";
import { cardOf, endedSession, makeWorker, open, shot } from "./consultFlow";

const LAW = "professionals--lawyer--property-land", PAED = "professionals--doctor--allopathy--paediatrics";
async function giveFeedback(p: Page, sid: string, o: { stars: number; tags?: string[]; comment?: string; complaint?: string }, shotName?: string) {
  await p.goto(`/session/${sid}`);
  const card = p.getByTestId("feedback-card");
  await expect(card).toBeVisible();
  await card.getByTestId(`star-${o.stars}`).click();
  for (const t of o.tags ?? []) await card.getByTestId(`tag-${t}`).click();
  if (o.comment) await card.getByTestId("feedback-comment").fill(o.comment);
  if (o.complaint) { await card.getByTestId("report-toggle").click(); await expect(card.getByTestId("feedback-submit")).toBeDisabled(); await card.getByTestId(`reason-${o.complaint}`).click(); }
  if (shotName) await shot(p, shotName);
  await card.getByTestId("feedback-submit").click();
  await expect(p.getByTestId("feedback-done")).toBeVisible();
}

test.setTimeout(300_000);
test("feedback → rewards + certificate; complaint flag auto-clears; 3 complaints → block → admin extend/unblock; admin edits rates; public profile", async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE email LIKE 't-%@meiyiyal.test';`);
  const law = await makeWorker(browser, "t-lawyer", "Adv. Senthil Kumar", IMG("lawyer"), LAW, { latitude: 13.0317, longitude: 80.27 }, "chennai");
  const u = await open(browser);
  const uEmail = await signInAt(u.page, u.page.request, "t-user");
  await setProfile(u.page, "Meena Lakshmi", IMG("engineer"));
  await u.page.goto(`/browse/${LAW}`);
  const card = cardOf(u.page, law.id);

  // ---- A. real session → 5★ feedback with tags + comment → aggregates + rewards
  await card.click();
  await u.page.getByTestId("get-test-credits").click();
  await u.page.getByTestId("req-chat").click();
  await law.page.getByTestId("ring-accept").click();
  await expect(u.page.getByTestId("session-page")).toBeVisible({ timeout: 10_000 });
  await u.page.getByTestId("chat-input").fill("Thank you for explaining the patta process!"); await u.page.getByTestId("chat-send").click();
  await u.page.getByTestId("end-session").click();
  const fb = u.page.getByTestId("feedback-card");
  await expect(fb).toBeVisible();
  await expect(fb.getByTestId("feedback-submit")).toBeDisabled();
  await fb.getByTestId("star-2").click(); await expect(fb.getByTestId("tag-rude")).toBeVisible(); // negative tags for low stars
  await fb.getByTestId("star-5").click(); await expect(fb.getByTestId("tag-rude")).toHaveCount(0);
  await fb.getByTestId("tag-clear_advice").click(); await fb.getByTestId("tag-patient").click();
  await fb.getByTestId("feedback-comment").fill("Very clear guidance on patta transfer. Highly recommended!");
  await shot(u.page, "20-feedback-form");
  await fb.getByTestId("feedback-submit").click();
  await expect(u.page.getByTestId("feedback-done")).toBeVisible();
  await expect(u.page.getByText("just earned a new recognition")).toBeVisible();
  await shot(u.page, "20-feedback-done");
  await u.page.reload(); await expect(u.page.getByTestId("feedback-done")).toBeVisible(); // one per session, persisted

  // worker sees rewards; certificate EN/TA, PNG + PDF download
  await law.page.goto("/?tab=worker");
  const mine = law.page.getByTestId("my-rewards");
  await expect(mine.locator('[data-testid="reward"][data-slug="first_consult"]')).toBeVisible();
  await expect(mine.locator('[data-testid="reward"][data-slug="first_five_star"]')).toBeVisible();
  await shot(law.page, "21-rewards-worker", true);
  await mine.locator('[data-testid="reward"][data-slug="first_five_star"]').click();
  const dlg = law.page.getByTestId("cert-dialog");
  await expect(dlg.getByTestId("cert-image")).toHaveAttribute("data-lang", "en");
  await expect(dlg.getByTestId("cert-no")).toHaveText(/^MYL-\d{4}-\d{6}$/);
  await shot(law.page, "21-rewards-certificate-en");
  let dl = law.page.waitForEvent("download"); await dlg.getByTestId("cert-png").click();
  const png = await dl; expect(png.suggestedFilename()).toMatch(/^Meiyiyal-MYL-.*-en\.png$/);
  await dlg.getByTestId("cert-lang-ta").click();
  await expect(dlg.getByTestId("cert-image")).toHaveAttribute("data-lang", "ta");
  await shot(law.page, "21-rewards-certificate-ta");
  dl = law.page.waitForEvent("download"); await dlg.getByTestId("cert-pdf").click();
  const pdf = await dl; expect(pdf.suggestedFilename()).toMatch(/-ta\.pdf$/);
  const fs = await import("node:fs"); const head = fs.readFileSync(await pdf.path()).subarray(0, 8).toString(); expect(head).toContain("%PDF-1.4");
  await law.page.keyboard.press("Escape");

  // card badges + counts, public profile
  await u.page.goto(`/browse/${LAW}`);
  await expect(card.getByTestId("feedback-count")).toHaveText("1");
  await expect(card.getByTestId("rewards-count")).toHaveText("2");
  await expect(card.getByTestId("card-badge")).toHaveCount(2);
  await expect(card.getByTestId("rating")).toHaveText("5.0");
  await card.click(); await u.page.getByTestId("view-profile").click();
  const wp = u.page.getByTestId("worker-profile");
  await expect(wp.getByTestId("wp-name")).toContainText("Adv. Senthil Kumar");
  await expect(wp.getByTestId("wp-specialty")).toContainText("Lawyer");
  await expect(wp.getByTestId("stat-rating")).toHaveText("5.0");
  await expect(wp.getByTestId("stat-served")).toHaveText("1");
  await expect(wp.getByTestId("stat-exp")).toHaveText("10 yrs");
  await expect(wp.getByTestId("wp-review").first()).toContainText("Very clear guidance");
  await expect(wp.getByTestId("wp-review").first()).toContainText("Clear advice");
  await expect(wp.getByTestId("reward")).toHaveCount(2);
  await shot(u.page, "23-worker-profile", true);
  await wp.getByTestId("reward").first().click();
  await expect(u.page.getByTestId("cert-image")).toBeVisible(); // public recognition is viewable by clients
  await u.page.keyboard.press("Escape");

  // ---- B. complaint → flag; 3 good sessions → auto-cleared
  await giveFeedback(u.page, endedSession(uEmail, law.email), { stars: 2, tags: ["unhelpful"], complaint: "wrong_advice" }, "20-feedback-complaint");
  await law.page.goto("/?tab=worker");
  await expect(law.page.getByTestId("worker-flag")).toHaveAttribute("data-needed", "3");
  await shot(law.page, "22-block-flag-worker");
  for (let i = 0; i < 3; i++) await giveFeedback(u.page, endedSession(uEmail, law.email), { stars: 5, tags: ["friendly"] });
  await law.page.reload();
  await expect(law.page.getByTestId("worker-panel")).toBeVisible();
  await expect(law.page.getByTestId("worker-flag")).toHaveCount(0);
  await expect(law.page.getByTestId("worker-blocked")).toHaveCount(0);

  // ---- C. doctor gets 3 complaints → auto block (hidden, can't go online) → admin extend + unblock
  const doc = await makeWorker(browser, "t-doctor", "Dr. Kavitha Raman", IMG("doctor"), PAED, CHENNAI_DOC, "kanniyakumari");
  for (const r of ["misconduct", "abuse", "wrong_advice"]) await giveFeedback(u.page, endedSession(uEmail, doc.email), { stars: 1, tags: ["rude"], complaint: r });
  await doc.page.reload();
  await expect(doc.page.getByTestId("worker-blocked")).toBeVisible();
  await expect(doc.page.getByTestId("block-reason")).toContainText("3 negative");
  await expect(doc.page.getByTestId("go-online")).toBeDisabled();
  await expect(doc.page.getByTestId("go-online")).not.toBeChecked();
  await shot(doc.page, "22-block-worker", true);
  await u.page.goto(`/browse/${PAED}`); await u.page.getByTestId("list-all").click();
  await expect(u.page.getByTestId("worker-list-section")).toBeVisible();
  await expect(cardOf(u.page, doc.id)).toHaveCount(0);
  await u.page.goto(`/w/${doc.id}`); await expect(u.page.getByTestId("profile-unavailable")).toBeVisible();

  const a = await open(browser);
  grantAdmin(await signInAt(a.page, a.page.request, "t-admin"));
  await a.page.goto("/admin");
  await a.page.getByTestId("admin-tab-moderation").click();
  const mc = a.page.locator(`[data-testid="mod-card"][data-id="${doc.id}"]`);
  await expect(mc).toHaveAttribute("data-blocked", "true");
  await expect(mc.getByTestId("mod-negatives")).toHaveText("3");
  await expect(mc.getByTestId("mod-unblock")).toBeDisabled(); // note required
  await shot(a.page, "22-block-admin", true);
  const before = await mc.getByTestId("mod-until").textContent();
  await mc.getByTestId("mod-days").fill("3"); await mc.getByTestId("mod-note").fill("Three complaints in a week; extending pending review.");
  await mc.getByTestId("mod-extend").click();
  await expect(a.page.getByText("Block updated")).toBeVisible();
  await expect(mc.getByTestId("mod-until")).not.toHaveText(before!);
  await mc.getByTestId("mod-note").fill("Reviewed call records with the doctor; unblocking.");
  await mc.getByTestId("mod-unblock").click();
  await expect(mc).toHaveAttribute("data-blocked", "false");
  await a.page.getByTestId("admin-tab-audit").click();
  for (const act of ["worker.auto_block", "worker.extend", "worker.unblock", "worker.flag_auto_cleared"]) await expect(a.page.locator(`[data-testid="audit-row"][data-action="${act}"]`).first()).toBeVisible();
  await shot(a.page, "22-block-audit", true);
  await doc.page.reload();
  await expect(doc.page.getByTestId("worker-blocked")).toHaveCount(0);
  await doc.page.getByTestId("go-online").click(); await expect(doc.page.getByTestId("go-online")).toBeChecked();
  await u.page.goto(`/browse/${PAED}`); await u.page.getByTestId("list-all").click();
  await expect(cardOf(u.page, doc.id)).toHaveAttribute("data-online", "true");

  // ---- D. admin edits lawyer chat rate (inherited by Property & Land) → user sees it; audit
  await a.page.getByTestId("admin-tab-rates").click();
  await a.page.getByTestId("rates-filter").fill("lawyer");
  const grp = a.page.locator('[data-testid="rate-group"][data-node="professionals--lawyer"]');
  const chat = grp.locator('[data-testid="rate-row"][data-mode="chat"]');
  await expect(chat.getByTestId("rate-input")).toHaveValue("10");
  await chat.getByTestId("rate-input").fill("0"); await chat.getByTestId("rate-save").click();
  await expect(a.page.getByText("rate must be between 0 and 1000")).toBeVisible();
  await chat.getByTestId("rate-input").fill("12"); await chat.getByTestId("rate-save").click();
  await expect(a.page.getByText("Rate saved")).toBeVisible();
  await shot(a.page, "24-admin-rates");
  await u.page.goto(`/browse/${LAW}`); await card.click();
  await expect(u.page.getByTestId("rate-chat")).toHaveText("12 cr/min");
  await a.page.getByTestId("admin-tab-audit").click();
  await expect(a.page.locator('[data-testid="audit-row"][data-action="rate.set"]').first()).toContainText("10 → 12");
  await shot(a.page, "24-admin-rates-audit");
  // restore seed rate (keeps other specs deterministic)
  await a.page.getByTestId("admin-tab-rates").click(); await a.page.getByTestId("rates-filter").fill("lawyer");
  await chat.getByTestId("rate-input").fill("10"); await chat.getByTestId("rate-save").click(); await expect(a.page.getByText("Rate saved").first()).toBeVisible();

  for (const s of [law, u, doc, a]) await s.ctx.close();
  sql(`DELETE FROM auth.users WHERE email LIKE 't-%@meiyiyal.test';`);
});
const CHENNAI_DOC = { latitude: 8.184, longitude: 77.4315 };
