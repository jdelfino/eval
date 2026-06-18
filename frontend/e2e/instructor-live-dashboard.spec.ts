import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  startSessionFromProblem,
  getOrCreateStudentWork,
  listStudentProgress,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Instructor Live Dashboard E2E Test (F8 — multi-context).
 *
 * Contract verified: a student's run-all summary, delivered over the websocket
 * (PUT run_summary → student_code_updated event → realtime state), is reflected
 * LIVE on the G4 three-column instructor dashboard WITHOUT a reload:
 *   - the roster row glyph turns "run" (all-pass) with a "X/Y passing" detail,
 *   - the roster header gets a run-count pill,
 *   - the class-minimap tile dot turns "run",
 *   - the signals panel shows "Joined 1/…" and Passing 1 / Failing 0.
 *
 * Why it matters: this is the whole F8 status pipeline. If any link breaks
 * (executor summary → realtimeUpdateCodeImmediate → Centrifugo → useRealtimeSession
 * → deriveStudentStatus → the four columns), the instructor's live read of the
 * class silently goes wrong. This is the established multi-browser-context
 * websocket pattern (see student-review.spec.ts / session-lifecycle.spec.ts).
 *
 * Generous websocket timeouts are used because useRealtimeSession has a polling
 * fallback; the run summary may arrive via push or the next poll.
 */

test.describe('Instructor live dashboard reflects student run status', () => {
  test('student run-all → instructor roster glyph + minimap dot + signals counts update live', async ({
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

    const cls = await createClass(instructor.token, `Live Dash Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Live Dash Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Live Dash Problem ${testNamespace}`,
      description: 'Print the expected value',
      // A trivially-passing solution: the single io test case has empty input and
      // expects the printed line, so a correct run is all-pass (run glyph).
      starterCode: 'print("LIVE_DASH_PASS")\n',
      testCases: [
        { kind: 'io', name: 'prints value', input: '', expected_output: 'LIVE_DASH_PASS', match_type: 'exact', order: 0 },
      ],
    });

    await publishProblem(instructor.token, section.id, problem.id);

    // Start the live session (sets the section pointer) so the student's edits +
    // run summary flow through the websocket sync path.
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    const student = await setupStudent(section.join_code, 'student-livedash');
    const studentDisplayName = 'E2E student-livedash';

    // Resolve the student's DB user_id so the instructor can target the precise
    // roster row / minimap tile testids (keyed on user_id).
    const progress = await listStudentProgress(instructor.token, section.id);
    const studentProgress = progress.find((p) => p.email === student.email);
    if (!studentProgress) {
      throw new Error(`Student ${student.email} not found in section progress list`);
    }
    const studentUserId = studentProgress.user_id;

    // ===== INSTRUCTOR OPENS THE LIVE DASHBOARD (default page) =====
    await signInAs(page, instructor.email);
    await page.goto(`/instructor/session/${session.id}`);
    await expect(page.locator('[data-testid="active-session-header"]')).toBeVisible({ timeout: 15000 });

    // Dismiss the post-launch strip if present so it never overlays the dashboard.
    const stripDismiss = page.locator('[data-testid="session-launch-strip-dismiss"]');
    if (await stripDismiss.isVisible().catch(() => false)) {
      await stripDismiss.click();
    }

    // The three-column dashboard grid should be present.
    await expect(page.locator('[data-testid="session-dashboard-grid"]')).toBeVisible({ timeout: 10000 });

    // ===== STUDENT JOINS IN A SEPARATE CONTEXT, WRITES CODE, RUNS ALL =====
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    logCollector.attachPage(studentPage, 'student-page');

    try {
      await signInAs(studentPage, student.email);
      const work = await getOrCreateStudentWork(student.token, section.id, problem.id);
      await studentPage.goto(`/student?work_id=${work.id}&section_id=${section.id}`);

      await expect(studentPage.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
      await expect(studentPage.locator('text=Live').first()).toBeVisible({ timeout: 10000 });

      // ===== INSTRUCTOR SEES THE STUDENT JOIN =====
      // The join propagates to the instructor over the websocket (or the
      // useRealtimeSession polling fallback). Use a generous timeout. The roster
      // row appearing is the primary "joined" signal.
      const rosterRow = page.locator(`[data-testid="student-row-${studentUserId}"]`);
      await expect(rosterRow).toBeVisible({ timeout: 30000 });
      const signalJoined = page.locator('[data-testid="signal-joined"]');
      await expect(signalJoined).toBeVisible({ timeout: 10000 });

      // ===== STUDENT TYPES PASSING CODE AND RUNS ALL =====
      // Let the initial empty-code sync settle to avoid racing with the typed code.
      await studentPage.waitForTimeout(800);
      await waitForMonacoReady(studentPage);
      await setMonacoValue(studentPage, 'print("LIVE_DASH_PASS")');
      await studentPage.waitForTimeout(1000);

      const runAll = studentPage.locator('[data-testid="workspace-run-all"]');
      await expect(runAll).toBeVisible();
      await runAll.click();

      // Wait for the student's own run to succeed (confirms the summary is real).
      const drawerOutput = studentPage.locator('[data-testid="workspace-drawer-output"]');
      await expect(drawerOutput.locator('[data-testid="output-status-pass"]')).toBeVisible({ timeout: 20000 });

      // ===== INSTRUCTOR DASHBOARD REFLECTS THE RUN — NO RELOAD =====
      // 1) Roster glyph turns "run" (all-pass) with a passing detail line.
      const rosterGlyph = page.locator(`[data-testid="roster-glyph-${studentUserId}"]`);
      await expect(rosterGlyph).toHaveAttribute('data-status', 'run', { timeout: 20000 });
      await expect(rosterRow).toContainText('passing', { timeout: 20000 });

      // 2) Roster header run-count pill appears (>=1 passing student).
      await expect(page.locator('[data-testid="roster-pill-run"]')).toBeVisible({ timeout: 20000 });

      // 3) Class-minimap tile dot turns "run".
      const minimapDot = page.locator(`[data-testid="minimap-dot-${studentUserId}"]`);
      await expect(minimapDot).toHaveAttribute('data-status', 'run', { timeout: 20000 });

      // 4) Signals "Joined 1/N" card reflects the joined student, and the
      //    "Last run" card shows Passing 1 · Failing 0.
      // Match the "1 / N" value. No leading \b: the card text concatenates the
      // "Joined" label with the value ("Joined1 / 1"), so a \b before the 1 would
      // never match.
      await expect(signalJoined).toContainText(/1\s*\/\s*\d+/, { timeout: 20000 });
      const signalPassFail = page.locator('[data-testid="signal-passing-failing"]');
      await expect(signalPassFail).toContainText('Passing 1', { timeout: 20000 });
      await expect(signalPassFail).toContainText('Failing 0', { timeout: 20000 });
    } finally {
      await studentContext.close();
    }
  });
});
