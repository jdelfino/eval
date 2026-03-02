import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Problem Management E2E Tests
 *
 * Verifies the full problem library CRUD workflow:
 * 1. Instructor creates a problem via the ProblemCreator UI
 * 2. Problem appears in the Problem Library list
 * 3. Instructor edits the problem title
 * 4. Changes persist after saving
 * 5. Instructor deletes the problem
 * 6. Problem is removed from the list
 *
 * Covers PLAT-1nql.1 — zero E2E coverage for problem CRUD today.
 */

test.describe('Problem Management', () => {
  test('Instructor creates, edits, and deletes a problem', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // Create a class via API — problems require a class_id
    await createClass(instructor.token, `Problem CRUD Class ${testNamespace}`);

    // ===== SIGN IN AND NAVIGATE TO PROBLEM LIBRARY =====
    await signInAs(page, instructor.email);
    await page.goto('/instructor/problems');

    // Wait for the Problem Library to load
    await expect(
      page.locator('h2:has-text("Problem Library"), button:has-text("Create Your First Problem")').first()
    ).toBeVisible({ timeout: 15000 });

    // ===== PHASE 1: CREATE A PROBLEM =====
    // Click "Create New Problem" (header button) or "Create Your First Problem" (empty state)
    const createButton = page
      .locator('button:has-text("Create New Problem"), button:has-text("Create Your First Problem")')
      .first();
    await expect(createButton).toBeVisible();
    await createButton.click();

    // ProblemCreator should open in create mode
    await expect(page.locator('h2:has-text("Create New Problem")')).toBeVisible();

    // Select the class we created via API
    const classSelect = page.locator('select#problem-class');
    await expect(classSelect).toBeVisible();
    await classSelect.selectOption({ label: `Problem CRUD Class ${testNamespace}` });

    // Enter tags
    const tagsInput = page.locator('input#problem-tags');
    await tagsInput.fill('e2e,crud');
    await tagsInput.press('Enter');

    // Fill in the problem title via the editable title field in the CodeEditor panel
    const titleInput = page.locator('input#problem-title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(`E2E Problem ${testNamespace}`);

    // Fill in the problem description
    const descriptionInput = page.locator('textarea#problem-description');
    await expect(descriptionInput).toBeVisible();
    await descriptionInput.fill('A problem created by E2E tests');

    // The "Starter Code" tab is active by default — set starter code via Monaco API
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'print("hello e2e")');

    // ===== SUBMIT: CREATE PROBLEM =====
    await page.locator('button:has-text("Create Problem")').click();

    // After creation, ProblemCreator closes and we return to the Problem Library
    await expect(page.locator('h2:has-text("Problem Library")')).toBeVisible({ timeout: 15000 });

    // The new problem should appear in the problem list
    await expect(page.locator(`h3:has-text("E2E Problem ${testNamespace}")`)).toBeVisible({ timeout: 10000 });

    // ===== PHASE 2: EDIT THE PROBLEM =====
    // Locate the Edit button scoped to the card containing the problem title
    const editButton = page
      .locator(`div:has(h3:has-text("E2E Problem ${testNamespace}")) button:has-text("Edit")`)
      .first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    // ProblemCreator should open in edit mode
    await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible();

    // Wait for the problem to load in edit mode
    await expect(page.locator('input#problem-title')).toBeVisible({ timeout: 10000 });

    // Update the title
    const editTitleInput = page.locator('input#problem-title');
    await editTitleInput.clear();
    await editTitleInput.fill(`E2E Problem ${testNamespace} (edited)`);

    // Switch to Solution tab and add solution code
    const solutionTab = page.locator('[role="tab"]:has-text("Solution")');
    await expect(solutionTab).toBeVisible();
    await solutionTab.click();

    // Set solution code via Monaco API (index 0 — only one editor visible at a time)
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'print("solution code")');

    // ===== SUBMIT: UPDATE PROBLEM =====
    await page.locator('button:has-text("Update Problem")').click();

    // After update, return to the Problem Library
    await expect(page.locator('h2:has-text("Problem Library")')).toBeVisible({ timeout: 15000 });

    // The updated title should be visible in the list
    await expect(
      page.locator(`h3:has-text("E2E Problem ${testNamespace} (edited)")`)
    ).toBeVisible({ timeout: 10000 });

    // The old title (without "(edited)") should no longer be visible
    await expect(
      page.locator(`h3:has-text("E2E Problem ${testNamespace}")`)
        .filter({ hasNotText: '(edited)' })
    ).not.toBeVisible();

    // ===== PHASE 3: DELETE THE PROBLEM =====
    // Locate the Delete button scoped to the card containing the updated title
    const deleteButton = page
      .locator(`div:has(h3:has-text("E2E Problem ${testNamespace} (edited)")) button:has-text("Delete")`)
      .first();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm the delete dialog
    const confirmButton = page.locator('[data-confirm-button]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // The problem should be removed from the list
    await expect(
      page.locator(`h3:has-text("E2E Problem ${testNamespace} (edited)")`)
    ).not.toBeVisible({ timeout: 10000 });

    // The library should show the empty state (since this was the only problem)
    await expect(
      page.locator('h3:has-text("No problems yet")')
    ).toBeVisible({ timeout: 10000 });
  });
});
