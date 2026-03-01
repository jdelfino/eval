import { Page, expect } from '@playwright/test';

/**
 * Monaco editor test helpers.
 *
 * These helpers use the __TEST_EDITORS array exposed on window in test builds
 * (NEXT_PUBLIC_AUTH_MODE=test) to interact with Monaco via its JavaScript API
 * instead of keyboard simulation or DOM textContent scraping.
 *
 * This approach is reliable because:
 * - editor.executeEdits() bypasses keyboard event races
 * - editor.getValue() returns the canonical model content, not garbled DOM text
 *
 * See PLAT-dn1q for background on why DOM-based interactions are flaky.
 */

/**
 * Wait until the Monaco editor at the given index is registered on
 * window.__TEST_EDITORS. Polls until the editor instance exists.
 */
export async function waitForMonacoReady(page: Page, index = 0, timeout = 10000): Promise<void> {
  await expect.poll(
    () => page.evaluate((idx) => {
      const editors = (window as any).__TEST_EDITORS;
      return editors && editors.length > idx;
    }, index),
    { timeout, message: `Monaco editor at index ${index} should be ready` }
  ).toBe(true);
}

/**
 * Read the current content of the Monaco editor at the given index
 * using editor.getValue(). Returns an empty string if no editor exists.
 */
export async function getMonacoValue(page: Page, index = 0): Promise<string> {
  return page.evaluate((idx) => {
    const editors = (window as any).__TEST_EDITORS;
    if (!editors?.[idx]) return '';
    return editors[idx].getValue();
  }, index);
}

/**
 * Replace the entire content of the Monaco editor at the given index
 * using editor.executeEdits(). Throws if no editor or model exists.
 *
 * executeEdits() triggers onDidChangeModelContent → onChange → React state
 * → debounced server sync, matching the behavior of real user edits.
 */
export async function setMonacoValue(page: Page, value: string, index = 0): Promise<void> {
  await page.evaluate(({ val, idx }) => {
    const editors = (window as any).__TEST_EDITORS;
    if (!editors?.[idx]) throw new Error(`No Monaco editor at index ${idx}`);
    const editor = editors[idx];
    const model = editor.getModel();
    if (!model) throw new Error('Monaco editor has no model');
    const fullRange = model.getFullModelRange();
    editor.executeEdits('e2e-test', [{ range: fullRange, text: val }]);
  }, { val: value, idx: index });
}
