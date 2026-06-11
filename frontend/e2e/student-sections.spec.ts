import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Student Sections Page E2E Tests
 *
 * Covers the /sections page that students see after enrolling.
 * Specifically verifies the B3 solved-counts feature: after a student has
 * solved a problem in a section, the section card on /sections shows
 * "{n} / {m} solved".
 *
 * This is a B5 gap: the sections page enrichment (solved count) was never
 * exercised by E2E tests. Only a full-stack test can catch regressions in
 * the server-side last_run_all_passed update + the client-side enrichment
 * fetch + the card rendering.
 */

test.describe('Student Sections Page', () => {
  /**
   * Verifies that the /sections page shows the correct solved count after
   * a student has solved a problem in a section.
   *
   * Contract: after a student's "run all" passes (last_run_all_passed=true),
   * the section card on /sections renders "{n} / {m} solved".
   *
   * Why it matters: the B3 solved-count feature relies on the executor setting
   * last_run_all_passed, the API returning it via listSectionProblems, and the
   * client computing solvedCount. Any break in this chain silently shows 0/N.
   * What breaks if violated: students can't see their progress on the sections page.
   */
  test('Student sections page shows solved count after solving a problem', async ({
    page,
    browser,
    testNamespace,
    setupInstructor,
    setupStudent,
    logCollector,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Sections Solved Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Sections Solved Section ${testNamespace}`);

    // Create a problem with no test cases — running any code trivially passes
    // (no test cases → coverage is trivially satisfied → last_run_all_passed=true)
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Sections Solved Problem ${testNamespace}`,
      description: 'A problem for sections solved count testing',
      starterCode: 'print("hello from sections")\n',
    });

    // Publish the problem to the section
    await publishProblem(instructor.token, section.id, problem.id);

    // Register a student
    const student = await setupStudent(section.join_code);

    // ===== STUDENT OPENS THE PRACTICE WORKSPACE AND RUNS CODE =====
    // Use a separate browser context for the student so logs are isolated
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    logCollector.attachPage(studentPage, 'student-page');

    try {
      await signInAs(studentPage, student.email);
      await studentPage.goto(`/sections/${section.id}`);

      // Wait for the student section view to load — shows the problem
      await expect(
        studentPage.locator(`text=Sections Solved Problem ${testNamespace}`)
      ).toBeVisible({ timeout: 15000 });

      // Click "Practice" to open the workspace
      await studentPage.locator('button:has-text("Practice")').click();

      // Wait for the Monaco editor to load
      await expect(studentPage.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

      // The "Run all" button should be present
      await expect(
        studentPage.locator('[data-testid="workspace-run-all"]')
      ).toBeVisible({ timeout: 10000 });

      // Set the code via Monaco API
      await waitForMonacoReady(studentPage);
      await setMonacoValue(studentPage, 'print("hello from sections")\n');

      // Wait for debounced auto-save before executing
      await studentPage.waitForTimeout(1000);

      // Click "Run all"
      await studentPage.locator('[data-testid="workspace-run-all"]').click();

      // Wait for execution to complete — no test cases → trivially passes
      const drawerOutput = studentPage.locator('[data-testid="workspace-drawer-output"]');
      await expect(drawerOutput.locator('[data-testid="output-status-pass"]')).toBeVisible({ timeout: 15000 });

      // ===== NAVIGATE TO /sections AND ASSERT SOLVED COUNT =====
      // Navigate to the student's sections list page
      await studentPage.goto('/sections');

      // Wait for the page to load
      await expect(studentPage.locator('h1:has-text("My Sections")')).toBeVisible({ timeout: 15000 });

      // The section card should show "1 / 1 solved"
      // The enrichment is fetched after the section list loads, so it may take a moment
      await expect(
        studentPage.locator('text=1 / 1 solved')
      ).toBeVisible({ timeout: 15000 });
    } finally {
      try {
        await studentContext.close();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });
});
