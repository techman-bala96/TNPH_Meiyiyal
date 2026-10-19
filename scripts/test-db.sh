#!/usr/bin/env bash
# Runs every supabase/tests/*.sql. The older suites act as admins with plain JWT claims (aal1), so admin MFA is
# switched off for the run and restored afterwards, whatever happens. m11_admin_security.sql turns it on inside its own transaction.
set -euo pipefail
PSQL=(docker exec -i supabase_db_meyiyal-local psql -U postgres -v ON_ERROR_STOP=1 -q)
prev=$("${PSQL[@]}" -tA -c "SELECT value::text FROM public.app_settings WHERE key = 'admin_mfa_required'")
restore() { "${PSQL[@]}" -c "UPDATE public.app_settings SET value = '${prev:-true}'::jsonb WHERE key = 'admin_mfa_required'" >/dev/null; }
trap restore EXIT
"${PSQL[@]}" -c "UPDATE public.app_settings SET value = 'false' WHERE key = 'admin_mfa_required'" >/dev/null
for f in supabase/tests/*.sql; do echo "== $f"; "${PSQL[@]}" < "$f"; done
