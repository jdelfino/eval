#!/usr/bin/env bash
# Tests for lint-migrations.sh
# Run from repo root: bash scripts/test-lint-migrations.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINT_SCRIPT="$SCRIPT_DIR/lint-migrations.sh"
TMPDIR="$(mktemp -d)"

# Cleanup temp files on exit
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

PASS=0
FAIL=0

# Helper: run lint script on a given file, expect exit code
assert_exit() {
  local desc="$1"
  local expected_exit="$2"
  local file="$3"
  local actual_exit=0

  bash "$LINT_SCRIPT" "$file" > /dev/null 2>&1 || actual_exit=$?

  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

# Helper: run lint script and check output contains a pattern
assert_output_contains() {
  local desc="$1"
  local pattern="$2"
  local file="$3"
  local output

  output=$(bash "$LINT_SCRIPT" "$file" 2>&1 || true)

  if echo "$output" | grep -qiE "$pattern"; then
    echo "PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc (output did not contain '$pattern')"
    echo "  Output was: $output"
    FAIL=$((FAIL + 1))
  fi
}

# ─────────────────────────────────────────────
# Safe operations — must exit 0
# ─────────────────────────────────────────────

cat > "$TMPDIR/safe_add_column.up.sql" <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
SQL
assert_exit "ADD COLUMN is safe" 0 "$TMPDIR/safe_add_column.up.sql"

cat > "$TMPDIR/safe_create_table.up.sql" <<'SQL'
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL
assert_exit "CREATE TABLE is safe" 0 "$TMPDIR/safe_create_table.up.sql"

cat > "$TMPDIR/safe_create_index.up.sql" <<'SQL'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
SQL
assert_exit "CREATE INDEX is safe" 0 "$TMPDIR/safe_create_index.up.sql"

cat > "$TMPDIR/safe_add_constraint.up.sql" <<'SQL'
ALTER TABLE sections ADD CONSTRAINT fk_sections_course
  FOREIGN KEY (course_id) REFERENCES courses(id);
SQL
assert_exit "ADD CONSTRAINT is safe" 0 "$TMPDIR/safe_add_constraint.up.sql"

cat > "$TMPDIR/safe_empty.up.sql" <<'SQL'
-- This migration intentionally left blank
SQL
assert_exit "Empty/comment migration is safe" 0 "$TMPDIR/safe_empty.up.sql"

# ─────────────────────────────────────────────
# Unsafe operations — must exit non-zero
# ─────────────────────────────────────────────

cat > "$TMPDIR/unsafe_drop_column.up.sql" <<'SQL'
ALTER TABLE users DROP COLUMN bio;
SQL
assert_exit "DROP COLUMN is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_drop_column.up.sql"
assert_output_contains "DROP COLUMN detected in output" "DROP COLUMN" "$TMPDIR/unsafe_drop_column.up.sql"

cat > "$TMPDIR/unsafe_rename_column.up.sql" <<'SQL'
ALTER TABLE users RENAME COLUMN bio TO biography;
SQL
assert_exit "RENAME COLUMN is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_rename_column.up.sql"
assert_output_contains "RENAME COLUMN detected in output" "RENAME COLUMN" "$TMPDIR/unsafe_rename_column.up.sql"

cat > "$TMPDIR/unsafe_rename_table.up.sql" <<'SQL'
ALTER TABLE users RENAME TO app_users;
SQL
assert_exit "RENAME TABLE is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_rename_table.up.sql"
assert_output_contains "RENAME TABLE detected in output" "RENAME" "$TMPDIR/unsafe_rename_table.up.sql"

cat > "$TMPDIR/unsafe_alter_column_type.up.sql" <<'SQL'
ALTER TABLE users ALTER COLUMN age TYPE BIGINT;
SQL
assert_exit "ALTER COLUMN TYPE is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_alter_column_type.up.sql"
assert_output_contains "ALTER COLUMN TYPE detected in output" "ALTER COLUMN" "$TMPDIR/unsafe_alter_column_type.up.sql"

cat > "$TMPDIR/unsafe_update_backfill.up.sql" <<'SQL'
UPDATE users SET display_name = email WHERE display_name IS NULL;
SQL
assert_exit "UPDATE SET backfill is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_update_backfill.up.sql"
assert_output_contains "UPDATE SET detected in output" "UPDATE" "$TMPDIR/unsafe_update_backfill.up.sql"

cat > "$TMPDIR/unsafe_insert_select.up.sql" <<'SQL'
INSERT INTO audit_logs (user_id, action)
SELECT id, 'migrated' FROM users;
SQL
assert_exit "INSERT INTO ... SELECT is unsafe (exits non-zero)" 1 "$TMPDIR/unsafe_insert_select.up.sql"
assert_output_contains "INSERT SELECT detected in output" "INSERT" "$TMPDIR/unsafe_insert_select.up.sql"

# ─────────────────────────────────────────────
# Case insensitivity
# ─────────────────────────────────────────────

cat > "$TMPDIR/unsafe_lowercase_drop.up.sql" <<'SQL'
alter table users drop column bio;
SQL
assert_exit "lowercase drop column is unsafe" 1 "$TMPDIR/unsafe_lowercase_drop.up.sql"

cat > "$TMPDIR/unsafe_mixed_case_rename.up.sql" <<'SQL'
Alter Table users Rename Column foo To bar;
SQL
assert_exit "Mixed case RENAME COLUMN is unsafe" 1 "$TMPDIR/unsafe_mixed_case_rename.up.sql"

# ─────────────────────────────────────────────
# Multiple unsafe operations — all detected
# ─────────────────────────────────────────────

cat > "$TMPDIR/unsafe_multiple.up.sql" <<'SQL'
ALTER TABLE users DROP COLUMN bio;
ALTER TABLE users RENAME COLUMN name TO full_name;
SQL
assert_exit "Multiple unsafe operations exits non-zero" 1 "$TMPDIR/unsafe_multiple.up.sql"
assert_output_contains "Multiple unsafe: DROP COLUMN detected" "DROP COLUMN" "$TMPDIR/unsafe_multiple.up.sql"
assert_output_contains "Multiple unsafe: RENAME COLUMN detected" "RENAME COLUMN" "$TMPDIR/unsafe_multiple.up.sql"

# ─────────────────────────────────────────────
# No arguments — should scan all migrations/*.up.sql (repo root)
# ─────────────────────────────────────────────
# NOTE: Some existing migrations pre-date this safeguard and contain genuinely unsafe
# operations (DROP COLUMN, RENAME COLUMN, data backfills). They are grandfathered in
# because CI only lints files changed in the current PR (via git diff), not all migrations.
# The no-args mode is for local inspection only. We verify the script runs without errors
# (not that it passes, since old migrations contain unsafe operations).
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
existing_output=$(bash "$LINT_SCRIPT" 2>&1 || true)
if echo "$existing_output" | grep -qE "^(Migration lint passed|UNSAFE|Found [0-9]+)"; then
  echo "PASS: No-args mode runs without crash and produces expected output"
  PASS=$((PASS + 1))
else
  echo "FAIL: No-args mode produced unexpected output"
  echo "  Output: $existing_output"
  FAIL=$((FAIL + 1))
fi

# Verify that a safe-only directory passes
SAFE_DIR="$TMPDIR/safe_migrations"
mkdir -p "$SAFE_DIR"
cat > "$SAFE_DIR/018_add_column.up.sql" <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
CREATE INDEX IF NOT EXISTS idx_users_avatar ON users(avatar_url) WHERE avatar_url IS NOT NULL;
SQL
safe_exit=0
bash "$LINT_SCRIPT" "$SAFE_DIR/018_add_column.up.sql" > /dev/null 2>&1 || safe_exit=$?
if [ "$safe_exit" -eq 0 ]; then
  echo "PASS: Safe-only migration file passes in no-args-style mode"
  PASS=$((PASS + 1))
else
  echo "FAIL: Safe-only migration file falsely flagged"
  bash "$LINT_SCRIPT" "$SAFE_DIR/018_add_column.up.sql" 2>&1
  FAIL=$((FAIL + 1))
fi

# ─────────────────────────────────────────────
# Results
# ─────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
