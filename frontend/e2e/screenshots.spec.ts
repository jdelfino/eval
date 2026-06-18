import path from 'path';
import { test } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { getSectionByJoinCode, createProblem, publishProblem, startSessionFromProblem } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Screenshot capture spec for README documentation.
 *
 * Captures two screenshots showing meaningful UI states:
 *   1. Student coding view — student in an active session with code written and
 *      execution results visible. Saved to docs/images/student-view.png.
 *   2. Instructor session view — instructor watching the session with a student's
 *      code visible in the student list. Saved to docs/images/instructor-session.png.
 *
 * These are not assertion-based tests — they exist solely to generate images for
 * the README. Run with `make test-e2e` or:
 *   npx playwright test screenshots.spec.ts
 *
 * The screenshots are committed to the repo under docs/images/ and referenced
 * by README.md.
 */

const IMAGES_DIR = path.resolve(__dirname, '../../docs/images');

test.describe('README Screenshots', () => {
  test.setTimeout(90000);

  test('Capture student coding view and instructor session view', async ({
    page,
    browser,
    setupInstructor,
    setupStudent,
    logCollector,
  }) => {
    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // ===== INSTRUCTOR BROWSER CONTEXT =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto('/instructor');

      // Wait for dashboard to load
      await instructorPage
        .locator('h2:has-text("Dashboard"), button:has-text("Create Your First Class")')
        .first()
        .waitFor({ state: 'visible' });

      // Create class
      await instructorPage
        .locator('button:has-text("New Class"), button:has-text("Create Your First Class")')
        .first()
        .click();
      await instructorPage.fill('input#class-name', 'CS101');
      await instructorPage.click('button:has-text("Create Class")');
      await instructorPage
        .locator('td:has-text("CS101"), div:has-text("CS101")')
        .first()
        .waitFor({ state: 'visible' });

      // Navigate to class and create section
      await instructorPage.locator('a:has-text("CS101")').first().click();
      await instructorPage.locator('h1:has-text("CS101")').waitFor({ state: 'visible' });

      await instructorPage
        .locator('button:has-text("New Section"), button:has-text("Create First Section")')
        .first()
        .click();
      await instructorPage.locator('input#section_name').first().waitFor({ state: 'visible' });
      await instructorPage.fill('input#section_name', 'Section 01');
      await instructorPage
        .locator('button[type="submit"]:has-text("Create"), button:has-text("Create Section")')
        .first()
        .click();
      await instructorPage.locator('text=Section 01').first().waitFor({ state: 'visible' });

      // Return to dashboard and read join code
      await instructorPage.goto('/instructor');
      await instructorPage.locator('h2:has-text("Dashboard")').waitFor({ state: 'visible' });

      const joinCodeElement = instructorPage.locator('[data-testid="join-code"]').first();
      await joinCodeElement.waitFor({ state: 'visible' });
      const joinCode = await joinCodeElement.textContent();
      if (!joinCode) throw new Error('Could not read join code from dashboard');

      // Look up section and class IDs
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;
      const classId = sectionInfo.class.id;

      // Create a problem and start session via API
      const problem = await createProblem(instructor.token, classId, {
        title: 'Fibonacci Sequence',
        description: 'Write a function that returns the nth Fibonacci number.',
        starterCode: [
          'def fibonacci(n):',
          '    """Return the nth Fibonacci number."""',
          '    # Your implementation here',
          '    pass',
          '',
          'print(fibonacci(10))',
        ].join('\n'),
      });
      await publishProblem(instructor.token, sectionId, problem.id);
      const session = await startSessionFromProblem(instructor.token, sectionId, problem.id);

      // ===== STUDENT JOINS AND WRITES CODE =====
      const student = await setupStudent(joinCode);

      await signInAs(page, student.email);
      await page.goto(`/sections/${sectionId}`);

      const joinNowButton = page.locator('button:has-text("Join Now")');
      await joinNowButton.waitFor({ state: 'visible' });
      await joinNowButton.click();

      // Wait for the Monaco editor and Live connection status
      await page.locator('.monaco-editor').waitFor({ state: 'visible' });
      await page.locator('text=Live').first().waitFor({ state: 'visible' });

      // Wait for initial empty sync to settle before typing
      await page.waitForTimeout(800);

      // Type a realistic solution
      const studentCode = [
        'def fibonacci(n):',
        '    """Return the nth Fibonacci number."""',
        '    if n <= 1:',
        '        return n',
        '    return fibonacci(n - 1) + fibonacci(n - 2)',
        '',
        'print(fibonacci(10))',
      ].join('\n');

      await waitForMonacoReady(page);
      await setMonacoValue(page, studentCode);

      // Wait for debounced code sync to server (500ms debounce + buffer)
      await page.waitForTimeout(1000);

      // Run the code so we have execution output in the screenshot
      // Note: "Run Code" button removed in G1 WorkspaceShell redesign; now "Run all" in TestRail.
      const runButton = page.locator('[data-testid="workspace-run-all"]');
      await runButton.waitFor({ state: 'visible' });
      await runButton.click();

      // Wait for execution results to appear in the drawer output panel
      await page.locator('[data-testid="workspace-drawer-output"]').waitFor({ state: 'visible', timeout: 30000 });

      // ===== SCREENSHOT 1: Student coding view =====
      await page.screenshot({
        path: path.join(IMAGES_DIR, 'student-view.png'),
        fullPage: false,
      });

      // ===== INSTRUCTOR SESSION VIEW (G4 three-column live dashboard) =====
      await instructorPage.goto(`/instructor/session/${session.id}`);
      await instructorPage.locator('[data-testid="active-session-header"]').waitFor({ state: 'visible' });

      // Dismiss the post-launch strip so it does not overlay the dashboard.
      const stripDismiss = instructorPage.locator('[data-testid="session-launch-strip-dismiss"]');
      if (await stripDismiss.isVisible().catch(() => false)) {
        await stripDismiss.click();
      }
      await instructorPage.locator('[data-testid="session-dashboard-grid"]').waitFor({ state: 'visible', timeout: 10000 });

      // Wait for the student to appear in the roster, then focus them so the
      // center focused panel shows their live code (replaces the old View button).
      const studentDisplayName = 'E2E student';
      const studentRow = instructorPage
        .locator('[data-testid^="student-row-"]')
        .filter({ hasText: studentDisplayName })
        .first();
      await studentRow.waitFor({ state: 'visible', timeout: 15000 });
      await studentRow.click();

      // Wait for the focused panel with the student's embedded workspace.
      const focusedPanel = instructorPage.locator('[data-testid="focused-student-panel"]');
      await focusedPanel.waitFor({ state: 'visible', timeout: 10000 });
      await focusedPanel.locator('.monaco-editor').waitFor({ state: 'visible' });

      // ===== SCREENSHOT 2: Instructor session view =====
      await instructorPage.screenshot({
        path: path.join(IMAGES_DIR, 'instructor-session.png'),
        fullPage: false,
      });
    } finally {
      await instructorContext.close();
    }
  });
});
