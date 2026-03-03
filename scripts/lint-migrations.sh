#!/usr/bin/env bash
# lint-migrations.sh — scan migration .up.sql files for unsafe blue-green deploy operations
#
# Usage:
#   ./scripts/lint-migrations.sh [file1.up.sql file2.up.sql ...]
#   (no args) → scans all migrations/*.up.sql
#
# Exits non-zero if any unsafe operations are found.
# To override in CI, add the 'migration-override' label to the PR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Collect files to check
if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # Default: scan all migration up files
  mapfile -t FILES < <(ls "$REPO_ROOT/migrations/"*.up.sql 2>/dev/null || true)
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No migration files to check"
  exit 0
fi

# ─────────────────────────────────────────────
# strip_function_bodies FILE
#   Prints the file contents with lines inside $$ ... $$ function bodies replaced
#   by blank lines. This prevents false positives for SQL inside function bodies.
# ─────────────────────────────────────────────
strip_function_bodies() {
  python3 - "$1" <<'PYEOF'
import sys
import re

with open(sys.argv[1]) as f:
    lines = f.readlines()

inside = False
for i, line in enumerate(lines, 1):
    # Count $$ delimiters (not $n$ style) on this line
    # Use simple heuristic: $$ that are not part of $identifier$ patterns
    plain_dollar = len(re.findall(r'(?<!\w)\$\$(?!\w)', line))
    if plain_dollar % 2 == 1:
        # Odd number of $$ on this line — toggle state
        # If we're entering a body, print the line (it has the function signature)
        # If we're exiting, print the line (it has LANGUAGE etc.)
        print(f"{i}:{line}", end="")
        inside = not inside
    elif not inside:
        print(f"{i}:{line}", end="")
    else:
        # Inside function body — suppress
        print(f"{i}:")
PYEOF
}

# ─────────────────────────────────────────────
# check_pattern STRIPPED_OUTPUT LABEL REGEX REASON FILE
# ─────────────────────────────────────────────
FOUND=0

check_pattern() {
  local stripped="$1"
  local label="$2"
  local regex="$3"
  local reason="$4"
  local file="$5"

  while IFS= read -r match; do
    lineno=$(echo "$match" | cut -d: -f1)
    echo "UNSAFE: $file:$lineno: $label"
    echo "  → $reason"
    echo "  → To override, add the 'migration-override' label to the PR."
    FOUND=$((FOUND + 1))
  done < <(echo "$stripped" | grep -inE "$regex" | head -20 || true)
}

for FILE in "${FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    echo "WARNING: File not found: $FILE" >&2
    continue
  fi

  # Strip function body content to avoid false positives
  STRIPPED=$(strip_function_bodies "$FILE")

  # DROP COLUMN
  check_pattern "$STRIPPED" \
    "DROP COLUMN" \
    "DROP[[:space:]]+COLUMN" \
    "DROP COLUMN breaks old code that references the column." \
    "$FILE"

  # RENAME COLUMN
  check_pattern "$STRIPPED" \
    "RENAME COLUMN" \
    "RENAME[[:space:]]+COLUMN" \
    "RENAME COLUMN breaks old code that references the column." \
    "$FILE"

  # RENAME TABLE — RENAME TO (but not RENAME COLUMN ... TO)
  check_pattern "$STRIPPED" \
    "RENAME TABLE" \
    "RENAME[[:space:]]+TO[[:space:]]" \
    "RENAME TABLE breaks old code that references the old table name." \
    "$FILE"

  # ALTER COLUMN TYPE — matches: ALTER COLUMN <name> TYPE ...
  check_pattern "$STRIPPED" \
    "ALTER COLUMN TYPE" \
    "ALTER[[:space:]]+COLUMN[[:space:]]+[[:alnum:]_]+[[:space:]]+TYPE[[:space:]]" \
    "Changing a column type may break existing queries or application code." \
    "$FILE"

  # UPDATE SET data backfill — standalone UPDATE statement (not inside function body)
  check_pattern "$STRIPPED" \
    "UPDATE SET (data backfill)" \
    "^[0-9]+:UPDATE[[:space:]]+[[:alnum:]_]" \
    "Data backfills (UPDATE ... SET) should run post-promotion, not in migrations." \
    "$FILE"

  # INSERT INTO ... SELECT — data backfill
  check_pattern "$STRIPPED" \
    "INSERT INTO ... SELECT (data backfill)" \
    "^[0-9]+:INSERT[[:space:]]+INTO[[:space:]]+[[:alnum:]_]" \
    "Data backfills (INSERT INTO ... SELECT) should run post-promotion, not in migrations." \
    "$FILE"
done

if [ "$FOUND" -gt 0 ]; then
  echo ""
  echo "Found $FOUND unsafe operation(s) in migration files."
  echo "These operations are unsafe during blue-green deployments."
  echo "Fix the migration or add the 'migration-override' label to the PR."
  exit 1
fi

echo "Migration lint passed: no unsafe operations found."
exit 0
