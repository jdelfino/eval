import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  getOrCreateStudentWork,
  startSessionFromProblem,
  completeSession,
  listStudentProgress,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * Student Progress Review E2E Tests
 *
 * Covers the instructor student progress review / grading workflow:
 * 1. Instructor navigates to section → Students tab
 * 2. Student appears with progress info
 * 3. Instructor clicks student to view their work page
 * 4. Problem listed with student work visible
 * 5. Instructor navigates back to section
 *
 * Single actor (instructor), read-only navigation.
 */

test.describe('Instructor reviews student progress and work in a section', () => {
  test('instructor views student progress on section page and student work detail', async ({
    page,
    testNamespace,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(45000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // Create class, section, and problem via API
    const cls = await createClass(instructor.token, `Review Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Review Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Review Problem ${testNamespace}`,
      description: 'A problem for review testing',
      starterCode: 'print("hello world")\n',
    });

    // Publish problem to the section
    await publishProblem(instructor.token, section.id, problem.id);

    // Register a student via the setupStudent fixture
    const student = await setupStudent(section.join_code, 'student-review');
    const studentDisplayName = 'E2E student-review';

    // Create student work entry via API (simulates the student having started the problem)
    await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== INSTRUCTOR NAVIGATES TO SECTION =====
    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    // Wait for section page to load — instructor view shows "Preview as Student"
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

    // Verify section heading is displayed
    await expect(page.locator('h1').filter({ hasText: `Review Section ${testNamespace}` })).toBeVisible();

    // ===== NAVIGATE TO STUDENTS TAB =====
    const studentsTab = page.locator('[role="tab"]').filter({ hasText: /Students/ });
    await expect(studentsTab).toBeVisible();
    await studentsTab.click();

    // Wait for the students table to appear
    const studentsTable = page.locator('[data-testid="students-table-container"]');
    await expect(studentsTable).toBeVisible({ timeout: 10000 });

    // ===== VERIFY STUDENT APPEARS WITH PROGRESS =====
    // Student name should appear as a link in the table
    const studentLink = studentsTable.locator(`a:has-text("${studentDisplayName}")`);
    await expect(studentLink).toBeVisible();

    // Progress column shows "Solved X · Started Y" (A6 InstructorSectionView reskin).
    // The student has started the problem (via getOrCreateStudentWork), so Started ≥ 1.
    const studentRow = studentsTable.locator('tr').filter({ hasText: studentDisplayName });
    await expect(studentRow.locator('td').filter({ hasText: /Solved \d+ · Started \d+/ })).toBeVisible();

    // ===== CLICK STUDENT TO VIEW THEIR WORK PAGE =====
    await studentLink.click();

    // Wait for the student work page to load
    await page.waitForURL(`/sections/${section.id}/students/**`, { timeout: 10000 });

    // Verify student name heading
    await expect(page.locator('h1').filter({ hasText: studentDisplayName })).toBeVisible({ timeout: 10000 });

    // B4 reskin: verify summary rail is present with expected stat fields.
    // Replaces the old "N / M problems started" paragraph.
    // The summary rail renders revision counts even when 0 — verifies the
    // stat row is always present regardless of session activity.
    const summaryRail = page.locator('[data-testid="summary-rail"]');
    await expect(summaryRail).toBeVisible({ timeout: 5000 });
    await expect(summaryRail.locator('text=Sessions attended')).toBeVisible();
    await expect(summaryRail.locator('text=Solved')).toBeVisible();
    await expect(summaryRail.locator('text=Total revisions')).toBeVisible();
    // Revision count cell is always rendered (B4 contract: summary-revisions testid)
    await expect(page.locator('[data-testid="summary-revisions"]')).toBeVisible();

    // ===== VERIFY PROBLEM CARD IS LISTED =====
    const problemCard = page.locator(`[data-testid="problem-card-${problem.id}"]`);
    await expect(problemCard).toBeVisible({ timeout: 10000 });

    // Problem title should be visible in the card
    await expect(problemCard.locator(`text=Review Problem ${testNamespace}`)).toBeVisible();

    // Student has started the problem — "Started" badge should be shown (green)
    await expect(problemCard.locator('span:has-text("Started")')).toBeVisible();

    // ===== CLICK PROBLEM CARD TO EXPAND AND VIEW CODE =====
    await problemCard.click();

    // Expanded section should show — either "No code yet" or actual code in pre > code
    // (getOrCreateStudentWork creates an empty entry; code field may be empty)
    const codeBlock = problemCard.locator('pre > code');
    const noCodeText = problemCard.locator('text=No code yet');

    // One of these two states must be visible after expand
    await expect(codeBlock.or(noCodeText)).toBeVisible({ timeout: 5000 });

    // ===== NAVIGATE BACK TO SECTION =====
    const backButton = page.locator('a:has-text("Back to Section"), button:has-text("Back to Section")');
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Wait for navigation back to the section page
    await page.waitForURL(`/sections/${section.id}`, { timeout: 10000 });

    // Verify we are back on the section page — instructor view
    await expect(page.locator('h1').filter({ hasText: `Review Section ${testNamespace}` })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible();
  });

  /**
   * Verifies that real WebSocket revisions created during a live session are
   * reflected as non-zero counts in the student detail page's summary rail and
   * per-session row. This test uses a multi-browser-context WebSocket session
   * (matching the pattern in session-lifecycle.spec.ts) so the student's Monaco
   * edits go through the Centrifugo sync path that creates real revision records.
   *
   * Contract verified: summary-revisions stat > 0; session row revision-count > 0.
   * Why it matters: eval-cej.7.12 previously punted on this, leaving a gap where
   * the summary rail stat could silently remain 0 for all students.
   * What breaks if violated: revision counts in the student detail page would
   * always show 0 regardless of actual student activity.
   */
  test('revision counts on student detail page reflect real websocket session activity', async ({
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

    const cls = await createClass(instructor.token, `Revision Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Revision Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Revision Problem ${testNamespace}`,
      description: 'A problem for revision count testing',
      starterCode: '# Write your solution\n',
    });

    await publishProblem(instructor.token, section.id, problem.id);

    // Start an active session so the student's Monaco edits go through the
    // WebSocket sync path (Centrifugo) and are recorded as revisions.
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    const student = await setupStudent(section.join_code, 'student-revision');

    // ===== STUDENT JOINS SESSION AND TYPES CODE (produces WebSocket revisions) =====
    // Use the same pattern as session-lifecycle: navigate directly via work_id.
    // This enters the live session workspace where Monaco edits trigger revision creation.
    await signInAs(page, student.email);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);
    await page.goto(`/student?work_id=${work.id}`);

    // Wait for editor to be ready and session to be live
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Live').first()).toBeVisible({ timeout: 10000 });

    // Let initial empty-code sync settle before typing to avoid races
    await page.waitForTimeout(800);

    // Type distinct code — Monaco executeEdits triggers onDidChangeModelContent
    // → debounced server sync (PUT /sessions/{id}/code) → revision buffer Record()
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'print("REVISION_COUNT_TEST_1")');

    // Wait for 500ms debounce + network round trip so the first PUT /sessions/{id}/code
    // lands and initialises the buffer entry for this student work.
    await page.waitForTimeout(1200);

    // Type a second edit.  The buffer marks dirty but does not flush yet (idleTimeout = 5 s).
    await setMonacoValue(page, 'print("REVISION_COUNT_TEST_2")');
    await page.waitForTimeout(1200);

    // End the session via API — this calls FlushSession() on the revision buffer which
    // immediately commits all dirty entries to the DB.  Without this step the buffer
    // holds the revision in memory and the student detail page sees 0.
    await completeSession(instructor.token, session.id);

    // ===== INSTRUCTOR NAVIGATES TO STUDENT DETAIL PAGE =====
    // Resolve the student's DB user_id via the section's student-progress endpoint
    // (avoids brittle UI navigation through the Students tab just to get the URL)
    const progressList = await listStudentProgress(instructor.token, section.id);
    const studentProgress = progressList.find((p) => p.email === student.email);
    if (!studentProgress) {
      throw new Error(`Student ${student.email} not found in section progress list`);
    }
    const studentUserId = studentProgress.user_id;

    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page-revision');

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto(`/sections/${section.id}/students/${studentUserId}`);

      // Wait for the student detail page to load
      await expect(
        instructorPage.locator('h1').filter({ hasText: 'E2E student-revision' })
      ).toBeVisible({ timeout: 15000 });

      // ===== ASSERT SUMMARY RAIL: total revisions > 0 =====
      const summaryRail = instructorPage.locator('[data-testid="summary-rail"]');
      await expect(summaryRail).toBeVisible({ timeout: 5000 });

      // Poll until the revision count updates — it may take a moment for the
      // page to fetch and render the session stats after navigation
      await expect.poll(
        async () => {
          const text = await instructorPage.locator('[data-testid="summary-revisions"]').textContent();
          return parseInt(text ?? '0', 10);
        },
        {
          timeout: 15000,
          message: 'summary-revisions stat should be > 0 after student typed code in a live session',
        }
      ).toBeGreaterThan(0);

      // ===== ASSERT PER-SESSION ROW: revision count > 0 =====
      // The session row for our specific session should show a non-zero count
      const sessionRow = instructorPage.locator(`[data-testid="session-row-${session.id}"]`);
      await expect(sessionRow).toBeVisible({ timeout: 5000 });

      const revisionCell = sessionRow.locator(`[data-testid="revision-count-${session.id}"]`);
      await expect(revisionCell).toBeVisible();

      await expect.poll(
        async () => {
          const text = await revisionCell.textContent();
          // revision count cell renders as "{n} revs"
          const match = (text ?? '').match(/(\d+)\s*revs/);
          return match ? parseInt(match[1], 10) : 0;
        },
        {
          timeout: 10000,
          message: 'per-session revision-count cell should be > 0 for the session in which the student typed',
        }
      ).toBeGreaterThan(0);
    } finally {
      await instructorContext.close();
    }
  });
});
