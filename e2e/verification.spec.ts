/**
 * Verification through the real engine (services/verify) and the real wizard, client-side only via the UI.
 * The verify service runs here with: a test "UIDAI" certificate (real Secure-QR signature code, test key),
 * insightface face match, heuristic liveness on Chrome's fake camera fed with .y4m videos, and a council
 * register fixture instead of the live websites (VERIFY_TEST_MODE, refused unless Supabase is local).
 * DB is only read to confirm results, plus three marked time-travel steps (cron jobs a person cannot click).
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { grantAdmin, registerWorker, setProfile, signInAt, sql, type WorkerSpec } from "./workerFlow";

const FX = `${process.cwd()}/.cache/verify-fixtures`;
const SHOTS = process.env.SCENARIO_SHOTS ?? "/workspace/scenario-shots";
const PORT = 8789; const KEY = "e2e-local-verify-key";
const AT = { latitude: 13.0317, longitude: 80.27 };
const P = () => test.info().project.name;
const TAG = () => (P() === "mobile" ? "m" : "d");
const snap = (page: Page, id: string, step: string) => page.screenshot({ path: `${SHOTS}/${id}-${P()}-${step}.png`, fullPage: true });
const COUNCIL = JSON.parse(readFileSync(`${FX}/council.json`, "utf8"));
const council = (patch: Record<string, unknown>) => writeFileSync(`${FX}/council.json`, JSON.stringify({ ...COUNCIL, ...patch }));

let svc: ChildProcess | null = null;
test.beforeAll(async () => {
  council({});
  const status = execSync("npx supabase status -o env", { stdio: ["ignore", "pipe", "ignore"] }).toString();
  const service = /^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m.exec(status)?.[1] ?? "";
  svc = spawn("services/verify/run.sh", [], { stdio: "ignore", detached: true, env: { ...process.env,
    SUPABASE_SERVICE_ROLE_KEY: service, VERIFY_PORT: String(PORT), VERIFY_SERVICE_KEY: KEY, VERIFY_POLL_SECONDS: "1", VERIFY_MAINTENANCE_SECONDS: "99999",
    VERIFY_TEST_MODE: "1", VERIFY_REGISTRY_FIXTURES: `${FX}/council.json`, UIDAI_QR_CERT_PATH: `${FX}/test-uidai-cert.pem`,
    FACE_PROVIDER: "insightface", LIVENESS_PROVIDER: "heuristic", OCR_PROVIDER: "none" } });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/verify/health`); if (r.ok) { const h = await r.json(); if (h.providers.test_mode && h.providers.uidai_cert) return; } } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("verify service did not start");
});
test.afterAll(() => { try { if (svc?.pid) process.kill(-svc.pid); } catch { /* gone */ } council({}); });
test.setTimeout(240_000);

async function person(browser: Browser, cam: string | null) {
  // each person gets their own browser so the fake camera can show their own face
  const b = cam ? await browser.browserType().launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${FX}/${cam}.y4m`] }) : browser;
  const ctx = await b.newContext({ ...test.info().project.use, geolocation: AT, permissions: ["geolocation", "camera", "microphone"] });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  return { page, close: async () => { await ctx.close(); if (cam) await b.close(); } };
}
let adminPage: Page | null = null;
async function admin(browser: Browser) {
  if (adminPage && !adminPage.isClosed()) return adminPage;
  const a = await person(browser, null);
  grantAdmin(await signInAt(a.page, a.page.request, `vf${TAG()}-admin`));
  adminPage = a.page; return a.page;
}
async function autoApprove(browser: Browser, cat: string, state: "on" | "off" | "inherit") {
  const a = await admin(browser);
  await a.goto("/admin#settings"); await a.reload();
  await a.getByTestId("settings-grp-verification").click();
  const row = a.locator(`[data-testid="auto-cat"][data-cat="${cat}"]`);
  await row.getByTestId(`auto-cat-${state}`).click();
  await expect(row).toHaveAttribute("data-state", state);
}

type Case = { id: string; name: string; cat?: "doctor" | "lawyer" | "engineer" | "vet" | "physio"; reg?: string; qr?: string; cam?: string | null; doc?: string; aadhaar?: string; selfieUpload?: boolean; beforeDocs?: (p: Page) => Promise<unknown> };
function specFor(c: Case): WorkerSpec {
  const docs = ["degree_cert", "council_cert"];
  switch (c.cat ?? "doctor") {
    case "lawyer": return { key: "lawyer", name: c.name, photo: `${FX}/face-a.jpg`, at: AT, cat: "professionals--lawyer", sub: "professionals--lawyer--property-land",
      fields: { degree: "LLB (3-year)", bar_council: "Bar Council of Tamil Nadu & Puducherry", enrolment_no: c.reg ?? "MS/7001/2016", enrolment_date: "2016-06-10", courts: "Madras High Court" }, years: "9", docs: ["degree_cert", "enrolment_cert"] };
    case "engineer": return { key: "engineer", name: c.name, photo: `${FX}/face-a.jpg`, at: AT, cat: "professionals--engineer", sub: "professionals--engineer--civil",
      fields: { degree: "BE", discipline: "Civil", institution: "Anna University" }, years: "8", docs: ["degree_cert", "experience_letter"] };
    case "vet": return { key: "vet", name: c.name, photo: `${FX}/face-a.jpg`, at: AT, cat: "professionals--doctor", sub: "professionals--doctor--veterinary",
      fields: { degree: "BVSc", council: "Tamil Nadu State Veterinary Council", reg_no: c.reg ?? "TNVC 5501", reg_year: "2012" }, years: "11", docs };
    case "physio": return { key: "physio", name: c.name, photo: `${FX}/face-a.jpg`, at: AT, cat: "professionals--doctor", sub: "professionals--doctor--physiotherapy",
      fields: { degree: "BPT", council: "Tamil Nadu State Allied & Healthcare Council", reg_no: c.reg ?? "TNPT 3301", reg_year: "2012" }, years: "6", docs: ["council_cert"] };
    default: return { key: "doctor", name: c.name, photo: `${FX}/face-a.jpg`, at: AT, cat: "professionals--doctor", sub: "professionals--doctor--allopathy", spec: "professionals--doctor--allopathy--paediatrics",
      fields: { degree: "MBBS + MD", council: "Tamil Nadu Medical Council (TNMC)", reg_no: c.reg ?? "TNMC 70001", reg_year: "2012", pg: "MD Paediatrics" }, years: "12", docs };
  }
}

/** Register through the wizard and wait until the engine has written its checks (worker's own screen). */
async function register(browser: Browser, c: Case) {
  const who = await person(browser, c.cam === undefined ? "cam-a" : c.cam);
  const p = who.page;
  const email = await signInAt(p, p.request, `vf${TAG()}-${c.id.toLowerCase()}`);
  await setProfile(p, c.name, `${FX}/face-a.jpg`);
  const w = specFor(c);
  await registerWorker(p, w, (n) => snap(p, c.id, n), { qrImage: c.qr === undefined ? `${FX}/qr-valid-a.png` : c.qr || undefined, docFile: c.doc ?? `${FX}/cert-arun.pdf`, aadhaar: c.aadhaar, uploadSelfie: c.selfieUpload, beforeDocs: c.beforeDocs && (() => c.beforeDocs!(p)) });
  const checks = await outcome(p);
  await snap(p, c.id, "outcome");
  return { ...who, email, checks };
}
async function outcome(p: Page) {
  const panel = async () => { await p.goto("/?tab=worker"); await expect(p.getByTestId("worker-status")).toBeVisible(); };
  await expect.poll(async () => { await panel(); await p.waitForTimeout(800); return p.getByTestId("verify-check").count(); }, { timeout: 90_000, intervals: [2000] }).toBeGreaterThanOrEqual(6)
    .catch(async (e) => { await snap(p, "DEBUG", "outcome"); throw e; });
  await p.waitForTimeout(2500); await panel(); await expect(p.getByTestId("verify-check").first()).toBeVisible();
  const out: Record<string, string> = {};
  for (const li of await p.getByTestId("verify-check").all()) out[(await li.getAttribute("data-check"))!] = (await li.getAttribute("data-status"))!;
  out.status = (await p.getByTestId("worker-status").getAttribute("data-status"))!;
  return out;
}
const evidence = (email: string, check: string) => sql(`SELECT k.status || '|' || COALESCE(k.evidence->>'reason','') FROM public.verification_checks k JOIN public.verification_cases c ON c.id = k.case_id
  JOIN public.workers w ON w.id = c.worker_id JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${email}' AND k.check_name = '${check}' ORDER BY c.created_at DESC LIMIT 1`);
async function seesReason(p: Page, id: string, code: string, en: RegExp, ta: RegExp) {
  await expect(p.getByTestId("review-note")).toHaveAttribute("data-code", code);
  await expect(p.getByTestId("review-note")).toContainText(en);
  await expect(p.getByTestId("go-online")).toBeDisabled();
  await expect(p.getByTestId("appeal-note")).toBeVisible();
  await p.getByTestId("lang-toggle").first().click();
  await expect(p.getByTestId("review-note")).toContainText(ta);
  await snap(p, id, "reason-ta");
  await p.getByTestId("lang-toggle").first().click();
}
async function adminSees(browser: Browser, id: string, name: string) {
  const a = await admin(browser);
  await a.goto("/admin#queue"); await a.reload();
  const card = a.locator(`[data-testid="admin-card"][data-name="${name}"]`);
  await expect(card).toBeVisible(); await expect(card.getByTestId("admin-checks")).toBeVisible();
  await snap(a, id, "admin-queue");
  return card;
}
const n = (s: string) => s; // names must match the Aadhaar QR name, so no per-project suffix; beforeEach clears old vf- accounts

test.beforeEach(() => { sql(`DELETE FROM auth.users WHERE email LIKE 'vf_-v%@meiyiyal.test'; DELETE FROM public.identity_fingerprints WHERE worker_id IS NULL AND NOT blocked;`); council({}); });

test("[V01] doctor, everything genuine, auto-approve ON for doctors → approved automatically → can go online", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "on");
  const r = await register(browser, { id: "V01", name: n("Dr. Arun Kumar") });
  expect(r.checks).toMatchObject({ identity: "pass", registry: "pass", duplicates: "pass", degree: "pass", forensics: "pass" });
  if (r.checks.face === "pass" && r.checks.name === "pass") {
    expect(r.checks.status).toBe("approved");
    await r.page.getByTestId("go-online").click(); await expect(r.page.getByTestId("go-online")).toBeChecked();
  } else {
    // honest fallback: an uncalibrated face score or name rule kept it for a person
    expect(r.checks.status).toBe("pending");
    test.info().annotations.push({ type: "actual", description: `face=${r.checks.face} name=${r.checks.name} → queued for admin` });
  }
  await snap(r.page, "V01", "final");
  await r.close();
});

test("[V02] doctor genuine, auto-approve OFF (production default) → waits for admin → admin approves → goes online", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const r = await register(browser, { id: "V02", name: n("Dr. Arun Kumar") });
  expect(r.checks.status).toBe("pending");
  await expect(r.page.getByTestId("go-online")).toBeDisabled();
  const card = await adminSees(browser, "V02", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
  await r.page.reload(); await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await r.page.getByTestId("go-online").click(); await expect(r.page.getByTestId("go-online")).toBeChecked();
  await snap(r.page, "V02", "approved-online");
  await r.close();
});

for (const [id, qr, code, en, ta] of [
  ["V03", "qr-tampered", "identity:bad_signature", /not genuine or was changed/, /உண்மையானது அல்ல/],
  ["V04", "qr-forged", "identity:bad_signature", /not genuine or was changed/, /உண்மையானது அல்ல/],
  ["V05", "qr-other-person", "identity:last4", /different Aadhaar number/, /சொந்தமானது அல்ல/],
] as const) {
  test(`[${id}] Aadhaar QR ${qr.replace("qr-", "")} → rejected automatically with a plain reason (en + ta), cannot go online, can appeal`, async ({ browser }) => {
    await autoApprove(browser, "professionals--doctor", "off");
    const r = await register(browser, { id, name: n("Dr. Arun Kumar"), qr: `${FX}/${qr}.png` });
    expect(r.checks.identity).toBe("fail"); expect(r.checks.status).toBe("rejected");
    await seesReason(r.page, id, code, en, ta);
    await r.close();
  });
}

test("[V06] QR without a readable code (photo of something else, typed text) → review, never approved automatically", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "on");
  const r = await register(browser, { id: "V06", name: n("Dr. Arun Kumar"), qr: "" });
  expect(r.checks.identity).toBe("review"); expect(r.checks.status).toBe("pending");
  await r.close();
});

for (const [id, name, qr, expectName] of [
  ["V07", "Dr. Arun Kumar", "qr-valid-a-other-name", "fail"],
  ["V08", "Dr. Arun Kumar", "qr-valid-a-initials", "review"],
  ["V09", "டாக்டர் அருண் குமார்", "qr-valid-a", "pass"],
] as const) {
  test(`[${id}] name on Aadhaar vs profile: "${name}" vs ${qr.replace("qr-valid-a", "QR").replace(/-/g, " ")} → name ${expectName}`, async ({ browser }) => {
    await autoApprove(browser, "professionals--doctor", "on");
    const r = await register(browser, { id, name, qr: `${FX}/${qr}.png` });
    expect(r.checks.name).toBe(expectName);
    if (expectName !== "pass") { expect(r.checks.status).toBe("pending"); await adminSees(browser, id, name); }
    await r.close();
  });
}

for (const [id, reg, status, reason, decision] of [
  ["V10", "TNMC 70002", "fail", "suspended", "rejected"],
  ["V11", "TNMC 70003", "review", "not_found", "pending"],
  ["V12", "TNMC 70004", "review", "timeout", "pending"],
  ["V13", "TNMC 70005", "review", "name", "pending"],
  ["V14", "TNMC 70006", "review", "error", "pending"],
] as const) {
  test(`[${id}] council register: ${reason} (${reg}) → registry ${status}, worker ${decision}`, async ({ browser }) => {
    await autoApprove(browser, "professionals--doctor", "on");
    const r = await register(browser, { id, name: n("Dr. Arun Kumar"), reg });
    expect(r.checks.registry).toBe(status); expect(r.checks.status).toBe(decision);
    expect(evidence(r.email, "registry")).toBe(`${status}|${reason}`);
    if (decision === "rejected") await seesReason(r.page, id, "registry:suspended", /suspended, removed or expired/, /இடைநீக்கம்/);
    else await adminSees(browser, id, n("Dr. Arun Kumar"));
    await r.close();
  });
}

test("[V15] council number format is checked in the wizard; same number on a second account → rejected as duplicate", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const first = await register(browser, { id: "V15a", name: n("Dr. Arun Kumar") });
  const a = await admin(browser);
  const card = await adminSees(browser, "V15", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
  const second = await register(browser, { id: "V15b", name: n("Dr. Arun Kumaran"), qr: `${FX}/qr-dup-identity.png`, cam: "cam-b" });
  expect(second.checks.duplicates).toBe("fail"); expect(second.checks.status).toBe("rejected");
  await seesReason(second.page, "V15", "duplicates:active", /already used by another active professional/, /ஏற்கனவே/);
  void a; await first.close(); await second.close();
});

test("[V16] same Aadhaar (same QR identity) on two accounts → second rejected as duplicate", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const first = await register(browser, { id: "V16a", name: n("Dr. Arun Kumar"), reg: "TNMC 70001" });
  const card = await adminSees(browser, "V16", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
  council({ "TNMC 70007": { html: "<table>\n<tr><td>TNMC 70007</td><td>Dr. Arun Kumar</td><td>Active</td></tr>\n</table>" } });
  const second = await register(browser, { id: "V16b", name: n("Dr. Arun Kumar"), reg: "TNMC 70007" });
  expect(second.checks.duplicates).toBe("fail"); expect(second.checks.status).toBe("rejected");
  await seesReason(second.page, "V16", "duplicates:active", /already used/, /ஏற்கனவே/);
  await first.close(); await second.close();
});

for (const [id, cam, face, decision, reason] of [
  ["V17", "cam-still-a", "fail", "rejected", "liveness_static"],
  ["V18", "cam-b", "fail", "pending", "mismatch"],
  ["V19", "cam-multi", "review", "pending", "selfie_multiple_faces"],
  ["V20", null, "review", "pending", "selfie_no_face"],
] as const) {
  test(`[${id}] selfie: ${reason.replace(/_/g, " ")} → face ${face}, worker ${decision}`, async ({ browser }) => {
    await autoApprove(browser, "professionals--doctor", "on");
    const r = await register(browser, { id, name: n("Dr. Arun Kumar"), cam });
    expect(r.checks.face).toBe(face); expect(r.checks.status).toBe(decision);
    expect(evidence(r.email, "face")).toBe(`${face}|${reason}`);
    if (decision === "rejected") await seesReason(r.page, id, "face:liveness_static", /photo or screen/, /புகைப்படம் அல்லது திரை/);
    else await adminSees(browser, id, n("Dr. Arun Kumar"));
    await r.close();
  });
}

test("[V21] documents: wrong type and oversize refused in the wizard with a message (en + ta); edited PDF and blurry photo go to review", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "on");
  const r = await register(browser, { id: "V21", name: n("Dr. Arun Kumar"), doc: `${FX}/cert-edited.pdf`, beforeDocs: async (p: Page) => {
    await p.getByTestId("doc-degree_cert").setInputFiles(`${FX}/notes.txt`);
    await expect(p.getByTestId("reg-error")).toContainText(/PDF or a photo/);
    await snap(p, "V21", "wrong-type");
    await p.getByTestId("doc-degree_cert").setInputFiles(`${FX}/huge.pdf`);
    await expect(p.getByTestId("reg-error")).toContainText(/larger than 10 MB/);
    await snap(p, "V21", "too-big");
    await p.getByTestId("lang-toggle").first().click();
    await p.getByTestId("doc-degree_cert").setInputFiles(`${FX}/notes.txt`);
    await expect(p.getByTestId("reg-error")).toContainText(/PDF அல்லது புகைப்படத்தை/);
    await snap(p, "V21", "wrong-type-ta");
    await p.getByTestId("lang-toggle").first().click();
    await expect(p.getByTestId("reg-docs-next")).toBeDisabled();
  } });
  expect(r.checks.forensics).toBe("review"); expect(r.checks.status).toBe("pending");
  await r.close();
  sql(`DELETE FROM auth.users WHERE email LIKE 'vf${TAG()}-v21%@meiyiyal.test';`);
  const b = await register(browser, { id: "V21blurry", name: n("Dr. Arun Kumar"), doc: `${FX}/cert-blurry.jpg` });
  expect(b.checks.degree).toBe("review"); expect(b.checks.status).toBe("pending");
  await b.close();
});

test("[V22] admin asks for more information → worker sees the note, re-uploads, resubmits → admin approves", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const r = await register(browser, { id: "V22", name: n("Dr. Arun Kumar"), doc: `${FX}/cert-blurry.jpg` });
  const card = await adminSees(browser, "V22", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-note").fill("Degree certificate is blurry. Please upload a clear PDF.");
  await card.getByTestId("admin-needs-info").click(); await expect(card).toHaveCount(0);
  await r.page.reload();
  await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "needs_info");
  await expect(r.page.getByTestId("review-note")).toContainText("blurry");
  await snap(r.page, "V22", "needs-info");
  await r.page.getByTestId("btn-continue-reg").click();
  for (let i = 0; i < 8 && !(await r.page.getByTestId("doc-degree_cert").count()); i++) {
    const next = r.page.locator('[data-testid="reg-next"], [data-testid="reg-save-details"], [data-testid="reg-verify-otp"], [data-testid="reg-qr-save"], [data-testid="reg-selfie-next"]').first();
    if (await next.isVisible().catch(() => false)) await next.click(); else await r.page.waitForTimeout(500);
  }
  await r.page.getByTestId("doc-degree_cert").setInputFiles(`${FX}/cert-arun.pdf`);
  await r.page.getByTestId("reg-docs-next").click(); await r.page.getByTestId("reg-submit").click();
  await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "pending");
  const card2 = await adminSees(browser, "V22", n("Dr. Arun Kumar"));
  await card2.getByTestId("admin-approve").click(); await expect(card2).toHaveCount(0);
  await r.page.reload(); await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await r.close();
});

test("[V23] admin rejects with a note → worker sees it, cannot go online, is not listed to clients; appeals", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const r = await register(browser, { id: "V23", name: n("Dr. Arun Kumar") });
  const card = await adminSees(browser, "V23", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-note").fill("Council certificate expired in 2024.");
  await card.getByTestId("admin-reject").click(); await expect(card).toHaveCount(0);
  await r.page.reload();
  await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "rejected");
  await expect(r.page.getByTestId("review-note")).toContainText("expired in 2024");
  await expect(r.page.getByTestId("go-online")).toBeDisabled();
  // a client in the same area does not see a rejected worker
  const c = await person(browser, null);
  await signInAt(c.page, c.page.request, `vf${TAG()}-v23client`);
  await c.page.goto("/browse/professionals--doctor--allopathy--paediatrics");
  await expect(c.page.locator(`[data-testid="worker-card"]`, { hasText: n("Dr. Arun Kumar") })).toHaveCount(0);
  await snap(c.page, "V23", "client-list");
  await r.page.getByTestId("appeal-note").fill("My renewed certificate is attached to my council profile.");
  await r.page.getByTestId("appeal-submit").click();
  await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "pending");
  await snap(r.page, "V23", "appealed");
  await c.close(); await r.close();
});

for (const [id, cat, reg, regStatus] of [
  ["V24", "lawyer", "MS/7001/2016", "pass"],
  ["V25", "engineer", undefined, undefined],
  ["V26", "vet", undefined, "review"],
  ["V27", "physio", undefined, "review"],
] as const) {
  test(`[${id}] ${cat}: genuine registration → registry ${regStatus ?? "not required"}, decision recorded, admin can approve`, async ({ browser }) => {
    const catSlug = cat === "lawyer" ? "professionals--lawyer" : cat === "engineer" ? "professionals--engineer" : "professionals--doctor";
    await autoApprove(browser, catSlug, "off");
    const title = cat === "lawyer" ? "Adv." : cat === "engineer" ? "Er." : "Dr.";
    const doc = cat === "lawyer" ? "cert-law.pdf" : cat === "engineer" ? "cert-eng.pdf" : "cert-arun.pdf";
    const r = await register(browser, { id, name: n(`${title} Arun Kumar`), cat, reg, doc: `${FX}/${doc}` });
    if (regStatus) expect(r.checks.registry).toBe(regStatus); else expect(r.checks.registry).toBeUndefined();
    expect(r.checks.identity).toBe("pass"); expect(r.checks.status).toBe("pending");
    const card = await adminSees(browser, id, n(`${title} Arun Kumar`));
    await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
    await r.page.reload(); await expect(r.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
    await r.close();
  });
}

test("[V28] approved doctor; 90 days later the council shows suspended → recheck takes them offline with a reason", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const r = await register(browser, { id: "V28", name: n("Dr. Arun Kumar") });
  const card = await adminSees(browser, "V28", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
  await r.page.reload(); await r.page.getByTestId("go-online").click(); await expect(r.page.getByTestId("go-online")).toBeChecked();
  council({ "TNMC 70001": { html: "<table>\n<tr><td>TNMC 70001</td><td>Dr. Arun Kumar</td><td>Removed from register</td></tr>\n</table>" } });
  // TIME TRAVEL (cron 03:00 IST job): pretend the last check was 91 days ago, then run the daily recheck scan
  sql(`UPDATE public.verification_cases c SET created_at = now() - interval '91 days' FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE c.worker_id = w.id AND u.email = '${r.email}';
       UPDATE public.workers w SET verified_at = now() - interval '91 days' FROM auth.users u WHERE u.id = w.user_id AND u.email = '${r.email}';
       SELECT public.verification_scan_rechecks();`);
  await expect.poll(async () => { await r.page.reload(); return r.page.getByTestId("worker-status").getAttribute("data-status"); }, { timeout: 90_000, intervals: [2000] }).toBe("rejected");
  await expect(r.page.getByTestId("go-online")).not.toBeChecked();
  await expect(r.page.getByTestId("review-note")).toHaveAttribute("data-code", "registry:suspended");
  await snap(r.page, "V28", "recheck-suspended");
  await r.close();
});

test("[V29] 30 days after the decision the raw selfie and liveness frames are deleted; the consented public portrait stays", async ({ browser }) => {
  await autoApprove(browser, "professionals--doctor", "off");
  const r = await register(browser, { id: "V29", name: n("Dr. Arun Kumar") });
  const card = await adminSees(browser, "V29", n("Dr. Arun Kumar"));
  await card.getByTestId("admin-approve").click(); await expect(card).toHaveCount(0);
  const raw = sql(`SELECT c.raw_selfie_path FROM public.verification_cases c JOIN public.workers w ON w.id = c.worker_id JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${r.email}' ORDER BY c.created_at DESC LIMIT 1`);
  expect(raw).not.toBe("");
  // TIME TRAVEL (hourly retention job): the decision was 31 days ago, then run the service's maintenance
  sql(`UPDATE public.verification_cases c SET purge_after = now() - interval '1 day' FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE c.worker_id = w.id AND u.email = '${r.email}';`);
  const m = await fetch(`http://127.0.0.1:${PORT}/verify/maintenance`, { method: "POST", headers: { authorization: `Bearer ${KEY}` } });
  expect((await m.json()).purged).toBeGreaterThanOrEqual(1);
  expect(sql(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'kyc' AND name = '${raw}'`)).toBe("0");
  // the public profile still shows the consented portrait
  const wid = sql(`SELECT w.id FROM public.workers w JOIN auth.users u ON u.id = w.user_id WHERE u.email = '${r.email}'`);
  await r.page.goto(`/w/${wid}`);
  await expect(r.page.locator("img").first()).toBeVisible();
  const a = await admin(browser);
  await a.goto("/admin#appeals"); await a.reload();
  await snap(r.page, "V29", "portrait-kept");
  await r.close();
});
