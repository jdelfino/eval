#!/usr/bin/env bash
set -euo pipefail

# Build and push the custom E2E test container to ghcr.io.
#
# Usage:
#   ./scripts/build-e2e-container.sh          # build + push
#   ./scripts/build-e2e-container.sh --dry-run # build only
#
# Prerequisites:
#   docker login ghcr.io -u <github-user> -p <PAT>
#
# Rebuild when:
#   - Playwright version changes in frontend/package.json
#   - Dockerfile or docker-wrapper.sh changes

REPO="ghcr.io/jdelfino/eval-e2e"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONTEXT_DIR="$ROOT_DIR/.github/e2e-container"

# Extract Playwright version from package.json
PW_VERSION=$(node -e "
  const pkg = require('$ROOT_DIR/frontend/package.json');
  // Strip ^ or ~ prefix
  console.log(pkg.devDependencies['@playwright/test'].replace(/^[\^~]/, ''));
")
echo "Playwright version: $PW_VERSION"

TAG="v${PW_VERSION}"
IMAGE="${REPO}:${TAG}"
LATEST="${REPO}:latest"

echo "Building ${IMAGE}..."
docker build \
  --build-arg "PLAYWRIGHT_VERSION=v${PW_VERSION}" \
  -t "$IMAGE" \
  -t "$LATEST" \
  "$CONTEXT_DIR"

if [ "${1:-}" = "--dry-run" ]; then
  echo "Dry run — skipping push"
  exit 0
fi

echo "Pushing ${IMAGE}..."
docker push "$IMAGE"
docker push "$LATEST"

echo "Done. Update e2e-tests.yml container image to: ${IMAGE}"
