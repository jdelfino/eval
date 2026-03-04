/**
 * Resolves the Playwright baseURL from the BASE_URL environment variable,
 * falling back to localhost for local development.
 *
 * Used by playwright.config.ts and testable in isolation.
 */
export function getPlaywrightBaseUrl(): string {
  return process.env.BASE_URL || 'http://localhost:3000';
}
