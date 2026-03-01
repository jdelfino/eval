import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, startSession, createProblem, publishProblem, startSessionFromProblem, getOrCreateStudentWork, registerStudent, testToken } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Debugger E2E Tests
 *
 * Verifies that the standalone debugger (POST /trace) works from both
 * the instructor Problem Setup editor and the student code editor.
 *
 * This was the core bug in PLAT-mncy: instructor editors used a no-op
 * WebSocket send for tracing, causing "Loading Trace..." to spin forever.
 * The fix uses a standalone HTTP-based trace API instead.
 */

test.describe('Debugger', () => {
  test('Instructor can debug code from Problem Setup tab', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Debugger Test Class');
    const section = await createSection(instructor.token, cls.id, 'Debugger Section');
    const session = await startSession(instructor.token, section.id, section.name);

    // ===== INSTRUCTOR OPENS SESSION =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto(`/instructor/session/${session.id}`);
      await expect(instructorPage.locator('h2:has-text("Active Session")')).toBeVisible();

      // ===== NAVIGATE TO PROBLEM SETUP TAB =====
      await instructorPage.locator('button:has-text("Problem Setup")').click();

      // Wait for the SessionProblemEditor to render with its CodeEditor
      await expect(instructorPage.locator('.monaco-editor')).toBeVisible();

      // ===== TYPE CODE IN THE EDITOR =====
      await waitForMonacoReady(instructorPage);
      await setMonacoValue(instructorPage, 'x = 1\nprint(x)');

      // ===== OPEN DEBUGGER SIDEBAR =====
      // Click the bug icon in the activity bar to open the debugger sidebar
      const debuggerIcon = instructorPage.locator('button[aria-label="Debugger"]');
      await expect(debuggerIcon).toBeVisible();
      await debuggerIcon.click();

      // Verify the debugger sidebar opened with "Start Debugging" button
      await expect(instructorPage.locator('text=Python Debugger')).toBeVisible();
      const startButton = instructorPage.locator('button:has-text("Start Debugging")');
      await expect(startButton).toBeVisible();

      // ===== CLICK START DEBUGGING =====
      await startButton.click();

      // The button should briefly show "Loading Trace..." then transition to active state.
      // The key assertion: it must NOT stay stuck on "Loading Trace..." forever.
      // Wait for "Active Debugging" to appear (trace loaded successfully).
      await expect(instructorPage.locator('text=Active Debugging')).toBeVisible({ timeout: 15000 });

      // Verify step navigation is available (use .first() — step info appears in sidebar and output)
      await expect(instructorPage.locator('text=Step 1 of').first()).toBeVisible();
      await expect(instructorPage.locator('button:has-text("Next")')).toBeVisible();

      // Verify the "Exit Debugging" button appears in the header
      await expect(instructorPage.locator('button:has-text("Exit Debugging")')).toBeVisible();

      // ===== STEP THROUGH CODE =====
      await instructorPage.locator('button:has-text("Next")').click();
      await expect(instructorPage.locator('text=Step 2 of').first()).toBeVisible();

      // ===== EXIT DEBUGGING =====
      await instructorPage.locator('button:has-text("Exit Debugging")').click();

      // Verify we're back to the normal editor (Start Debugging button reappears)
      await expect(instructorPage.locator('button:has-text("Start Debugging")')).toBeVisible();
      // Run Code button should be back
      await expect(instructorPage.locator('button:has-text("Run Code")')).toBeVisible();

    } finally {
      await instructorContext.close();
    }
  });

  test('Student can debug code from session editor', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const studentExternalId = `student-${testNamespace}`;
    const studentEmail = `${studentExternalId}@test.local`;

    const cls = await createClass(instructor.token, 'Student Debug Class');
    const section = await createSection(instructor.token, cls.id, 'Student Debug Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Debug Problem',
      description: 'A problem for debugging',
      starterCode: '# Write your solution\n',
    });

    // Register student
    await registerStudent(section.join_code, studentExternalId, studentEmail, 'Debug Student');

    // Publish problem to section and start session from problem
    await publishProblem(instructor.token, section.id, problem.id);
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    // Get or create student work so we can navigate directly via work_id
    const studentToken = testToken(studentExternalId, studentEmail);
    const work = await getOrCreateStudentWork(studentToken, section.id, problem.id);

    // ===== STUDENT JOINS SESSION =====
    await signInAs(page, studentEmail);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.locator('text=Connected')).toBeVisible();

    // Wait for initial sync
    await page.waitForTimeout(1000);

    // ===== TYPE CODE =====
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'y = 42\nprint(y)');

    // ===== OPEN DEBUGGER SIDEBAR =====
    const debuggerIcon = page.locator('button[aria-label="Debugger"]');
    await expect(debuggerIcon).toBeVisible();
    await debuggerIcon.click();

    // Verify the debugger sidebar opened
    await expect(page.locator('text=Python Debugger')).toBeVisible();
    const startButton = page.locator('button:has-text("Start Debugging")');
    await expect(startButton).toBeVisible();

    // ===== START DEBUGGING =====
    await startButton.click();

    // Must transition to "Active Debugging" (not stuck on "Loading Trace...")
    await expect(page.locator('text=Active Debugging')).toBeVisible({ timeout: 15000 });

    // Verify step controls (use .first() — step info appears in sidebar and output)
    await expect(page.locator('text=Step 1 of').first()).toBeVisible();

    // ===== EXIT DEBUGGING =====
    await page.locator('button:has-text("Exit Debugging")').click();
    await expect(page.locator('button:has-text("Start Debugging")')).toBeVisible();
  });
});
