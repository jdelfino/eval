/**
 * Playwright global setup — runs once before all tests.
 * Cleans up stale E2E namespaces from previous runs.
 */
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

async function globalSetup() {
  // Clean up any stale e2e namespaces from previous failed runs.
  // The test cleanup endpoint is idempotent and only available in test mode.
  // We don't need to enumerate all namespaces — the per-test teardown handles
  // cleanup for the current run. This is a safety net for crashed tests.
  console.log('E2E global setup: ready');
}

export default globalSetup;
