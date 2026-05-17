#!/usr/bin/env bash
# Pre-push gate: block pushes when Playwright e2e specs have changed but
# frontend/test-results/.last-run.json is missing, has non-"passed" status,
# or is older than any changed spec.
#
# Receives changed pushed files as positional args (lefthook {push_files}).
# Filters internally to only frontend/e2e/*.spec.ts paths for defensive
# correctness in case paths from other globs arrive.
set -euo pipefail

LAST_RUN="frontend/test-results/.last-run.json"

# ── 1. Filter to e2e spec files ──────────────────────────────────────────────

spec_files=()
for f in "$@"; do
  case "$f" in
    frontend/e2e/*.spec.ts) spec_files+=("$f") ;;
  esac
done

# If no spec files remain after filtering, nothing to check.
if [ "${#spec_files[@]}" -eq 0 ]; then
  exit 0
fi

# ── 2. Require .last-run.json to exist ───────────────────────────────────────

if [ ! -f "$LAST_RUN" ]; then
  echo "ERROR: Playwright specs changed but no test results found." >&2
  echo "       Run 'make test-e2e' before pushing." >&2
  echo "       Missing: $LAST_RUN" >&2
  exit 1
fi

# ── 3. Parse status field ────────────────────────────────────────────────────

if command -v jq >/dev/null 2>&1; then
  status=$(jq -r '.status // empty' "$LAST_RUN")
else
  # Portable fallback: extract "status":"<value>" from JSON
  status=$(grep -o '"status":"[^"]*"' "$LAST_RUN" | sed 's/"status":"//;s/"//')
fi

if [ "$status" != "passed" ]; then
  echo "ERROR: Playwright last run status is '$status' (expected 'passed')." >&2
  echo "       Run 'make test-e2e' and ensure all specs pass before pushing." >&2
  exit 1
fi

# ── 4. Check freshness: no spec may be newer than .last-run.json ─────────────

json_mtime=$(stat -c '%Y' "$LAST_RUN" 2>/dev/null \
  || stat -f '%m' "$LAST_RUN" 2>/dev/null)

stale_specs=()
for spec in "${spec_files[@]}"; do
  if [ ! -f "$spec" ]; then
    # Spec was deleted — no freshness concern.
    continue
  fi
  spec_mtime=$(stat -c '%Y' "$spec" 2>/dev/null \
    || stat -f '%m' "$spec" 2>/dev/null)
  if [ "$spec_mtime" -gt "$json_mtime" ]; then
    stale_specs+=("$spec")
  fi
done

if [ "${#stale_specs[@]}" -gt 0 ]; then
  echo "ERROR: The following Playwright spec(s) are newer than the last test run:" >&2
  for spec in "${stale_specs[@]}"; do
    echo "       $spec" >&2
  done
  echo "       Run 'make test-e2e' after your latest edits before pushing." >&2
  exit 1
fi

# ── 5. All checks passed ─────────────────────────────────────────────────────

exit 0
