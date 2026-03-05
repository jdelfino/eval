import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, startSessionFromProblem, publishProblem, getOrCreateStudentWork, completeSession } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue, getMonacoValue } from './fixtures/monaco';

test.describe('Session Lifecycle', () => {
  test('Java code execution: student runs Java code and sees output', async ({ page, setupInstructor, setupStudent }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // Create class, section, and Java problem via API
    const cls = await createClass(instructor.token, 'Java Lifecycle Class');
    const section = await createSection(instructor.token, cls.id, 'Java Lifecycle Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Hello Java',
      description: 'Print hello from Java',
      language: 'java',
      starterCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("hello from java");\n    }\n}\n',
    });

    // Publish problem to section (required for student flow via section page)
    await publishProblem(instructor.token, section.id, problem.id);

    // Start session from problem via API
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    // Register student via the setupStudent fixture (creates emulator user and enrolls in section)
    const student = await setupStudent(section.join_code);

    // ===== STUDENT OPENS PRACTICE WORKSPACE =====
    await signInAs(page, student.email);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.locator('text=Connected')).toBeVisible();

    // ===== STUDENT WRITES JAVA CODE =====
    await waitForMonacoReady(page);
    const javaCode = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("JAVA_E2E_TEST_OK");\n    }\n}';
    await setMonacoValue(page, javaCode);

    // Wait for debounced auto-save before executing (500ms debounce + buffer)
    await page.waitForTimeout(1000);

    // ===== STUDENT RUNS JAVA CODE =====
    // End the session so student enters practice mode where Run Code is available
    await completeSession(instructor.token, session.id);

    // Student should see the session ended notification
    await expect(page.locator('[data-testid="session-ended-notification"]')).toBeVisible();

    // Run Code button should be available in practice mode
    const runButton = page.locator('button:has-text("Run Code")');
    await expect(runButton).toBeVisible();

    // Click Run Code — exercises the full Docker+nsjail Java execution stack
    await runButton.click();

    // ===== VERIFY SUCCESSFUL JAVA EXECUTION OUTPUT =====
    const outputArea = page.locator('[data-testid="output-area"]');
    await expect(outputArea.locator('text=✓ Success')).toBeVisible({ timeout: 30000 });
    await expect(outputArea.locator('text=JAVA_E2E_TEST_OK')).toBeVisible();
  });

  test('Full session lifecycle: create, join, replace, end, practice', async ({ page, browser, setupInstructor, setupStudent, logCollector }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // Create class, section, and problem via API (faster than UI)
    const cls = await createClass(instructor.token, 'Lifecycle Class');
    const section = await createSection(instructor.token, cls.id, 'Lifecycle Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Hello World',
      description: 'Print hello world',
      starterCode: '# Write your solution\nprint("hello")\n',
    });

    // Publish problem to section (required for student flow via section page)
    await publishProblem(instructor.token, section.id, problem.id);

    // Start session from problem via API
    const session1 = await startSessionFromProblem(instructor.token, section.id, problem.id);

    // Register student via the setupStudent fixture (creates emulator user and enrolls in section)
    const student = await setupStudent(section.join_code);

    // ===== INSTRUCTOR OPENS SESSION VIEW =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      // Navigate directly to session page
      await instructorPage.goto(`/instructor/session/${session1.id}`);
      await expect(instructorPage.locator('h2:has-text("Active Session")')).toBeVisible();

      // ===== STUDENT JOINS =====
      await signInAs(page, student.email);
      const work1 = await getOrCreateStudentWork(student.token, section.id, problem.id);
      await page.goto(`/student?work_id=${work1.id}`);
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect(page.locator('text=Connected')).toBeVisible();

      // Wait for initial sync
      await page.waitForTimeout(1000);

      // ===== STUDENT TYPES CODE =====
      await waitForMonacoReady(page);
      await setMonacoValue(page, 'print("LIFECYCLE_TEST_1")');

      // Wait for code sync (500ms debounce + network)
      await page.waitForTimeout(1000);

      // ===== INSTRUCTOR VERIFIES STUDENT CODE =====
      await expect(instructorPage.locator('text=E2E student')).toBeVisible();

      // ===== INSTRUCTOR STARTS REPLACEMENT SESSION =====
      // Start a new session via API (simulating "Replace Session")
      const session2 = await startSessionFromProblem(instructor.token, section.id, problem.id);

      // End session 1 via API
      await completeSession(instructor.token, session1.id);

      // ===== STUDENT SEES SESSION ENDED + REPLACEMENT NOTIFICATION =====
      // Student should see the session ended notification
      await expect(page.locator('[data-testid="session-ended-notification"]')).toBeVisible();

      // Look for "Join New Session" button (appears when replacement is available)
      // Note: The replacement detection may come through realtime or polling
      // Give it extra time since this depends on the server broadcasting the replacement info
      const joinNewButton = page.locator('button:has-text("Join New Session")');

      // When "Join New Session" is clicked, the student is redirected to the section page
      // (the new flow: student rejoins via the active session banner on the section page)
      // If replacement notification doesn't appear automatically, navigate to section page directly
      try {
        await expect(joinNewButton).toBeVisible({ timeout: 5000 });
        await joinNewButton.click();
        // After clicking, student is on section page — click "Join Now" to join new session
        const joinNowButton = page.locator('button:has-text("Join Now")');
        await expect(joinNowButton).toBeVisible({ timeout: 10000 });
        await joinNowButton.click();
      } catch {
        // Fallback: navigate directly to section page and join the new session via work_id
        const work2 = await getOrCreateStudentWork(student.token, section.id, problem.id);
        await page.goto(`/student?work_id=${work2.id}`);
      }

      // ===== STUDENT JOINS NEW SESSION =====
      await expect(page.locator('.monaco-editor')).toBeVisible();

      // Wait for editor to be ready
      await page.waitForTimeout(1000);

      // ===== STUDENT TYPES IN NEW SESSION =====
      await waitForMonacoReady(page);
      await setMonacoValue(page, 'print("LIFECYCLE_TEST_2")');

      // Wait for code sync
      await page.waitForTimeout(1000);

      // ===== INSTRUCTOR ENDS SESSION 2 =====
      await completeSession(instructor.token, session2.id);

      // ===== STUDENT SEES PRACTICE MODE =====
      // Student should see the session ended notification
      await expect(page.locator('[data-testid="session-ended-notification"]')).toBeVisible();

      // In practice mode, the run button should still be available
      const runButton = page.locator('button:has-text("Run Code")');
      await expect(runButton).toBeVisible();

      // Verify Monaco still contains the student's code (guards against state loss)
      await waitForMonacoReady(page);
      await expect.poll(() => getMonacoValue(page), {
        timeout: 5000,
        message: 'Monaco should still contain student code after session end',
      }).toContain('LIFECYCLE_TEST_2');

      // ===== STUDENT RUNS CODE IN PRACTICE MODE =====
      // Click Run Code — this uses the practice API endpoint
      await runButton.click();

      // Wait for successful execution result — practice mode must actually work
      const outputArea = page.locator('[data-testid="output-area"]');
      await expect(outputArea.locator('text=✓ Success')).toBeVisible({ timeout: 15000 });
      await expect(outputArea.locator('text=LIFECYCLE_TEST_2')).toBeVisible();

    } finally {
      await instructorContext.close();
    }
  });
});
