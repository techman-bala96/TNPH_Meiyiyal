#!/usr/bin/env bash
# Dev runner. Reads Supabase URL from the web app .env.local and never echoes secrets.
set -euo pipefail
cd "$(dirname "$0")"
envf=../../.env.local
get() { [ -f "$envf" ] && grep -E "^$1=" "$envf" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
export SUPABASE_URL="${SUPABASE_URL:-$(get VITE_SUPABASE_URL)}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(get SUPABASE_SERVICE_ROLE_KEY)}"
[ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt; }
exec .venv/bin/uvicorn verify.main:app --host 127.0.0.1 --port "${VERIFY_PORT:-8788}"
