import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { sql } from "./workerFlow";
// Most admin flows sign in with email links (aal1). Admin MFA is switched off for the run; e2e/admin-mfa.spec.ts turns it
// on for itself. global-teardown restores the value that was there before.
export default function setup() {
  const prev = sql(`SELECT value::text FROM public.app_settings WHERE key = 'admin_mfa_required'`) || "true";
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/.admin-mfa-prev", prev);
  sql(`UPDATE public.app_settings SET value = 'false' WHERE key = 'admin_mfa_required'`);
  // verification fixtures (test UIDAI cert, Secure QR images, camera videos, council register) for e2e/verification.spec.ts
  if (!existsSync(".cache/verify-fixtures/cam-a.y4m") || process.env.REBUILD_VERIFY_FIXTURES) {
    execSync("services/verify/.venv/bin/python scripts/verify-fixtures.py && node scripts/qr-png.mjs", { stdio: "inherit" });
  }
  // Coverage evidence for docs/TEST-SCENARIOS.md (scripts/test-scenarios.mjs), local test DB only:
  // which notification kinds were produced (rows vanish when test accounts are deleted, so record kinds as they appear),
  // and per-function call counts. Neither changes app behaviour.
  if (process.env.E2E_COVERAGE) {
    sql(`CREATE SCHEMA IF NOT EXISTS e2e;
      CREATE TABLE IF NOT EXISTS e2e.notif_seen(kind text PRIMARY KEY, first_at timestamptz DEFAULT now());
      CREATE OR REPLACE FUNCTION e2e.note_kind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO e2e.notif_seen(kind) VALUES (NEW.kind) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS e2e_note_kind ON public.notifications;
      CREATE TRIGGER e2e_note_kind AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION e2e.note_kind();`);
    // statistics settings need the local superuser (supabase_admin); ALTER SYSTEM cannot share a call with other statements
    const su = (q: string) => execSync("docker exec -i supabase_db_meyiyal-local psql -U supabase_admin -d postgres -tA -v ON_ERROR_STOP=1", { input: q });
    su(`ALTER SYSTEM SET track_functions = 'pl';`); su(`SELECT pg_reload_conf();`); if (process.env.E2E_COVERAGE_RESET) su(`SELECT pg_stat_reset();`); // batches keep adding to one count
    writeFileSync(".cache/coverage-start.txt", new Date().toISOString());
  }
}
