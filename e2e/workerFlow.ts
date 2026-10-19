import { execSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginNewEmail } from "./mocks";

export type WorkerSpec = {
  key: string; name: string; photo: string; at: { latitude: number; longitude: number };
  cat: string; sub: string; spec?: string; fields: Record<string, string>; years: string; docs: string[];
};
export const IMG = (n: string) => `e2e/fixtures/img/${n}.jpg`;

export const WORKERS: WorkerSpec[] = [
  { key: "doctor", name: "Dr. Kavitha Raman", photo: IMG("doctor"), at: { latitude: 8.184, longitude: 77.4315 },
    cat: "professionals--doctor", sub: "professionals--doctor--allopathy", spec: "professionals--doctor--allopathy--paediatrics",
    fields: { degree: "MBBS + MD", council: "Tamil Nadu Medical Council (TNMC)", reg_no: "TNMC 87654", reg_year: "2012", pg: "MD Paediatrics" }, years: "12",
    docs: ["degree_cert", "council_cert"] },
  { key: "lawyer", name: "Adv. Senthil Kumar", photo: IMG("lawyer"), at: { latitude: 13.0317, longitude: 80.27 },
    cat: "professionals--lawyer", sub: "professionals--lawyer--property-land",
    fields: { degree: "LLB (3-year)", bar_council: "Bar Council of Tamil Nadu & Puducherry", enrolment_no: "MS/1234/2015", enrolment_date: "2015-06-10", courts: "Madras High Court" }, years: "10",
    docs: ["degree_cert", "enrolment_cert"] },
  { key: "engineer", name: "Er. Priya Selvam", photo: IMG("engineer"), at: { latitude: 8.0883, longitude: 77.5385 },
    cat: "professionals--engineer", sub: "professionals--engineer--civil",
    fields: { degree: "BE", discipline: "Civil", institution: "Anna University" }, years: "7",
    docs: ["degree_cert", "experience_letter"] },
];

export const sql = (q: string) => execSync(`docker exec -i supabase_db_meyiyal-local psql -U postgres -tA -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
export const grantAdmin = (email: string) => sql(`INSERT INTO public.user_roles(user_id,role) SELECT id,'admin' FROM auth.users WHERE email='${email.replace(/'/g, "")}' ON CONFLICT DO NOTHING;`);

/** Sign in fresh, confirm map location (GPS mocked by caller), land on Home. */
export async function signInAt(page: Page, request: APIRequestContext, prefix: string) {
  const email = await loginNewEmail(page, request, prefix);
  await expect(page.getByTestId("sheet-place")).toBeVisible();
  await page.getByTestId("btn-confirm").click();
  await expect(page.getByTestId("find-panel")).toBeVisible();
  return email;
}

export async function setProfile(page: Page, name: string, photo: string) {
  await page.getByTestId("nav-profile").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("btn-save-profile").click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  const up = page.waitForResponse((r) => r.url().includes("/storage/v1/object/avatars/"));
  await page.getByTestId("input-photo").setInputFiles(photo);
  await up;
  await expect(page.getByTestId("btn-photo").locator("img")).toBeVisible();
  await page.goto("/?tab=worker");
}

/** Full real registration wizard. `shot` optional for screenshots. */
export type RegOpts = { qrImage?: string; uploadSelfie?: boolean; kycEdge?: boolean; docFile?: string; aadhaar?: string; beforeDocs?: () => Promise<unknown> };
export async function registerWorker(page: Page, w: WorkerSpec, shot?: (n: string) => Promise<unknown>, opts: RegOpts = {}) {
  await page.goto("/?tab=worker");
  await page.getByTestId("btn-register-worker").click();
  await page.getByTestId(`reg-cat-${w.cat}`).click();
  await page.getByTestId(`reg-sub-${w.sub}`).click();
  if (w.spec) await page.getByTestId(`reg-spec-${w.spec}`).click();
  await shot?.("01-profession");
  await page.getByTestId("reg-next").click();
  await expect(page.getByTestId("reg-name")).toHaveValue(w.name); // prefilled from profile
  // client-side validation
  await page.getByTestId("reg-save-details").click();
  await expect(page.getByTestId("err-years")).toBeVisible();
  for (const [k, v] of Object.entries(w.fields)) {
    const el = page.getByTestId(`f-${k}`);
    if ((await el.evaluate((e) => e.tagName)) === "SELECT") await el.selectOption(v); else await el.fill(v);
  }
  await page.getByTestId("reg-years").fill(w.years);
  await shot?.("02-details");
  await page.getByTestId("reg-save-details").click();
  // Aadhaar OTP (stub)
  await page.getByTestId("reg-aadhaar").fill("1234");
  await page.getByTestId("reg-send-otp").click();
  await expect(page.getByTestId("reg-error")).toBeVisible();
  await page.getByTestId("reg-aadhaar").fill(opts.aadhaar ?? "987654321098");
  await page.getByTestId("reg-send-otp").click();
  if (opts.kycEdge) await expect(page.getByTestId("reg-aadhaar-otp")).toBeVisible(); // kyc-aadhaar Edge Function (mock adapter)
  else await expect(page.getByTestId("stub-hint")).toBeVisible();
  await page.getByTestId("reg-aadhaar-otp").fill("111111");
  await page.getByTestId("reg-verify-otp").click();
  await expect(page.getByTestId("reg-error")).toBeVisible();
  await page.getByTestId("reg-aadhaar-otp").fill("123456");
  await shot?.("03-aadhaar");
  await page.getByTestId("reg-verify-otp").click();
  // Aadhaar QR (stored as text in the private kyc bucket; not required by the SQL submit RPC)
  await expect(page.getByTestId("reg-qr-mode-camera")).toBeVisible();
  if (opts.qrImage) {
    // photo of the QR → decoded in the browser (jsQR / BarcodeDetector) → shown for review
    await page.getByTestId("reg-qr-mode-image").click();
    await page.getByTestId("reg-qr-image").setInputFiles(opts.qrImage);
    await expect(page.getByTestId("reg-qr")).toHaveValue(/^(MYQR1\.|\d{300,}$)/); // test QR or a real-layout UIDAI Secure QR
  } else {
    await page.getByTestId("reg-qr-mode-paste").click();
    await expect(page.getByTestId("reg-qr")).toBeVisible();
    await page.getByTestId("reg-qr").fill("MYQR1.review-only-test-payload");
  }
  await shot?.("03b-qr");
  const qrUp = page.waitForResponse((r) => r.url().includes("/storage/v1/object/kyc/") && r.request().method() === "POST");
  await page.getByTestId("reg-qr-save").click();
  expect((await qrUp).ok()).toBeTruthy();
  // Selfie: raw file is private; a consented portrait is the public profile photo.
  // Active liveness on Chrome's fake camera: 3 server-chosen actions, frames to the private kyc bucket.
  if (opts.uploadSelfie) {
    await page.getByTestId("reg-live-upload-instead").click();
    await expect(page.getByTestId("reg-no-camera")).toBeVisible();
    await page.getByTestId("reg-selfie-file").setInputFiles(IMG("certificate"));
  } else {
    await page.getByTestId("reg-live-start").click();
    await expect(page.getByTestId("reg-live")).toHaveAttribute("data-phase", "running");
    await expect(page.getByTestId("reg-live")).toHaveAttribute("data-phase", "done", { timeout: 60_000 });
  }
  await page.getByTestId("reg-selfie-consent").check();
  await shot?.("03c-selfie");
  const rawUp = page.waitForResponse((r) => r.url().includes("/storage/v1/object/kyc/") && r.request().method() === "POST");
  const portraitUp = page.waitForResponse((r) => r.url().includes("/storage/v1/object/avatars/") && r.request().method() === "POST");
  await page.getByTestId("reg-selfie-next").click();
  expect((await rawUp).ok()).toBeTruthy();
  expect((await portraitUp).ok()).toBeTruthy();
  await shot?.("03c-selfie");
  // documents
  await expect(page.getByTestId("reg-docs-next")).toBeDisabled();
  await opts.beforeDocs?.();
  for (const d of w.docs) {
    const res = page.waitForResponse((r) => r.url().includes("/rest/v1/worker_documents") && r.request().method() === "POST");
    await page.getByTestId(`doc-${d}`).setInputFiles(opts.docFile ?? IMG("certificate"));
    expect((await res).status()).toBe(201);
  }
  await expect(page.getByTestId("reg-docs-next")).toBeEnabled();
  await shot?.("04-documents");
  await page.getByTestId("reg-docs-next").click();
  await shot?.("05-review");
  await page.getByTestId("reg-submit").click();
  await expect(page.getByTestId("worker-status")).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("go-online")).toBeDisabled();
}

export async function adminApprove(page: Page, names: string[], shot?: (n: string) => Promise<unknown>) {
  await page.getByTestId("avatar-btn").click();
  await page.getByTestId("menu-admin").click();
  await expect(page.getByTestId("admin-page")).toBeVisible();
  for (const [i, n] of names.entries()) {
    const card = page.locator(`[data-testid="admin-card"][data-name="${n}"]`);
    await expect(card).toBeVisible();
    if (i === 0) await shot?.("06-admin-queue");
    await card.getByTestId("admin-approve").click();
    await expect(card).toHaveCount(0);
  }
}
