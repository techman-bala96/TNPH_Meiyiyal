#!/usr/bin/env bash
# Dev runner: reads the Supabase URL + public anon key from the web app's .env.local (never echoes them).
set -euo pipefail
cd "$(dirname "$0")"
envf=../../.env.local
get() { [ -f "$envf" ] && grep -E "^$1=" "$envf" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
export SUPABASE_URL="${SUPABASE_URL:-$(get VITE_SUPABASE_URL)}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(get VITE_SUPABASE_PUBLISHABLE_KEY)}"
[ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt; }
exec .venv/bin/uvicorn agent.main:app --host 127.0.0.1 --port "${AGENT_PORT:-8787}"
