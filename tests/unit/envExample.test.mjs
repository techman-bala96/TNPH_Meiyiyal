import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === "__pycache__" || f === ".venv" ? [] : walk(p)) : [p]; });
const example = readFileSync(".env.example", "utf8");
const listed = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

test(".env.example lists every VITE_* the web app reads", () => {
  const used = new Set(walk("src").filter((f) => /\.(ts|tsx)$/.test(f)).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\b(VITE_[A-Z0-9_]+)\b/g)].map((m) => m[1])));
  const missing = [...used].filter((k) => !listed.has(k));
  assert.deepEqual(missing, []);
});
test(".env.example lists every Edge Function secret", () => {
  const used = new Set(walk("supabase/functions").filter((f) => f.endsWith(".ts")).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/env(?:\.get)?\(\s*"([A-Z][A-Z0-9_]+)"/g)].map((m) => m[1])));
  ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].forEach((k) => used.delete(k));
  assert.deepEqual([...used].filter((k) => !listed.has(k)), []);
});
test(".env.example carries no values", () => {
  for (const line of example.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/); if (!m) continue;
    assert.match(m[2], /^\s*(#.*)?$/, `${m[1]} must be empty`);
  }
});
