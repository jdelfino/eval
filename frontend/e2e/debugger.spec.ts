import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, startSession, createProblem, publishProblem, startSessionFromProblem, getOrCreateStudentWork } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Debugger E2E Tests
 *
 * Verifies that the standalone debugger (POST /trace) works from both
 * the instructor Problem Setup editor and the student code editor.
 *
 * G1 selector audit (eval-cej.5.11):
 *
 * The old debugger flow used a standalone sidebar:
 *   button[aria-label="Debugger"] → "Start Debugging" → "Active Debugging" header
 *   → "Step X of" counter → "Next" / "Exit Debugging" buttons
 *
 * The new G1 WorkspaceShell debug flow is per-test-case:
 *   - Click a test row in TestRail to activate it
 *   - Click the "Debug" button on the active row → drawer switches to mode='debug'
 *   - Drawer shows step counter (data-testid="debug-step-counter") and nav buttons
 *     (data-testid="debug-step-next", "debug-step-prev")
 *   - No "Exit Debugging" button is wired in G1 student page (drawerCloseAction omitted)
 *
 * SKIPPED: Both tests are skipped because:
 * 1. The problems created here have no test cases, so the TestRail is empty and
 *    the per-row Debug button never renders.
 * 2. "Exit Debugging" is not wired in T6 (student/page.tsx does not pass drawerCloseAction).
 * 3. SessionProblemEditor likewise does not wire an exit-debug affordance.
 *
 * These tests can be re-enabled in G2 (eval-cej.6) once the per-test edit drawer
 * lands and the "Exit Debugging" wiring is added (drawerCloseAction with debugger.reset()).
 */

test.describe('Debugger', () => {
  test.skip('Instructor can debug code from Problem Setup tab', async ({ page, browser, setupInstructor, logCollector }) => {
    // SKIPPED: blocked on eval-cej.6 (G2).
    // The new debug flow requires at least one test case in the TestRail to show
    // the per-row "Debug" button. Problems created here have no test cases, so the
    // TestRail is empty. Additionally, "Exit Debugging" is not wired in G1's
    // SessionProblemEditor (drawerCloseAction not passed to WorkspaceShell).
    //
    // When re-enabling:
    //   1. Create problem with at least one IO test case via API
    //   2. Select the test row: page.locator('[data-testid="testrail-row-{id}"]').click()
    //   3. Click Debug: page.locator('button:has-text("Debug")').click()
    //   4. Assert drawer mode='debug': page.locator('[data-testid="workspace-drawer"][data-mode="debug"]')
    //   5. Step counter: page.locator('[data-testid="debug-step-counter"]')
    //   6. Next: page.locator('[data-testid="debug-step-next"]').click()
    //   7. Exit: wire drawerCloseAction in page.tsx with debugger.reset(), then assert
    test.setTimeout(60000);

    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Debugger Test Class');
    const section = await createSection(instructor.token, cls.id, 'Debugger Section');
    const session = await startSession(instructor.token, section.id, section.name);

    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto(`/instructor/session/${session.id}`);
      await expect(instructorPage.locator('[data-testid="active-session-header"]')).toBeVisible();

      await instructorPage.locator('button:has-text("Problem Setup")').click();
      await expect(instructorPage.locator('.monaco-editor')).toBeVisible();

      await waitForMonacoReady(instructorPage);
      await setMonacoValue(instructorPage, 'x = 1\nprint(x)');

      // OLD selectors (removed — sidebar is gone):
      //   button[aria-label="Debugger"], text=Python Debugger, button:has-text("Start Debugging")
      //   text=Active Debugging, text=Step 1 of, button:has-text("Next"), button:has-text("Exit Debugging")
      //
      // NEW selectors (available in G2+):
      //   [data-testid="workspace-test-rail"] → select row → click "Debug" button
      //   [data-testid="workspace-drawer"][data-mode="debug"]
      //   [data-testid="debug-step-counter"] — text: "step N / total"
      //   [data-testid="debug-step-next"], [data-testid="debug-step-prev"]
    } finally {
      await instructorContext.close();
    }
  });

  test.skip('Student can debug code from session editor', async ({ page, browser, setupInstructor, setupStudent, logCollector }) => {
    // SKIPPED: blocked on eval-cej.6 (G2).
    // Same reasons as the instructor test above — no test cases → empty TestRail →
    // per-row Debug button never renders. Also no "Exit Debugging" UI in G1.
    test.setTimeout(60000);

    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Student Debug Class');
    const section = await createSection(instructor.token, cls.id, 'Student Debug Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Debug Problem',
      description: 'A problem for debugging',
      starterCode: '# Write your solution\n',
    });

    await publishProblem(instructor.token, section.id, problem.id);
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);
    const student = await setupStudent(section.join_code, 'debug-student');
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.locator('text=Live').first()).toBeVisible();

    await page.waitForTimeout(1000);
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'y = 42\nprint(y)');

    // OLD selectors (removed — sidebar is gone):
    //   button[aria-label="Debugger"], text=Python Debugger, button:has-text("Start Debugging")
    //   text=Active Debugging, text=Step 1 of, button:has-text("Exit Debugging")
    //
    // NEW selectors (available in G2+):
    //   [data-testid="workspace-test-rail"] → select row → click "Debug" button
    //   [data-testid="workspace-drawer"][data-mode="debug"]
    //   [data-testid="debug-step-counter"] — text: "step N / total"
    //   [data-testid="debug-step-next"], [data-testid="debug-step-prev"]
  });
});
