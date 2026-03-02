import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  registerStudent,
  testToken,
} from './fixtures/api-setup';
import { waitForMonacoReady, getMonacoValue } from './fixtures/monaco';

/**
 * Problem Publishing + Student Practice E2E Tests
 *
 * Verifies the problem publishing flow and the student practice workflow
 * end-to-end. Publishing is the bridge between instructor content creation
 * and student access. Student practice (non-session coding + code execution)
 * is a primary workflow with zero prior E2E coverage.
 *
 * Test: "Instructor publishes problem, student practices and runs code"
 * 1. Create class, section, problem via API; register student via API
 * 2. Publish problem to section via API (with show_solution=true)
 * 3. Instructor navigates to section detail → verifies problem appears in Problems tab
 * 4. Student signs in, navigates to section → sees problem → clicks "Practice"
 * 5. Student workspace loads with starter code
 * 6. Student runs code → verifies execution output
 * 7. Student views solution (when enabled)
 */

test.describe('Problem Publishing + Student Practice', () => {
  test('Instructor publishes problem, student practices and runs code', async ({
    page,
    browser,
    testNamespace,
    setupInstructor,
    logCollector,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const studentExternalId = `student-${testNamespace}`;
    const studentEmail = `${studentExternalId}@test.local`;

    // Create class, section, and problem via API
    const cls = await createClass(instructor.token, `Publishing Test Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Publishing Test Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Publishing Test Problem ${testNamespace}`,
      description: 'A problem for publishing and practice testing',
      starterCode: 'print("hello from practice")\n',
    });

    // Register student via API
    await registerStudent(section.join_code, studentExternalId, studentEmail, 'E2E Student');

    // Publish problem to section via API with show_solution enabled
    await publishProblem(instructor.token, section.id, problem.id, true);

    // ===== PHASE 1: INSTRUCTOR VERIFIES SECTION SHOWS PROBLEM =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto(`/sections/${section.id}`);

      // Wait for instructor section view to load
      await expect(instructorPage.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

      // Verify section name is shown
      await expect(
        instructorPage.locator('h1').filter({ hasText: `Publishing Test Section ${testNamespace}` })
      ).toBeVisible();

      // Click the "Problems" tab to see published problems
      await instructorPage.locator('[role="tab"]:has-text("Problems")').click();

      // Verify the published problem appears in the Problems tab
      await expect(
        instructorPage.locator(`text=Publishing Test Problem ${testNamespace}`)
      ).toBeVisible({ timeout: 10000 });

      // Instructor view shows "Create Session" button for the published problem
      await expect(instructorPage.locator('button:has-text("Create Session")')).toBeVisible();

      // ===== PHASE 2: STUDENT SIGNS IN AND NAVIGATES TO SECTION =====
      await signInAs(page, studentEmail);
      await page.goto(`/sections/${section.id}`);

      // Student sees the section name
      await expect(
        page.locator('h1').filter({ hasText: `Publishing Test Section ${testNamespace}` })
      ).toBeVisible({ timeout: 15000 });

      // Student sees the published problem in the problems list
      await expect(
        page.locator(`text=Publishing Test Problem ${testNamespace}`)
      ).toBeVisible({ timeout: 10000 });

      // ===== PHASE 3: STUDENT OPENS PRACTICE WORKSPACE =====
      // Click "Practice" on the published problem (no prior work = "Practice" label)
      await page.locator('button:has-text("Practice")').click();

      // Wait for the student workspace to load (Monaco editor visible)
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

      // The "Run Code" button should be present in the workspace
      await expect(
        page.locator('button:has-text("Run Code"), button:has-text("▶ Run Code")')
      ).toBeVisible({ timeout: 10000 });

      // ===== PHASE 4: STUDENT RESTORES STARTER CODE AND RUNS IT =====
      // Load the starter code via the "Restore Starter Code" button to avoid
      // relying on starter code being pre-loaded (fresh work starts empty)
      const restoreButton = page.locator('button:has-text("Restore Starter Code")');
      await expect(restoreButton).toBeVisible({ timeout: 10000 });
      await restoreButton.click();

      // Verify Monaco has the starter code via the Monaco API
      await waitForMonacoReady(page);
      await expect.poll(() => getMonacoValue(page), {
        timeout: 5000,
        message: 'Monaco should contain starter code after restore',
      }).toContain('hello from practice');

      // Wait for debounced auto-save before executing
      await page.waitForTimeout(1000);

      // Click "Run Code"
      await page.locator('button:has-text("Run Code"), button:has-text("▶ Run Code")').click();

      // Wait for successful execution result
      const outputArea = page.locator('[data-testid="output-area"]');
      await expect(outputArea.locator('text=✓ Success')).toBeVisible({ timeout: 15000 });
      await expect(outputArea.locator('text=hello from practice')).toBeVisible();

      // ===== PHASE 5: STUDENT VIEWS SOLUTION (show_solution=true) =====
      // Navigate back to section page to verify "View Solution" button is shown
      // since show_solution was enabled when publishing
      await page.goto(`/sections/${section.id}`);

      // Wait for the section page to reload and show the problem
      await expect(
        page.locator(`text=Publishing Test Problem ${testNamespace}`)
      ).toBeVisible({ timeout: 10000 });

      // "Continue" button should now appear (student has prior work)
      await expect(page.locator('button:has-text("Continue")')).toBeVisible({ timeout: 10000 });

      // "View Solution" button should be visible because show_solution=true
      await expect(page.locator('button:has-text("View Solution")')).toBeVisible({ timeout: 10000 });

    } finally {
      await instructorContext.close();
    }
  });
});
