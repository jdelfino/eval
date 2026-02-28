import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, publishProblem } from './fixtures/api-setup';

/**
 * Preview Mode E2E Tests
 *
 * Verifies the instructor "Preview as Student" flow end-to-end:
 * 1. Instructor sees their section with the "Preview as Student" button
 * 2. Clicking it renders the student view with the amber preview banner
 * 3. Clicking "Exit Preview" in the banner returns the instructor view
 */

test.describe('Instructor Preview as Student Mode', () => {
  test('instructor can enter and exit preview mode', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Preview Test Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Preview Test Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Preview Problem ${testNamespace}`,
      description: 'A problem for preview mode testing',
      starterCode: '# Write your solution\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);

    // ===== SIGN IN AS INSTRUCTOR =====
    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    // Wait for the section page to finish loading
    // The instructor view is loaded when the "Preview as Student" button is visible
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

    // ===== VERIFY INSTRUCTOR VIEW =====
    // Instructor view shows the section name and instructor-only tabs
    await expect(page.locator('h1').filter({ hasText: `Preview Test Section ${testNamespace}` })).toBeVisible();

    // Instructor view has a "Students" tab (not shown in student view)
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).toBeVisible();

    // ===== ENTER PREVIEW MODE =====
    await page.locator('button:has-text("Preview as Student")').click();

    // Wait for the preview banner to appear (client-side re-render, no navigation)
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).toBeVisible({ timeout: 10000 });

    // ===== VERIFY STUDENT VIEW =====
    // Published problem title should be visible in the student view
    await expect(
      page.locator(`text=Preview Problem ${testNamespace}`)
    ).toBeVisible({ timeout: 10000 });

    // The "Students" tab should NOT be visible in the student view
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).not.toBeVisible();

    // The "Preview as Student" button should also NOT be visible in the student view
    await expect(page.locator('button:has-text("Preview as Student")')).not.toBeVisible();

    // ===== EXIT PREVIEW MODE =====
    await page.locator('button:has-text("Exit Preview")').click();

    // Wait for the instructor view to return
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 10000 });

    // ===== VERIFY INSTRUCTOR VIEW IS RESTORED =====
    // The preview banner should no longer be visible
    await expect(
      page.locator('text=You are previewing this section as a student')
    ).not.toBeVisible();

    // Instructor-only tabs should be visible again
    await expect(page.locator('[role="tab"]:has-text("Students"), button:has-text("Students")')).toBeVisible();
  });
});
