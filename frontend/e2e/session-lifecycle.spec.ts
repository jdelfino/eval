import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  startSessionFromProblem,
  publishProblem,
  getOrCreateStudentWork,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue, getMonacoValue } from './fixtures/monaco';

/**
 * Session Lifecycle E2E (section-pointer model, G4).
 *
 * Under the section-pointer model sessions are PERSISTENT — they are never
 * "ended" or "replaced" for a student. The classroom lifecycle is expressed via
 * the section's current-session pointer:
 *   - late-join: a student opening the section after the instructor creates a
 *     session lands on the pointer's session automatically (zero instructor
 *     action at join time);
 *   - moved on: when the instructor opens a new problem (the pointer moves), a
 *     student already mid-problem sees the "Instructor moved on" banner and can
 *     Jump in (navigate to the new problem) or Stay here (keep working);
 *   - End class: clearing the pointer returns the section live card to idle; no
 *     session is "completed".
 *
 * These three flows REPLACE the retired create/replace/end + session-ended +
 * practice-mode scenarios. The old "session ended notification" UI is gone and
 * NO test asserts `session-ended-notification`. The retired assertions are
 * re-expressed here: the persistence-of-code + Run-all-works guard (formerly the
 * practice-mode tail) now lives on the moved-on "Stay here" branch and the
 * Java-execution stack coverage is preserved by the late-join run.
 */

test.describe('Session Lifecycle (section-pointer model)', () => {
  // Uses Java to keep E2E coverage of the Docker+nsjail Java execution stack
  // (Python is covered by preview-mode / problem-publishing / instructor-live-dashboard).
  test('late-join: student opening the section after create lands on the pointer session and can run code', async ({
    page,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Lifecycle Class');
    const section = await createSection(instructor.token, cls.id, 'Lifecycle Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Hello World',
      description: 'Print hello world',
      language: 'java',
      starterCode:
        'public class Main {\n    public static void main(String[] args) {\n        System.out.println("hello");\n    }\n}\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);

    // Instructor creates the session FIRST (sets the section pointer). The student
    // is NOT yet on the page — they will arrive late and land on the pointer.
    await startSessionFromProblem(instructor.token, section.id, problem.id);

    const student = await setupStudent(section.join_code);

    // ===== STUDENT ARRIVES AFTER CREATE — LANDS ON THE POINTER SESSION =====
    await signInAs(page, student.email);
    await page.goto(`/sections/${section.id}`);

    // The section live card shows the current problem with a join affordance —
    // this is the pointer landing surface (no instructor action at join time).
    const joinNowButton = page.locator('button:has-text("Join now"), button:has-text("Jump in")').first();
    await expect(joinNowButton).toBeVisible({ timeout: 15000 });
    await joinNowButton.click();

    // Student enters the LIVE workspace (pointer's session), not practice.
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Live').first()).toBeVisible({ timeout: 10000 });

    // ===== STUDENT TYPES + RUNS CODE (Java stack coverage) =====
    await page.waitForTimeout(1000);
    await waitForMonacoReady(page);
    await setMonacoValue(
      page,
      'public class Main {\n    public static void main(String[] args) {\n        System.out.println("LIFECYCLE_LATE_JOIN");\n    }\n}'
    );
    await page.waitForTimeout(1000);

    // Run all — the live session must actually execute Java.
    const runButton = page.locator('[data-testid="workspace-run-all"]');
    await expect(runButton).toBeVisible();
    await runButton.click();

    const drawerOutput = page.locator('[data-testid="workspace-drawer-output"]');
    await expect(drawerOutput.locator('[data-testid="output-status-pass"]')).toBeVisible({ timeout: 20000 });
    await expect(drawerOutput.locator('text=LIFECYCLE_LATE_JOIN')).toBeVisible();
  });

  test('moved on: instructor opens a new problem → student sees the banner; Jump in navigates, Stay here keeps them', async ({
    page,
    browser,
    setupInstructor,
    setupStudent,
    logCollector,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'MovedOn Class');
    const section = await createSection(instructor.token, cls.id, 'MovedOn Section');
    const problem1 = await createProblem(instructor.token, cls.id, {
      title: 'First Problem',
      description: 'The problem the student starts on',
      starterCode: '# problem one\n',
    });
    const problem2 = await createProblem(instructor.token, cls.id, {
      title: 'Second Problem',
      description: 'The problem the instructor moves on to',
      starterCode: '# problem two\n',
    });
    await publishProblem(instructor.token, section.id, problem1.id);
    await publishProblem(instructor.token, section.id, problem2.id);

    // Instructor starts the first session (sets the pointer to problem 1).
    const session1 = await startSessionFromProblem(instructor.token, section.id, problem1.id);

    const student = await setupStudent(section.join_code);

    // ===== STUDENT JOINS THE FIRST (CURRENT) SESSION =====
    await signInAs(page, student.email);
    const work1 = await getOrCreateStudentWork(student.token, section.id, problem1.id);
    await page.goto(`/student?work_id=${work1.id}&section_id=${section.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Live').first()).toBeVisible({ timeout: 10000 });

    // Student writes code on problem 1 (guards "Stay here" preserves it later).
    await page.waitForTimeout(800);
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'print("MOVED_ON_STAY_CODE")');
    await page.waitForTimeout(1000);

    // ===== INSTRUCTOR MOVES ON: starts a second session with make-current on =====
    // startSessionFromProblem defaults set_current:true → the section pointer
    // moves to session 2 and section_current_changed is published.
    const session2 = await startSessionFromProblem(instructor.token, section.id, problem2.id);
    expect(session2.id).not.toBe(session1.id);

    // ===== STUDENT SEES THE "INSTRUCTOR MOVED ON" BANNER =====
    const banner = page.locator('[data-testid="new-problem-banner"]');
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toContainText('Second Problem');

    // ----- Branch A: "Stay here" dismisses the banner and keeps the student in
    // place with their code intact (redistributed code-persistence guard) -----
    await page.locator('[data-testid="stay-here-button"]').click();
    await expect(banner).toBeHidden({ timeout: 10000 });

    // Still in the original workspace; code is preserved.
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await waitForMonacoReady(page);
    await expect.poll(() => getMonacoValue(page), {
      timeout: 5000,
      message: 'code must survive a "Stay here" dismissal',
    }).toContain('MOVED_ON_STAY_CODE');

    // ----- Branch B: re-trigger the move and take "Jump in" → navigate to the
    // new problem. We re-issue the pointer move via a third session on problem 2
    // so the banner re-appears for this same student page. -----
    const session3 = await startSessionFromProblem(instructor.token, section.id, problem2.id);
    expect(session3.id).not.toBe(session2.id);

    await expect(banner).toBeVisible({ timeout: 20000 });
    const beforeJumpUrl = page.url();
    await page.locator('[data-testid="jump-in-button"]').click();

    // Jump in navigates to a /student workspace for the NEW problem (a different
    // work_id than the one the student was on).
    await page.waitForURL(
      (url) => url.pathname.includes('/student') && /work_id=/.test(url.search) && url.href !== beforeJumpUrl,
      { timeout: 15000 }
    );
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

    // The destination is the second problem: its title shows in the breadcrumb
    // and the editor loads the new work (NOT the first problem's code), confirming
    // a clean switch. The fresh problem-2 work has empty code, so the key
    // assertion is that the old code is gone.
    await expect(page.locator('text=Second Problem').first()).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);
    await expect.poll(() => getMonacoValue(page), {
      timeout: 15000,
      message: 'after Jump in the workspace loads the new problem work, not the first problem code',
    }).not.toContain('MOVED_ON_STAY_CODE');

    void browser;
    void logCollector;
  });

  test('End class: clearing the pointer returns the section live card to idle (no session completed)', async ({
    page,
    browser,
    setupInstructor,
    setupStudent,
    logCollector,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'EndClass Class');
    const section = await createSection(instructor.token, cls.id, 'EndClass Section');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'End Class Problem',
      description: 'A problem to end the class on',
      starterCode: '# end class\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    // Enroll a student so we can assert the section live card returns to idle.
    const student = await setupStudent(section.join_code);

    // ===== INSTRUCTOR OPENS THE SESSION DASHBOARD =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto(`/instructor/session/${session.id}`);
      await expect(instructorPage.locator('[data-testid="active-session-header"]')).toBeVisible({ timeout: 15000 });

      // Dismiss the launch strip if present so the End class button is clear.
      const stripDismiss = instructorPage.locator('[data-testid="session-launch-strip-dismiss"]');
      if (await stripDismiss.isVisible().catch(() => false)) {
        await stripDismiss.click();
      }

      // ===== STUDENT SEES THE SECTION AS HAVING A CURRENT PROBLEM (live) =====
      await signInAs(page, student.email);
      await page.goto(`/sections/${section.id}`);
      // Live card with a join affordance proves the pointer is set.
      await expect(
        page.locator('button:has-text("Join now"), button:has-text("Jump in")').first()
      ).toBeVisible({ timeout: 15000 });

      // ===== INSTRUCTOR ENDS THE CLASS (clears the pointer) =====
      await instructorPage.locator('[data-testid="end-class-button"]').click();
      // Confirm in the dialog.
      await instructorPage.locator('button:has-text("End class")').last().click();

      // End class navigates the instructor back to /instructor.
      await instructorPage.waitForURL(/\/instructor(\b|\/?$)/, { timeout: 15000 });

      // ===== STUDENT SECTION LIVE CARD RETURNS TO IDLE (pointer cleared) =====
      // Reload to fetch the cleared pointer (the idle state is "No session live
      // right now" with no join button). The session itself is NOT completed —
      // we only assert the live card is idle, never a "completed" status.
      await page.reload();
      await expect(page.locator('text=No session live right now')).toBeVisible({ timeout: 15000 });
      await expect(
        page.locator('button:has-text("Join now"), button:has-text("Jump in")')
      ).toHaveCount(0);
    } finally {
      await instructorContext.close();
    }
  });
});
