# In-cluster test runner for staging deploy validation.
# Built every deploy — just COPYs test files onto the cached base image.
#
# Usage:
#   docker build --build-arg REGISTRY=<registry> -f docker/test-runner/Dockerfile .

ARG REGISTRY
FROM ${REGISTRY}/test-runner-base:latest

WORKDIR /app

# Copy test configuration
COPY frontend/playwright.config.ts ./
COPY frontend/playwright-base-url.ts ./
COPY frontend/tsconfig.json ./
COPY frontend/jest.config.js ./

# Copy test files
COPY frontend/e2e/ ./e2e/

# Copy source files needed by contract tests (type imports, etc.)
COPY frontend/src/types/ ./src/types/
COPY frontend/src/lib/ ./src/lib/
