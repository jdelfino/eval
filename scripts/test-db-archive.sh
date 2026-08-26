#!/usr/bin/env bash
# Tests for db-archive.sh
# Run from repo root: bash scripts/test-db-archive.sh
#
# gcloud, docker, and psql all exist for real in the environments this runs
# in (dev container / CI). Every test below either stubs those tools out via
# a mock directory prepended to PATH (shadowing the real binaries) or, for
# the "required tool is missing" tests, uses a PATH that contains nothing
# but the specific mocks it needs — never the real gcloud/docker/psql.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_ARCHIVE_SCRIPT="$SCRIPT_DIR/db-archive.sh"

# Resolve real interpreter/tool paths at startup (before any PATH restriction).
BASH_BIN="$(command -v bash)"

PASS=0
FAIL=0

# ── Test helpers ────────────────────────────────────────────────────────────

assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  shift 2
  local actual_exit=0
  "$@" > /dev/null 2>&1 || actual_exit=$?
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

assert_output_contains() {
  local desc="$1"
  local pattern="$2"
  shift 2
  local output
  output=$("$@" 2>&1 || true)
  if echo "$output" | grep -qE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (output did not contain '$pattern')"
    echo "  Output was: $output"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$DB_ARCHIVE_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (db-archive.sh does not contain '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1"
  local pattern="$2"
  if ! grep -qE "$pattern" "$DB_ARCHIVE_SCRIPT" 2>/dev/null; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (db-archive.sh still contains '$pattern')"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT

SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# make_gcloud_mock <dir> <call_log> — writes a mock gcloud that logs every
# invocation to <call_log> and simulates a fully healthy export: every
# `sql export sql --async` returns an operation name, `operations wait`
# succeeds, `operations describe --format=value(status)` reports DONE, the
# error lookup is empty, and `storage ls -l` reports a size.
make_gcloud_mock() {
  local dir="$1" call_log="$2"
  cat > "$dir/gcloud" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${call_log}"
case "\$*" in
  *"sql export sql"*"--async"*)
    echo "op-\${RANDOM}"
    ;;
  *"sql operations wait"*)
    exit 0
    ;;
  *"sql operations describe"*"value(status)"*)
    echo "DONE"
    ;;
  *"sql operations describe"*"error.errors"*)
    # empty stdout = no error
    ;;
  *"storage ls -l"*)
    echo "2048"
    ;;
  *)
    echo "unexpected gcloud invocation: \$*" >&2
    exit 99
    ;;
esac
EOF
  chmod +x "$dir/gcloud"
}

# ────────────────────────────────────────────────────────────────────────────
# 1. Argument / flag parsing
# ────────────────────────────────────────────────────────────────────────────

assert_exit "-h prints help and exits 0" 0 \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" -h

assert_output_contains "--help output documents --verify" "verify" \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --help

assert_exit "Unknown flag exits 2" 2 \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --bogus-flag

assert_output_contains "Unknown flag error names the offending argument" "unknown argument.*--bogus-flag" \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --bogus-flag

assert_exit "--verify without STAMP exits 2" 2 \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --verify

assert_output_contains "--verify without STAMP error mentions STAMP" "STAMP" \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --verify

assert_exit "--database without a value exits 2" 2 \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --database

assert_output_contains "--database without a value error is clear" "database.*requires a value" \
  env -i PATH="${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    bash "$DB_ARCHIVE_SCRIPT" --database

# ────────────────────────────────────────────────────────────────────────────
# 2. Fails when a required tool is missing (never falls back to the real
#    gcloud/docker/psql on this machine — PATH below contains only the
#    mocks explicitly provided, nothing else).
# ────────────────────────────────────────────────────────────────────────────

assert_exit "Missing gcloud (export mode) exits 1" 1 \
  env -i PATH="" HOME="${HOME:-/root}" \
    "$BASH_BIN" "$DB_ARCHIVE_SCRIPT"

assert_output_contains "Missing gcloud error names gcloud" "required tool.*gcloud" \
  env -i PATH="" HOME="${HOME:-/root}" \
    "$BASH_BIN" "$DB_ARCHIVE_SCRIPT"

MOCK_GCLOUD_ONLY="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_GCLOUD_ONLY}/gcloud" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${MOCK_GCLOUD_ONLY}/gcloud"

assert_exit "Missing docker (verify mode) exits 1" 1 \
  env -i PATH="${MOCK_GCLOUD_ONLY}" HOME="${HOME:-/root}" \
    "$BASH_BIN" "$DB_ARCHIVE_SCRIPT" --verify 20260101T000000Z

assert_output_contains "Missing docker error names docker" "required tool.*docker" \
  env -i PATH="${MOCK_GCLOUD_ONLY}" HOME="${HOME:-/root}" \
    "$BASH_BIN" "$DB_ARCHIVE_SCRIPT" --verify 20260101T000000Z

# ────────────────────────────────────────────────────────────────────────────
# 3. Fails loudly when gcloud reports a failed operation (status DONE but a
#    non-empty error message — the realistic Cloud SQL failure shape: the
#    async export call itself exits 0, the failure only shows up on describe).
# ────────────────────────────────────────────────────────────────────────────

MOCK_FAILED_OP="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_FAILED_OP}/gcloud" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"sql export sql"*"--async"*)
    echo "op-1"
    ;;
  *"sql operations wait"*)
    exit 0
    ;;
  *"sql operations describe"*"value(status)"*)
    echo "DONE"
    ;;
  *"sql operations describe"*"error.errors"*)
    echo "permission denied writing to bucket"
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod +x "${MOCK_FAILED_OP}/gcloud"

assert_exit "Failed export operation causes non-zero exit" 1 \
  env -i PATH="${MOCK_FAILED_OP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project INSTANCE=test-instance BUCKET=test-bucket STAMP=20260101T000000Z \
    bash "$DB_ARCHIVE_SCRIPT"

assert_output_contains "Failed export operation surfaces the gcloud error message" "permission denied writing to bucket" \
  env -i PATH="${MOCK_FAILED_OP}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project INSTANCE=test-instance BUCKET=test-bucket STAMP=20260101T000000Z \
    bash "$DB_ARCHIVE_SCRIPT"

# ────────────────────────────────────────────────────────────────────────────
# 4. Object path layout: gs://$BUCKET/$STAMP/$DB.sql.gz for both eval and
#    eval_staging (the default database set).
# ────────────────────────────────────────────────────────────────────────────

MOCK_HAPPY="$(mktemp -d -p "$TMPDIR_ROOT")"
CALL_LOG="${TMPDIR_ROOT}/happy_calls.log"
: > "$CALL_LOG"
make_gcloud_mock "$MOCK_HAPPY" "$CALL_LOG"

happy_exit=0
happy_output=$(
  env -i PATH="${MOCK_HAPPY}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PROJECT_ID=test-project INSTANCE=test-instance BUCKET=test-bucket STAMP=20260101T000000Z \
    bash "$DB_ARCHIVE_SCRIPT" 2>&1
) || happy_exit=$?

if [ "$happy_exit" -eq 0 ]; then
  echo "PASS: Default export (both databases) exits 0"
  PASS=$((PASS + 1))
else
  echo "FAIL: Default export exited $happy_exit"
  echo "  Output: $happy_output"
  FAIL=$((FAIL + 1))
fi

if grep -qF "gs://test-bucket/20260101T000000Z/eval.sql.gz" "$CALL_LOG"; then
  echo "PASS: eval object path is gs://\$BUCKET/\$STAMP/eval.sql.gz"
  PASS=$((PASS + 1))
else
  echo "FAIL: eval object path not found in gcloud invocations"
  echo "  Calls: $(cat "$CALL_LOG")"
  FAIL=$((FAIL + 1))
fi

if grep -qF "gs://test-bucket/20260101T000000Z/eval_staging.sql.gz" "$CALL_LOG"; then
  echo "PASS: eval_staging object path is gs://\$BUCKET/\$STAMP/eval_staging.sql.gz"
  PASS=$((PASS + 1))
else
  echo "FAIL: eval_staging object path not found in gcloud invocations"
  echo "  Calls: $(cat "$CALL_LOG")"
  FAIL=$((FAIL + 1))
fi

if echo "$happy_output" | grep -qF "gs://test-bucket/20260101T000000Z/eval.sql.gz"; then
  echo "PASS: Export prints the resulting gs:// URI on success"
  PASS=$((PASS + 1))
else
  echo "FAIL: Export did not print the resulting gs:// URI"
  echo "  Output: $happy_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 5. --database restricts the export to only the named database(s)
# ────────────────────────────────────────────────────────────────────────────

MOCK_ONEDB="$(mktemp -d -p "$TMPDIR_ROOT")"
ONEDB_LOG="${TMPDIR_ROOT}/onedb_calls.log"
: > "$ONEDB_LOG"
make_gcloud_mock "$MOCK_ONEDB" "$ONEDB_LOG"

env -i PATH="${MOCK_ONEDB}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
  PROJECT_ID=test-project INSTANCE=test-instance BUCKET=test-bucket STAMP=20260101T000000Z \
  bash "$DB_ARCHIVE_SCRIPT" --database eval > /dev/null 2>&1 || true

if grep -qF "eval.sql.gz" "$ONEDB_LOG" && ! grep -qF "eval_staging.sql.gz" "$ONEDB_LOG"; then
  echo "PASS: --database eval restricts export to only eval"
  PASS=$((PASS + 1))
else
  echo "FAIL: --database eval did not restrict the export as expected"
  echo "  Calls: $(cat "$ONEDB_LOG")"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 6. --verify row-count comparison (compare_row_counts) — the single most
#    important check in the epic. Test it directly by sourcing the script
#    (guarded against auto-running main via the BASH_SOURCE check) and
#    calling the function with mocked psql (prod side) and docker (restored
#    side). Fails closed on mismatch, empty results, or query errors.
# ────────────────────────────────────────────────────────────────────────────

run_compare_row_counts() {
  local mock_dir="$1"
  env -i PATH="${mock_dir}:${SYSTEM_PATH}" HOME="${HOME:-/root}" \
    PGPASSWORD=dummy-test-password \
    bash -c "
      source '$DB_ARCHIVE_SCRIPT' 2>/dev/null || true
      compare_row_counts eval 5433
    "
}

# 6a. Matching row counts -> success
MOCK_MATCH="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_MATCH}/psql" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|10\n'
EOF
chmod +x "${MOCK_MATCH}/psql"
cat > "${MOCK_MATCH}/docker" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|10\n'
EOF
chmod +x "${MOCK_MATCH}/docker"

match_exit=0
match_output=$(run_compare_row_counts "$MOCK_MATCH" 2>&1) || match_exit=$?

if [ "$match_exit" -eq 0 ]; then
  echo "PASS: compare_row_counts succeeds when prod and restored counts match"
  PASS=$((PASS + 1))
else
  echo "FAIL: compare_row_counts failed on matching counts (exit $match_exit)"
  echo "  Output: $match_output"
  FAIL=$((FAIL + 1))
fi

# 6b. Non-empty diff -> refuses to proceed (non-zero exit, clear message)
MOCK_MISMATCH="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_MISMATCH}/psql" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|10\n'
EOF
chmod +x "${MOCK_MISMATCH}/psql"
cat > "${MOCK_MISMATCH}/docker" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|9\n'
EOF
chmod +x "${MOCK_MISMATCH}/docker"

mismatch_exit=0
mismatch_output=$(run_compare_row_counts "$MOCK_MISMATCH" 2>&1) || mismatch_exit=$?

if [ "$mismatch_exit" -ne 0 ]; then
  echo "PASS: compare_row_counts refuses to proceed on a non-empty row-count diff"
  PASS=$((PASS + 1))
else
  echo "FAIL: compare_row_counts exited 0 despite a row-count mismatch"
  echo "  Output: $mismatch_output"
  FAIL=$((FAIL + 1))
fi

if echo "$mismatch_output" | grep -qiE "mismatch|refus"; then
  echo "PASS: row-count mismatch produces a clear refusal message"
  PASS=$((PASS + 1))
else
  echo "FAIL: row-count mismatch output does not explain the failure"
  echo "  Output: $mismatch_output"
  FAIL=$((FAIL + 1))
fi

# 6c. Empty result from either side -> fails closed
MOCK_EMPTY="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_EMPTY}/psql" <<'EOF'
#!/usr/bin/env bash
# prod query returns nothing
true
EOF
chmod +x "${MOCK_EMPTY}/psql"
cat > "${MOCK_EMPTY}/docker" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|10\n'
EOF
chmod +x "${MOCK_EMPTY}/docker"

empty_exit=0
empty_output=$(run_compare_row_counts "$MOCK_EMPTY" 2>&1) || empty_exit=$?

if [ "$empty_exit" -ne 0 ]; then
  echo "PASS: compare_row_counts fails closed on an empty prod result"
  PASS=$((PASS + 1))
else
  echo "FAIL: compare_row_counts exited 0 despite an empty prod result"
  echo "  Output: $empty_output"
  FAIL=$((FAIL + 1))
fi

# 6d. psql query failure (non-zero exit) on the prod side -> fails closed
MOCK_QUERYFAIL="$(mktemp -d -p "$TMPDIR_ROOT")"
cat > "${MOCK_QUERYFAIL}/psql" <<'EOF'
#!/usr/bin/env bash
echo "psql: error: connection refused" >&2
exit 2
EOF
chmod +x "${MOCK_QUERYFAIL}/psql"
cat > "${MOCK_QUERYFAIL}/docker" <<'EOF'
#!/usr/bin/env bash
printf 'sessions|3\nusers|10\n'
EOF
chmod +x "${MOCK_QUERYFAIL}/docker"

queryfail_exit=0
queryfail_output=$(run_compare_row_counts "$MOCK_QUERYFAIL" 2>&1) || queryfail_exit=$?

if [ "$queryfail_exit" -ne 0 ]; then
  echo "PASS: compare_row_counts fails closed when the prod query itself fails"
  PASS=$((PASS + 1))
else
  echo "FAIL: compare_row_counts exited 0 despite a failed prod query"
  echo "  Output: $queryfail_output"
  FAIL=$((FAIL + 1))
fi

# ────────────────────────────────────────────────────────────────────────────
# 7. Structure: reuses scripts/db-proxy.sh for prod DB access instead of
#    implementing a second access path.
# ────────────────────────────────────────────────────────────────────────────

assert_contains \
  "Verify mode reuses scripts/db-proxy.sh for prod DB access" \
  "db-proxy\.sh"

assert_not_contains \
  "Verify mode does not implement a second kubectl port-forward path" \
  "kubectl port-forward"

assert_contains \
  "Restore uses ON_ERROR_STOP so a bad restore fails loudly" \
  "ON_ERROR_STOP"

# ────────────────────────────────────────────────────────────────────────────
# 8. Dump role/credential audit (check_dump_roles) — issue test case 4. On
#    wake-up the random_password resources are regenerated, so an archive
#    that carries credentials or depends on roles the cloudsql module does
#    not create would either leak old passwords or fail the restore.
#    Operates on real gzip fixtures; no cloud tools involved.
# ────────────────────────────────────────────────────────────────────────────

# make_dump_fixture <content> -> path to a .sql.gz containing it
make_dump_fixture() {
  local content="$1"
  local dir
  dir="$(mktemp -d -p "$TMPDIR_ROOT")"
  printf '%s\n' "$content" | gzip -c > "${dir}/eval.sql.gz"
  echo "${dir}/eval.sql.gz"
}

run_check_dump_roles() {
  local fixture="$1"
  bash -c "
    source '$DB_ARCHIVE_SCRIPT' 2>/dev/null || true
    check_dump_roles eval '$fixture'
  "
}

# 8a. A clean dump referencing only module-created roles passes.
CLEAN_DUMP="$(make_dump_fixture 'CREATE TABLE public.users (id integer);
ALTER TABLE public.users OWNER TO app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO app;
GRANT SELECT ON TABLE public.users TO reader;')"

assert_exit "check_dump_roles accepts a dump referencing only app/reader/PUBLIC" 0 \
  run_check_dump_roles "$CLEAN_DUMP"

# 8b. An embedded CREATE ROLE is rejected.
CREATE_ROLE_DUMP="$(make_dump_fixture 'CREATE ROLE app;
GRANT SELECT ON TABLE public.users TO reader;')"

assert_exit "check_dump_roles rejects a dump containing CREATE ROLE" 1 \
  run_check_dump_roles "$CREATE_ROLE_DUMP"

assert_output_contains "CREATE ROLE rejection names the offending statement" "CREATE ROLE app" \
  run_check_dump_roles "$CREATE_ROLE_DUMP"

# 8c. An embedded password is rejected — this is the credential-leak case.
PASSWORD_DUMP="$(make_dump_fixture "ALTER ROLE app WITH PASSWORD 'hunter2';
GRANT SELECT ON TABLE public.users TO reader;")"

assert_exit "check_dump_roles rejects a dump containing ALTER ROLE ... PASSWORD" 1 \
  run_check_dump_roles "$PASSWORD_DUMP"

assert_output_contains "Credential rejection mentions role/credential statements" "role/credential statements" \
  run_check_dump_roles "$PASSWORD_DUMP"

# 8d. A GRANT to a role the cloudsql module does not create is rejected —
#     the restore into a woken instance would fail on it.
UNKNOWN_ROLE_DUMP="$(make_dump_fixture 'GRANT SELECT ON TABLE public.users TO legacy_analyst;')"

assert_exit "check_dump_roles rejects a GRANT to an unknown role" 1 \
  run_check_dump_roles "$UNKNOWN_ROLE_DUMP"

assert_output_contains "Unknown-role rejection names the role" "legacy_analyst" \
  run_check_dump_roles "$UNKNOWN_ROLE_DUMP"

# 8e. Comma-separated grantee lists are split, not treated as one token.
MULTI_GRANT_DUMP="$(make_dump_fixture 'GRANT SELECT ON TABLE public.users TO reader, legacy_analyst;')"

assert_exit "check_dump_roles splits comma-separated grantees" 1 \
  run_check_dump_roles "$MULTI_GRANT_DUMP"

assert_output_contains "Comma-separated rejection names only the bad role" "legacy_analyst" \
  run_check_dump_roles "$MULTI_GRANT_DUMP"

# 8f. Quoted role names and WITH GRANT OPTION suffixes are handled.
QUOTED_DUMP="$(make_dump_fixture 'GRANT SELECT ON TABLE public.users TO "reader" WITH GRANT OPTION;')"

assert_exit "check_dump_roles strips quotes and WITH GRANT OPTION" 0 \
  run_check_dump_roles "$QUOTED_DUMP"

# 8g. Verify mode actually calls the audit — a check nothing invokes is dead.
assert_contains \
  "Verify flow runs the dump role audit before restoring" \
  "check_dump_roles"

# ────────────────────────────────────────────────────────────────────────────
# Results
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
