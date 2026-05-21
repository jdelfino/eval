import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, startSession, createProblem, publishProblem, startSessionFromProblem, getOrCreateStudentWork } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Debugger E2E Tests
 *
 * Verifies that the standalone debugger (POST /trace) works from the student
 * code editor.
 *
 * Post-G2 (eval-cej.6) selector reference:
 *
 * The per-test debug flow (shipped in G1 WorkspaceShell):
 *   - Click a test row in TestRail to activate it:
 *       [data-testid="testrail-row-{id}"]  (id = "io-{order}-{name}")
 *   - Click the "Debug" button on the active row (visible only in run/edit mode):
 *       button:has-text("Debug")
 *   - Drawer switches to mode='debug':
 *       [data-testid="workspace-drawer"][data-mode="debug"]
 *   - Drawer may start collapsed; click summary bar to expand before asserting on controls
 *   - Step counter:  [data-testid="debug-step-counter"]
 *   - Nav buttons:   [data-testid="debug-step-next"], [data-testid="debug-step-prev"]
 *   - Exit Debug:    [data-testid="debug-exit"]  (wired via drawerCloseAction in student/page.tsx)
 *
 * Student test:    ENABLED (G2 shipped: test cases API, drawerCloseAction wired)
 * Instructor test: SKIPPED — blocked on G3 (eval-cej.7); SessionProblemEditor.handleDebugTest
 *                  is currently a no-op stub; instructor pages lack useApiDebugger wiring.
 */

test.describe('Debugger', () => {
  test.skip('Instructor can debug code from Problem Setup tab', async ({ page, browser, setupInstructor, logCollector }) => {
    // SKIPPED: Blocked on G3 (eval-cej.7) — SessionProblemEditor.handleDebugTest is currently
    // a no-op stub (`// Debug deferred to G3`); the instructor pages lack the useApiDebugger
    // hook, buildDrawerDebug adapter, and drawerDebug wiring that the student page has.
    // Re-enable when eval-cej.7 lands and instructor debug machinery is wired.
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

      // NEW selectors (available in G3+):
      //   [data-testid="workspace-test-rail"] → select row → click "Debug" button
      //   [data-testid="workspace-drawer"][data-mode="debug"]
      //   [data-testid="debug-step-counter"] — text: "step N / total"
      //   [data-testid="debug-step-next"], [data-testid="debug-step-prev"]
    } finally {
      await instructorContext.close();
    }
  });

  test('Student can debug code from session editor', async ({ page, browser, setupInstructor, setupStudent, logCollector }) => {
    test.setTimeout(60000);

    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Student Debug Class');
    const section = await createSection(instructor.token, cls.id, 'Student Debug Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Debug Problem',
      description: 'A problem for debugging',
      starterCode: '# Write your solution\n',
      testCases: [
        {
          kind: 'io',
          order: 0,
          name: 'prints 42',
          input: '',
          expected_output: '42\n',
        },
      ],
    });

    await publishProblem(instructor.token, section.id, problem.id);
    await startSessionFromProblem(instructor.token, section.id, problem.id);
    const student = await setupStudent(section.join_code, 'debug-student');
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.locator('text=Live').first()).toBeVisible();

    await page.waitForTimeout(1000);
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'y = 42\nprint(y)');

    const testRow = page.locator('[data-testid^="testrail-row-"]').first();
    await expect(testRow).toBeVisible();
    await testRow.click();

    const debugButton = testRow.locator('button:has-text("Debug")');
    await expect(debugButton).toBeVisible();
    await debugButton.click();

    const drawer = page.locator('[data-testid="workspace-drawer"][data-mode="debug"]');
    await expect(drawer).toBeVisible({ timeout: 30000 });

    // Drawer can render collapsed (30px summary bar); step controls live in the expanded variant.
    // Check the drawer's own data-collapsed attribute instead of probing a child for visibility —
    // the child may still be mid-render right after the drawer appears.
    if ((await drawer.getAttribute('data-collapsed')) === 'true') {
      await drawer.click();
    }

    const stepCounter = page.locator('[data-testid="debug-step-counter"]');
    await expect(stepCounter).toBeVisible({ timeout: 10000 });

    const stepNext = page.locator('[data-testid="debug-step-next"]');
    await expect(stepNext).toBeVisible();

    const counterBefore = await stepCounter.textContent();
    expect(counterBefore).not.toBeNull();
    await stepNext.click();
    await expect(stepCounter).not.toHaveText(counterBefore!, { timeout: 5000 });

    const exitButton = page.locator('[data-testid="debug-exit"]');
    await expect(exitButton).toBeVisible();
    await exitButton.click();

    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="debug"]')).not.toBeVisible({ timeout: 5000 });
  });
});
