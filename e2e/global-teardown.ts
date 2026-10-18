import { existsSync, readFileSync } from "node:fs";
import { sql } from "./workerFlow";
export default function teardown() {
  const f = "test-results/.admin-mfa-prev";
  const prev = existsSync(f) ? readFileSync(f, "utf8").trim() : "true";
  sql(`UPDATE public.app_settings SET value = '${prev === "false" ? "false" : "true"}' WHERE key = 'admin_mfa_required'`);
}
