#!/usr/bin/env bash
# Structural tests for e2e-tests.yml.
# Verifies that the Playwright container image is used and the old
# browser-download / setup-node / cache steps are removed.
#
# Exit 0 = all assertions pass
# Exit 1 = one or more assertions failed

set -euo pipefail

WORKFLOW_FILE="$(dirname "$0")/../e2e-tests.yml"
FAIL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

# --- Required: container image is set to the Playwright image ---
if grep -q 'mcr.microsoft.com/playwright:v1.57.0-noble' "$WORKFLOW_FILE"; then
  pass "container image uses mcr.microsoft.com/playwright:v1.57.0-noble"
else
  fail "container image NOT set to mcr.microsoft.com/playwright:v1.57.0-noble"
fi

# --- Required: container options include --privileged (in the container: block) ---
# The container: block must have options: --privileged for Docker-in-Docker (executor)
if grep -A5 '^    container:' "$WORKFLOW_FILE" | grep -q '\-\-privileged'; then
  pass "container: block options include --privileged"
else
  fail "container: block options do NOT include --privileged (needed for executor Docker-in-Docker)"
fi

# --- Removed: actions/setup-node must not be present ---
if grep -q 'actions/setup-node' "$WORKFLOW_FILE"; then
  fail "actions/setup-node@v4 is still present (should be removed — Node is in the Playwright image)"
else
  pass "actions/setup-node is removed"
fi

# --- Removed: Playwright browser cache step must not be present ---
if grep -q 'ms-playwright' "$WORKFLOW_FILE"; then
  fail "Playwright browser cache step (~/.cache/ms-playwright) is still present (should be removed)"
else
  pass "Playwright browser cache step is removed"
fi

# --- Removed: playwright install / install-deps logic must not be present ---
if grep -qE 'playwright install' "$WORKFLOW_FILE"; then
  fail "playwright install command is still present (should be removed — browsers are in the image)"
else
  pass "playwright install commands are removed"
fi

# --- Removed: PLAYWRIGHT_CACHE_HIT env var must not be present ---
if grep -q 'PLAYWRIGHT_CACHE_HIT' "$WORKFLOW_FILE"; then
  fail "PLAYWRIGHT_CACHE_HIT env var is still present (should be removed)"
else
  pass "PLAYWRIGHT_CACHE_HIT env var is removed"
fi

# --- Required: actions/setup-go must still be present ---
if grep -q 'actions/setup-go' "$WORKFLOW_FILE"; then
  pass "actions/setup-go is still present"
else
  fail "actions/setup-go is missing (should be kept)"
fi

# --- Required: npm ci must still be present ---
if grep -q 'npm ci' "$WORKFLOW_FILE"; then
  pass "npm ci is still present"
else
  fail "npm ci is missing"
fi

# --- Required: npm cache via actions/cache (since setup-node is gone) ---
if grep -q '~/.npm' "$WORKFLOW_FILE"; then
  pass "npm cache via actions/cache for ~/.npm is present"
else
  fail "npm cache for ~/.npm is missing (setup-node was handling npm cache)"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All assertions PASSED"
  exit 0
else
  echo "One or more assertions FAILED"
  exit 1
fi
