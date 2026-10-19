import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fresh, shot } from "./shots";
import { signInAt, sql } from "./workerFlow";

test.setTimeout(120_000);

test("privacy and terms pages are public, bilingual, marked DRAFT, with the grievance placeholder", async ({ browser }) => {
  const p = await fresh(browser);
  await p.goto("/login");
  await p.getByTestId("login-privacy").click();
  await expect(p.getByTestId("legal-privacy")).toBeVisible();
  await expect(p.getByTestId("legal-draft")).toContainText("DRAFT");
  await expect(p.getByTestId("grievance-tba")).toBeVisible();
  await shot(p, "privacy-en");
  await p.getByRole("link", { name: "Terms of use" }).click();
  await expect(p.getByTestId("legal-terms")).toContainText("108");
  const ta = await fresh(browser, "ta");
  await ta.goto("/privacy");
  await expect(ta.getByTestId("legal-draft")).toContainText("வரைவு");
  await expect(ta.getByRole("heading", { name: "தனியுரிமைக் கொள்கை" })).toBeVisible();
  await shot(ta, "privacy-ta");
  await ta.goto("/terms"); await shot(ta, "terms-ta", "grievance");
});

test("your data: download a JSON export, schedule account deletion with typed confirm, then cancel", async ({ browser }) => {
  const tag = test.info().project.name === "mobile" ? "m" : "d";
  sql(`DELETE FROM auth.users WHERE email LIKE 'priv${tag}%@meiyiyal.test';`);
  const p = await fresh(browser);
  await signInAt(p, p.request, `priv${tag}`);
  await p.goto("/settings");
  await expect(p.getByTestId("your-data")).toBeVisible();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("data-export").click()]);
  expect(dl.suggestedFilename()).toMatch(/^meiyiyal-my-data-\d{4}-\d\d-\d\d\.json$/);
  const data = JSON.parse(readFileSync(await dl.path(), "utf8"));
  expect(data.format).toBe("meiyiyal-export-v1");
  expect(data.account.email).toMatch(new RegExp(`^priv${tag}`));

  await p.getByTestId("delete-start").click();
  await expect(p.getByTestId("delete-submit")).toBeDisabled();
  await p.getByTestId("delete-word").fill("delete");
  await shot(p, "delete-confirm", "your-data");
  await p.getByTestId("delete-submit").click();
  await expect(p.getByTestId("delete-pending")).toBeVisible();
  expect(sql(`SELECT count(*) FROM public.data_requests d JOIN auth.users u ON u.id = d.user_id WHERE u.email LIKE 'priv${tag}%' AND d.kind = 'delete' AND d.status = 'pending'`)).toBe("1");
  await shot(p, "delete-pending", "your-data");
  await p.getByTestId("delete-cancel").click();
  await expect(p.getByTestId("delete-start")).toBeVisible();
  expect(sql(`SELECT count(*) FROM public.data_requests d JOIN auth.users u ON u.id = d.user_id WHERE u.email LIKE 'priv${tag}%' AND d.kind = 'delete' AND d.status = 'pending'`)).toBe("0");

  // Tamil confirm word
  const ta = await fresh(browser, "ta");
  await signInAt(ta, ta.request, `priv${tag}t`);
  await ta.goto("/settings");
  await ta.getByTestId("delete-start").click();
  await ta.getByTestId("delete-word").fill("நீக்கு");
  await expect(ta.getByTestId("delete-submit")).toBeEnabled();
  await shot(ta, "delete-confirm-ta", "your-data");
});
