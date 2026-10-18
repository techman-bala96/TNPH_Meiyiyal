import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "./workerFlow";
// Most admin flows sign in with email links (aal1). Admin MFA is switched off for the run; e2e/admin-mfa.spec.ts turns it
// on for itself. global-teardown restores the value that was there before.
export default function setup() {
  const prev = sql(`SELECT value::text FROM public.app_settings WHERE key = 'admin_mfa_required'`) || "true";
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/.admin-mfa-prev", prev);
  sql(`UPDATE public.app_settings SET value = 'false' WHERE key = 'admin_mfa_required'`);
}
