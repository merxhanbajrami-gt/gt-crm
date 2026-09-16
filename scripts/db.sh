#!/usr/bin/env bash
# psql against the GT / OS Supabase database.
#
# The direct host (db.<ref>.supabase.co) is IPv6-only and does not resolve
# locally, so everything goes through the eu-west-1 session pooler. Credentials
# come from .env.local, which is gitignored — never put the password here.
#
#   scripts/db.sh -f supabase/migrations/0018_foo.sql
#   scripts/db.sh -c "select count(*) from deals"
#
# ON_ERROR_STOP is on, so a failing statement aborts the file instead of
# leaving it half applied.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$root/.env.local"; set +a

PGPASSWORD="$SUPABASE_DB_PASSWORD" exec psql \
  -h aws-0-eu-west-1.pooler.supabase.com \
  -p 5432 \
  -U postgres.odwtjxalszuodcggnslt \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  "$@"
