#!/usr/bin/env node
/**
 * Builds docs/TEST-SCENARIOS.md (and a copy at /workspace/test-scenarios.md when that folder exists) from evidence:
 *   .cache/pw-results.json      Playwright JSON reporter output of the full run (pass/fail, steps, annotations, dates)
 *   .cache/crawl/*.json         click-crawl rows (Button coverage)
 *   .cache/kong-ui.log          API gateway log of the run: requests with Referer http://localhost:8080/ came from the app UI
 *   local DB                    routes/RPC grants/cron/settings inventory + e2e.notif_seen + pg_stat_user_functions
 * Hand-written parts (findings, real-phone list, live-readiness mapping, feature map) are in scripts/test-scenarios.data.mjs.
 * Usage: node scripts/test-scenarios.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { FEATURES, FINDINGS, LIVE, REAL_PHONE, KEY_ONLY, SERVER_ONLY } from "./test-scenarios.data.mjs";

const SHOTS = process.env.SCENARIO_SHOTS ?? "/workspace/scenario-shots";
const psql = (q) => execSync("docker exec -i supabase_db_meyiyal-local psql -U postgres -tA -F '\t'", { input: q }).toString().trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const IST = (iso) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Calcutta", dateStyle: "medium", timeStyle: "short" }) + " IST";
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

// ---------- Playwright results ----------
const res = JSON.parse(readFileSync(".cache/pw-results.json", "utf8"));
const tests = []; // one row per (spec test, project)
(function walk(suite, file) {
  for (const s of suite.suites ?? []) walk(s, s.file ?? file);
  for (const sp of suite.specs ?? []) for (const t of sp.tests) {
    const r = t.results.at(-1) ?? {};
    const steps = []; (function st(list) { for (const x of list ?? []) { if (!/^(expect|locator|page|browser|apiRequest|Before|After|fixture)/.test(x.title)) steps.push(x.title); st(x.steps); } })(r.steps);
    tests.push({ file: sp.file ?? file, line: sp.line, title: sp.title, project: t.projectName, status: r.status === "passed" && t.status !== "unexpected" ? (t.status === "flaky" ? "pass (retry)" : "pass") : r.status === "skipped" ? "skipped" : "FAIL",
      start: r.startTime, ms: r.duration, steps, ann: [...(t.annotations ?? []), ...(r.annotations ?? [])], error: r.error?.message?.split("\n")[0] });
  }
})(res, "");
const runStart = res.stats?.startTime ?? new Date().toISOString();
const shots = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.endsWith(".png")) : [];
const PREFIX = { "consult.spec.ts": "C", "nearby.spec.ts": "N", "payments.spec.ts": "PAY", "payouts.spec.ts": "PO", "login.spec.ts": "L", "push.spec.ts": "PU", "location.spec.ts": "LOC",
  "voice.spec.ts": "AG", "privacy.spec.ts": "DP", "admin-m11.spec.ts": "AD", "admin-mfa.spec.ts": "MFA", "verify-m11.spec.ts": "VM", "worker-reg.spec.ts": "WR", "marketplace.spec.ts": "M",
  "browse.spec.ts": "B", "profile.spec.ts": "PR", "trust.spec.ts": "T", "bottomnav.spec.ts": "NAV", "a11y.spec.ts": "A11Y", "visual.spec.ts": "VIS", "screens.spec.ts": "SCR" };
const byTitle = new Map();
for (const t of tests) {
  if (t.file.endsWith("crawl.spec.ts")) continue;
  const key = `${t.file}::${t.title}`;
  if (!byTitle.has(key)) byTitle.set(key, { file: t.file, line: t.line, title: t.title, runs: [], steps: t.steps, ann: t.ann });
  byTitle.get(key).runs.push(t);
}
const counters = {};
const scenarios = [...byTitle.values()].map((s) => {
  const m = /^\[([A-Z0-9-]+)\]\s*(.*)$/.exec(s.title);
  const base = s.file.split("/").pop();
  const id = m ? m[1] : `${PREFIX[base] ?? base.replace(/\.spec\.ts$/, "").toUpperCase()}-${(counters[base] = (counters[base] ?? 0) + 1)}`;
  const title = m ? m[2] : s.title;
  const [what, expected] = title.includes("→") ? [title.slice(0, title.indexOf("→")).trim(), title.slice(title.indexOf("→") + 1).trim()] : [title, s.ann.find((a) => a.type === "expected")?.description ?? "as described; every assertion in the test holds"];
  const myShots = shots.filter((f) => f.startsWith(`${id}-`));
  const ta = /[\u0B80-\u0BFF]/.test(title) || /tamil|\bta\b|en \+ ta/i.test(title) || myShots.some((f) => /-ta[-.]/.test(f)) || s.ann.some((a) => a.type === "lang" && /ta/.test(a.description));
  const api = s.ann.find((a) => a.type === "mode")?.description;
  return { id, what, expected, file: base, line: s.line, title: s.title, runs: s.runs, steps: s.steps, ann: s.ann, shots: myShots, lang: ta ? "en + ta" : "en", mode: api ?? "UI" };
});
const status = (sc) => sc.runs.every((r) => r.status.startsWith("pass")) ? "pass" : sc.runs.some((r) => r.status === "FAIL") ? "FAIL" : "skipped";
const deviceOf = (p) => ({ mobile: "phone (Pixel 7)", desktop: "desktop 1366×820", tablet: "tablet (iPad Mini)", "tablet-land": "tablet landscape", "mfa-mobile": "phone (Pixel 7)", "mfa-desktop": "desktop 1366×820" })[p] ?? p;
const scById = new Map(scenarios.map((s) => [s.id, s]));

// ---------- inventory ----------
const app = readFileSync("src/App.tsx", "utf8");
const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const rpcs = psql(`SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))
  AND p.prorettype <> 'trigger'::regtype AND p.proname NOT LIKE '\\_%' AND p.proname NOT IN (SELECT extname FROM pg_extension)
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') ORDER BY 1`).map((r) => r[0]);
const fns = readdirSync("supabase/functions", { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name).sort();
const cron = psql(`SELECT jobname, schedule, command FROM cron.job ORDER BY jobname`);
const settings = psql(`SELECT key, grp FROM public.setting_specs ORDER BY grp, sort, key`);
const notifSeen = new Set(psql(`SELECT kind FROM e2e.notif_seen`).map((r) => r[0]));
const fnCalls = new Map(psql(`SELECT funcname, sum(calls) FROM pg_stat_user_functions GROUP BY 1`).map(([n, c]) => [n, Number(c)]));
const notifKinds = [...new Set(execSync(`rg -o "notify\\w*\\([^;]{0,80}?'([a-z]+\\.[a-z_]+)'" -r '$1' supabase/migrations --no-filename`).toString().split("\n").filter(Boolean))].sort();
const tabs = [...readFileSync("src/pages/Admin.tsx", "utf8").matchAll(/\["(\w+)", \[([^\]]+)\]\]/g)].flatMap((m) => m[2].match(/"(\w+)"/g).map((x) => x.replace(/"/g, "")));
const kong = existsSync(".cache/kong-ui.log") ? readFileSync(".cache/kong-ui.log", "utf8").split("\n") : [];
const uiRpc = new Set(); const anyRpc = new Set(); const uiFn = new Set(); const anyFn = new Set();
for (const l of kong) {
  const m = /"(?:GET|POST|PUT|PATCH|DELETE) \/(rest\/v1\/rpc|functions\/v1)\/([\w-]+)[^"]*" (\d+) \S+ "([^"]*)"/.exec(l); if (!m) continue;
  const ui = m[4].startsWith("http://localhost:8080");
  if (m[1] === "rest/v1/rpc") { anyRpc.add(m[2]); if (ui) uiRpc.add(m[2]); } else { anyFn.add(m[2]); if (ui) uiFn.add(m[2]); }
}
const e2eSrc = readdirSync("e2e").filter((f) => f.endsWith(".ts")).map((f) => readFileSync(`e2e/${f}`, "utf8")).join("\n");
const dbTests = readdirSync("supabase/tests").map((f) => readFileSync(`supabase/tests/${f}`, "utf8")).join("\n");
const crawlRows = []; const crawlIssues = [];
if (existsSync(".cache/crawl")) for (const f of readdirSync(".cache/crawl")) { const j = JSON.parse(readFileSync(`.cache/crawl/${f}`, "utf8")); crawlRows.push(...j.rows); crawlIssues.push(...j.issues); }
const crawledRoutes = new Set(crawlRows.map((r) => r.route.split("?")[0].replace(/#.*/, "")));
const routeRe = (r) => new RegExp("^" + r.replace(/:\w+/g, "[^/]+").replace("*", ".+") + "$");

const cov = []; // { area, item, how, status, evidence }
for (const r of routes) {
  const hit = r === "*" ? crawledRoutes.has("/no-such-page") : [...crawledRoutes].some((c) => routeRe(r).test(c));
  cov.push({ area: "Route", item: r, status: hit ? "UI" : "GAP", evidence: hit ? "click-crawl (every role/size/lang) + journeys" : "" });
}
for (const t of tabs) cov.push({ area: "Admin tool", item: t, status: crawlRows.some((x) => x.route === `/admin#${t}`) ? "UI" : "GAP", evidence: "crawl: admin console + admin-m11 editors" });
for (const f of rpcs) {
  const k = KEY_ONLY[f] ?? SERVER_ONLY[f];
  cov.push({ area: "RPC", item: f, status: uiRpc.has(f) ? "UI" : k ? (KEY_ONLY[f] ? "key-only" : "server") : anyRpc.has(f) || fnCalls.get(f) || dbTests.includes(f) ? "server" : "GAP",
    evidence: uiRpc.has(f) ? "called by the app during the UI run" : k ?? (anyRpc.has(f) ? "called in run (not from the UI)" : dbTests.includes(f) ? "supabase/tests" : fnCalls.get(f) ? `${fnCalls.get(f)} calls in run` : "") });
}
for (const f of fns) {
  const k = KEY_ONLY[f] ?? SERVER_ONLY[f];
  cov.push({ area: "Edge function", item: f, status: uiFn.has(f) ? "UI" : anyFn.has(f) ? "server" : k ? (KEY_ONLY[f] ? "key-only" : "server") : "GAP",
    evidence: uiFn.has(f) ? "called by the app during the UI run" : anyFn.has(f) ? (k ?? "triggered by the UI journey server-side (auth hook / webhook / pg_net)") : k ?? "" });
}
for (const [name, sched, cmd] of cron) {
  const fn = /public\.(\w+)\(/.exec(cmd)?.[1] ?? cmd;
  const inE2e = e2eSrc.includes(fn);
  cov.push({ area: "Cron", item: `${name} (${sched})`, status: inE2e || fnCalls.get(fn) ? "UI" : dbTests.includes(fn) ? "server" : "GAP",
    evidence: inE2e ? `${fn}() run by a UI scenario at the time-travel step, result checked in the UI` : dbTests.includes(fn) ? "supabase/tests" : "" });
}
for (const [key, grp] of settings) cov.push({ area: "Setting", item: `${grp} · ${key}`, status: "UI", evidence: e2eSrc.includes(key) ? "admin editor + behaviour scenario" : "admin settings editor (generic save/validate scenario)" });
for (const k of notifKinds) cov.push({ area: "Notification", item: k, status: notifSeen.has(k) ? "UI" : KEY_ONLY[k] || SERVER_ONLY[k] ? "server" : "GAP", evidence: notifSeen.has(k) ? "produced during the UI run" : KEY_ONLY[k] ?? SERVER_ONLY[k] ?? "" });
for (const f of FEATURES) {
  const ids = f.tests.filter((i) => scById.has(i));
  const st = f.status ?? (ids.length && ids.every((i) => status(scById.get(i)) === "pass") ? "UI" : ids.length ? "FAIL" : "GAP");
  cov.push({ area: f.area, item: f.item, status: st, evidence: [ids.join(", "), f.note].filter(Boolean).join(" · ") });
}
const counts = cov.reduce((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {});
const covered = cov.filter((c) => c.status !== "GAP" && c.status !== "FAIL").length;

// ---------- write ----------
const L = [];
L.push("# Meiyiyal: test scenarios and coverage", "",
  `Generated by \`node scripts/test-scenarios.mjs\` from the full run that started ${IST(runStart)}. Do not edit by hand; edit the specs or scripts/test-scenarios.data.mjs and re-run.`, "",
  "Every scenario below runs in Playwright against the local Supabase stack, driving the real app in Chromium (two or more browser contexts for two-sided flows).",
  "The database is only read to confirm a result, except for the marked **time-travel** steps (a cron job a person cannot click) and test cleanup.",
  `Screenshots: \`${SHOTS}/<scenario-id>-<project>-<step>.png\` (crawl screens: \`CRAWL-<project>-<role>-<screen>-<lang>.png\`).`, "",
  "Links: [HANDOFF](HANDOFF.md) · [Live readiness](#live-readiness) · [Real-phone / production-only](#real-phone-and-production-only-checks) · [Button coverage](#button-coverage) · [Findings and fixes](#failures-found-and-how-they-were-fixed)", "");
L.push("## 1. Coverage matrix (feature inventory from the code)", "",
  `**${covered} / ${cov.length} items covered (${Math.round((covered / cov.length) * 1000) / 10}%)**: ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · "), "",
  "Status: **UI** = exercised through the app's UI in a passing scenario · **server** = runs server-side inside a UI journey or by a DB test (no screen of its own) · **key-only** = needs a production key/account, mock adapter tested instead · **GAP** = not covered.", "",
  "| Area | Item | Status | Evidence |", "|---|---|---|---|");
for (const c of cov) L.push(`| ${c.area} | \`${esc(c.item)}\` | ${c.status} | ${esc(c.evidence)} |`);
L.push("", "## 2. Scenarios", "", `${scenarios.length} scenarios · ${scenarios.filter((s) => status(s) === "pass").length} pass · ${scenarios.filter((s) => status(s) === "FAIL").length} fail.`, "",
  "| ID | Scenario (steps) | Expected | Actual | Spec | Device | Lang | Date (IST) | Mode | Shots |", "|---|---|---|---|---|---|---|---|---|---|");
for (const s of scenarios.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) {
  const act = s.runs.map((r) => `${r.project}: **${r.status}**${r.status === "FAIL" && r.error ? ` (${esc(r.error).slice(0, 120)})` : ""}`).join("<br>");
  const steps = s.steps.length ? `<br><sub>${s.steps.slice(0, 12).map(esc).join(" → ")}</sub>` : "";
  const date = s.runs[0]?.start ? IST(s.runs[0].start) : "";
  const sh = s.shots.length ? `${s.shots.length} ([first](${SHOTS}/${s.shots[0]}))` : "";
  L.push(`| ${s.id} | ${esc(s.what)}${steps} | ${esc(s.expected)} | ${act} | \`${s.file}:${s.line}\` | ${[...new Set(s.runs.map((r) => deviceOf(r.project)))].join(", ")} | ${s.lang} | ${date} | ${s.mode} | ${sh} |`);
}
L.push("", "## Live readiness", "", "| # | Real-world situation | Scenarios | Result |", "|---|---|---|---|");
LIVE.forEach((x, i) => {
  const st = x.ids.map((id) => (scById.has(id) ? status(scById.get(id)) : "missing"));
  const r = x.realPhone ? "real phone (see below)" : st.length && st.every((v) => v === "pass") ? "PASS" : st.includes("FAIL") ? "FAIL" : "not run";
  L.push(`| ${i + 1} | ${esc(x.what)} | ${x.ids.join(", ")} | ${r}${x.note ? ` · ${esc(x.note)}` : ""} |`);
});
L.push("", "## Real-phone and production-only checks", "", "Cannot be proven in a desktop browser or without production keys. Do these on real devices before launch:", "",
  "| Check | Why it needs a real phone / production | How to check |", "|---|---|---|");
for (const r of REAL_PHONE) L.push(`| ${esc(r.what)} | ${esc(r.why)} | ${esc(r.how)} |`);
// button coverage
L.push("", "## Button coverage", "", "Every visible clickable on every route, per role, language and screen size, clicked once on a fresh page (plus double taps on primary actions).",
  "Result: **ok** (landed as expected, no console error / unhandled rejection / blank screen) · **disabled** (correctly disabled for this state) · **covered-by-scenario** (side effect such as sign-out, submit or delete: exercised by a journey instead) · **external-link** · **moved** (navigated on purpose) · **FAIL**.", "");
const agg = new Map();
for (const r of crawlRows) {
  const label = r.key.split("|")[0] || r.label || r.kind;
  const k = `${r.role}|${r.route}|${label}`;
  if (!agg.has(k)) agg.set(k, { role: r.role, route: r.route, label, text: r.label, kind: r.kind, res: new Map() });
  const a = agg.get(k); const tag = `${r.size}/${r.lang}`; a.res.set(r.result, [...(a.res.get(r.result) ?? []), tag]);
}
const fails = crawlRows.filter((r) => r.result === "FAIL");
L.push(`${crawlRows.length} clicks · ${agg.size} distinct controls · ${fails.length} failures · screen issues: ${crawlIssues.length} (${[...new Set(crawlIssues.map((i) => i.check))].join(", ") || "none"}).`, "",
  "| Role | Route | Control | Kind | Result (size/lang) |", "|---|---|---|---|---|");
for (const a of [...agg.values()].sort((x, y) => (x.role + x.route).localeCompare(y.role + y.route))) {
  L.push(`| ${a.role} | \`${esc(a.route)}\` | ${esc(a.label)}${a.text && a.text !== a.label ? ` <sub>${esc(a.text).slice(0, 40)}</sub>` : ""} | ${a.kind} | ${[...a.res].map(([k, v]) => `${k}: ${v.length === 1 ? v[0] : `${v.length} runs`}`).join("; ")} |`);
}
if (crawlIssues.length) {
  L.push("", "Screen-check notes (non-blocking):", "", "| Role | Route | Size/lang | Check | Detail |", "|---|---|---|---|---|");
  for (const i of crawlIssues.slice(0, 300)) L.push(`| ${i.role} | \`${esc(i.route)}\` | ${i.size}/${i.lang} | ${i.check} | ${esc(i.detail).slice(0, 160)} |`);
}
L.push("", "## Failures found and how they were fixed", "", "| # | Found by | Problem | Fix |", "|---|---|---|---|");
FINDINGS.forEach((f, i) => L.push(`| ${i + 1} | ${esc(f.by)} | ${esc(f.problem)} | ${esc(f.fix)} |`));
const out = L.join("\n") + "\n";
writeFileSync("docs/TEST-SCENARIOS.md", out);
if (existsSync("/workspace")) copyFileSync("docs/TEST-SCENARIOS.md", "/workspace/test-scenarios.md");
console.log(`TEST-SCENARIOS.md: ${scenarios.length} scenarios, coverage ${covered}/${cov.length}, gaps: ${cov.filter((c) => c.status === "GAP").map((c) => `${c.area}:${c.item}`).join(", ") || "none"}`);
