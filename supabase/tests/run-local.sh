#!/usr/bin/env bash
# Kjører migrasjonene + RLS-testene mot en lokal Postgres (uten Supabase/Docker).
#   Bruk:  PGHOST=localhost PGUSER=postgres ./supabase/tests/run-local.sh
# Oppretter (og sletter først) databasen «budget_test».
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-budget_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
"${PSQL[@]}" -d "${DB}" -f supabase/tests/local_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  "${PSQL[@]}" -d "${DB}" -f "$f"
done
"${PSQL[@]}" -d "${DB}" -f supabase/tests/rls.sql 2>&1 | sed -e 's/^psql:[^ ]* //'
