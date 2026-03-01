import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, publishProblem } from './fixtures/api-setup';

/**
 * Preview Mode E2E Tests
 *
 * Verifies the instructor "Preview as Student" flow end-to-end,
 * including navigation to the student workspace, code execution,
 * breadcrumb navigation back, and page reload persistence.
 *
 * Two tests in one describe block:
 * 1. Main flow: enter preview → workspace → run code → breadcrumb back → exit preview
 * 2. Reload persistence: enter preview → reload → verify state preserved → exit preview
 */

test.describe('Instructor Preview as Student Mode', () => {
  test('full preview workflow: workspace navigation, code execution, breadcrumb back, exit', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Preview Test Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Preview Test Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Preview Problem ${testNamespace}`,
      description: 'A problem for preview mode testing',
      starterCode: 'print("hello from preview")\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);

    // ===== PHASE 1: SIGN IN AND VERIFY INSTRUCTOR VIEW =====
    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    // Wait for the section page to finish loading — instructor view shows "Preview as Student"
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

    // Instructor view shows the section name and instructor-only tabs
    await expect(page.locator('h1').filter({ hasText: `Preview Test Section ${testNamespace}` })).toBeVisible();

    // Instructor view has a "Students" tab (not shown in student view)
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).toBeVisible();

    // ===== PHASE 2: ENTER PREVIEW MODE =====
    await page.locator('button:has-text("Preview as Student")').click();

    // Wait for the preview banner to appear (client-side re-render, no navigation)
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 10000 });

    // Student view renders the published problem with "Practice" button
    await expect(
      page.locator(`text=Preview Problem ${testNamespace}`)
    ).toBeVisible({ timeout: 10000 });

    // "Practice" button is visible for the problem
    await expect(page.locator('button:has-text("Practice")')).toBeVisible({ timeout: 10000 });

    // The "Students" tab should NOT be visible in the student view
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).not.toBeVisible();

    // The "Preview as Student" button should also NOT be visible in the student view
    await expect(page.locator('button:has-text("Preview as Student")')).not.toBeVisible();

    // ===== PHASE 3: NAVIGATE TO STUDENT WORKSPACE =====
    // Click "Practice" on the published problem to open the student workspace
    await page.locator('button:has-text("Practice")').click();

    // Wait for the student workspace to load (Monaco editor visible)
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

    // The preview banner should be visible in the fullscreen layout too
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 10000 });

    // The "Run Code" button should be present
    await expect(page.locator('button:has-text("Run Code"), button:has-text("▶ Run Code")')).toBeVisible({ timeout: 10000 });

    // ===== PHASE 4: EXECUTE CODE =====
    // Student work starts with empty code. Load the starter code via the
    // "Restore Starter Code" button (avoids flaky Monaco keyboard interaction).
    const restoreButton = page.locator('button:has-text("Restore Starter Code")');
    await expect(restoreButton).toBeVisible({ timeout: 10000 });
    await restoreButton.click();

    // Verify Monaco has the starter code (matches session-lifecycle poll pattern)
    await expect.poll(async () => {
      return page.evaluate(() => {
        const editor = document.querySelector('.monaco-editor');
        return editor?.textContent?.replace(/\s/g, '') || '';
      });
    }, { timeout: 5000, message: 'Monaco should contain starter code after restore' }).toContain('hello');

    // Wait for debounced auto-save before executing
    await page.waitForTimeout(1000);

    // Click "Run Code" button
    await page.locator('button:has-text("Run Code"), button:has-text("▶ Run Code")').click();

    // Wait for successful execution result — matches session-lifecycle pattern
    const outputArea = page.locator('[data-testid="output-area"]');
    await expect(outputArea.locator('text=✓ Success')).toBeVisible({ timeout: 15000 });
    await expect(outputArea.locator('text=hello from preview')).toBeVisible();

    // ===== PHASE 5: NAVIGATE BACK VIA BREADCRUMB =====
    // The breadcrumb in the student workspace contains the section name as a link
    const sectionName = `Preview Test Section ${testNamespace}`;
    const breadcrumbLink = page.locator(`a:has-text("${sectionName}")`);
    await expect(breadcrumbLink).toBeVisible({ timeout: 10000 });
    await breadcrumbLink.click();

    // Wait for navigation back to the section page
    await page.waitForURL(`/sections/${section.id}`, { timeout: 15000 });

    // Verify we're back on the section page — not a permission error
    // Student view shows the problem list and section heading
    await expect(
      page.locator('h1').filter({ hasText: sectionName })
    ).toBeVisible({ timeout: 10000 });

    // The published problem should be visible in the student view
    await expect(
      page.locator(`text=Preview Problem ${testNamespace}`)
    ).toBeVisible({ timeout: 10000 });

    // Preview banner should still be visible after navigating back
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 10000 });

    // ===== PHASE 6: EXIT PREVIEW =====
    await page.locator('button:has-text("Exit Preview")').click();

    // Wait for the instructor view to return
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 10000 });

    // Verify instructor view is fully restored
    // The preview banner should no longer be visible
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).not.toBeVisible();

    // Instructor-only tabs should be visible again
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).toBeVisible();
  });

  test('preview state persists across page reload', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Preview Reload Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Preview Reload Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Preview Reload Problem ${testNamespace}`,
      description: 'A problem for reload persistence testing',
      starterCode: '# Write your solution\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);

    // ===== SIGN IN AND NAVIGATE TO SECTION =====
    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    // Wait for instructor view to load
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

    // ===== ENTER PREVIEW MODE =====
    await page.locator('button:has-text("Preview as Student")').click();

    // Verify preview mode is active before reload
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 10000 });

    // Student view should show the published problem
    await expect(
      page.locator(`text=Preview Reload Problem ${testNamespace}`)
    ).toBeVisible({ timeout: 10000 });

    // ===== RELOAD THE PAGE =====
    await page.reload();

    // Wait for the page to finish loading after reload
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // ===== VERIFY PREVIEW STATE IS PRESERVED AFTER RELOAD =====
    // The preview banner should still be visible
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 15000 });

    // The student view should still be shown (problem visible)
    await expect(
      page.locator(`text=Preview Reload Problem ${testNamespace}`)
    ).toBeVisible({ timeout: 10000 });

    // Instructor-only elements should still be hidden
    await expect(page.locator('button:has-text("Preview as Student")')).not.toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).not.toBeVisible();

    // ===== EXIT PREVIEW AFTER RELOAD =====
    await page.locator('button:has-text("Exit Preview")').click();

    // Instructor view should be restored
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 10000 });

    // Preview banner should be gone
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).not.toBeVisible();

    // Instructor-only tabs should be visible again
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).toBeVisible();
  });
});
