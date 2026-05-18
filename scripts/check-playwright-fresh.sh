#!/usr/bin/env bash
# Pre-push gate: block pushes when Playwright e2e specs have changed but
# frontend/test-results/.last-run.json is missing, has non-"passed" status,
# or is older than any changed spec.
#
# Determines the diff range without using lefthook's {push_files} (which falls
# back to diff-against-default-remote-branch for new-branch pushes, yielding
# false positives for branches off non-default remotes like `redesign`).
#
# Base discovery, in order:
#   1. `@{push}` if the branch has push tracking configured
#   2. `@{u}` if upstream tracking is configured
#   3. Closest-ancestor: enumerate refs/remotes/origin/* and pick the merge-base
#      with the fewest commits between it and HEAD — i.e. the remote ref the
#      branch was actually based on (origin/main, origin/redesign, etc.)
#
# If no remote refs exist (e.g. offline first-ever clone), skip the check.
set -euo pipefail

LAST_RUN="frontend/test-results/.last-run.json"

# ── 1. Determine the diff base ───────────────────────────────────────────────

base=""

# Try push tracking first (rare on new branches, but explicit when set).
if base_try=$(git rev-parse --verify --quiet '@{push}' 2>/dev/null); then
  base=$(git merge-base HEAD "$base_try" 2>/dev/null || true)
fi

# Fall back to upstream tracking.
if [ -z "$base" ]; then
  if base_try=$(git rev-parse --verify --quiet '@{u}' 2>/dev/null); then
    base=$(git merge-base HEAD "$base_try" 2>/dev/null || true)
  fi
fi

# Final fallback: pick the remote ref with the closest common ancestor.
if [ -z "$base" ]; then
  best_base=""
  best_dist=""
  while IFS= read -r ref; do
    [ "$ref" = "refs/remotes/origin/HEAD" ] && continue
    candidate=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
    dist=$(git rev-list --count "${candidate}..HEAD" 2>/dev/null) || continue
    if [ -z "$best_base" ] || [ "$dist" -lt "$best_dist" ]; then
      best_base="$candidate"
      best_dist="$dist"
    fi
  done < <(git for-each-ref --format='%(refname)' refs/remotes/origin/ 2>/dev/null)
  base="$best_base"
fi

# No base discoverable (no remote refs at all) — skip the check.
if [ -z "$base" ]; then
  exit 0
fi

# ── 2. Collect changed e2e spec files in this branch ─────────────────────────

mapfile -t spec_files < <(
  git diff --name-only "${base}..HEAD" -- 'frontend/e2e/*.spec.ts' 2>/dev/null || true
)

# If no spec files changed, nothing to check.
if [ "${#spec_files[@]}" -eq 0 ]; then
  exit 0
fi

# ── 3. Require .last-run.json to exist ───────────────────────────────────────

if [ ! -f "$LAST_RUN" ]; then
  echo "ERROR: Playwright specs changed but no test results found." >&2
  echo "       Run 'make test-e2e' before pushing." >&2
  echo "       Missing: $LAST_RUN" >&2
  exit 1
fi

# ── 4. Parse status field ────────────────────────────────────────────────────

if command -v jq >/dev/null 2>&1; then
  status=$(jq -r '.status // empty' "$LAST_RUN")
else
  # Portable fallback: extract "status":"<value>" from JSON.
  # `|| true` keeps an absent status field from killing the script silently
  # under `set -euo pipefail` — we want the empty-string branch below to handle it.
  status=$(grep -o '"status":"[^"]*"' "$LAST_RUN" | sed 's/"status":"//;s/"//' || true)
fi

if [ -z "$status" ]; then
  echo "ERROR: Playwright last run status is missing or unreadable in $LAST_RUN." >&2
  echo "       Run 'make test-e2e' and ensure all specs pass before pushing." >&2
  exit 1
fi

if [ "$status" != "passed" ]; then
  echo "ERROR: Playwright last run status is '$status' (expected 'passed')." >&2
  echo "       Run 'make test-e2e' and ensure all specs pass before pushing." >&2
  exit 1
fi

# ── 5. Check freshness: no spec may be newer than .last-run.json ─────────────

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

# ── 6. All checks passed ─────────────────────────────────────────────────────

exit 0
