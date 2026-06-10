/**
 * E2E tests for the Public View feature (projector) and the public problem page.
 *
 * "Public View Feature" tests: the projector public display view instructors open during class.
 * "Public Problem Page" tests: the A3-reskinned /problems/:id route (unauthenticated).
 *   - Verifies the new hero layout (serif title, tag pills, meta line, tests list).
 *   - Regression guard: solution text must NEVER appear for a problem that has a solution.
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs, navigateToDashboard } from './fixtures/auth';
import { createClass, getSectionByJoinCode, createProblem, publishProblem, startSessionFromProblem } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

test.describe('Public View Feature', () => {
  test('Public view updates when instructor features different students', async ({ page, browser, setupInstructor, setupStudent }) => {
    // Increase timeout for this multi-actor test (instructor + student + public view)
    test.setTimeout(90_000);

    // ===== SETUP USERS VIA API =====
    const instructor = await setupInstructor();

    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    let publicViewPage: Awaited<ReturnType<typeof browser.newPage>> | undefined;

    try {
      // ===== INSTRUCTOR SETUP =====
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto('/instructor');

      // Wait for the instructor dashboard to load
      await expect(
        instructorPage.locator('h2:has-text("Dashboard"), button:has-text("Create Your First Class")').first()
      ).toBeVisible();

      // Create class from dashboard
      const createClassButton = instructorPage.locator(
        'button:has-text("New Class"), button:has-text("Create Your First Class")'
      ).first();
      await createClassButton.click();
      await instructorPage.fill('input#class-name', 'Test Class');
      await instructorPage.click('button:has-text("Create Class")');

      // Wait for class to appear in dashboard
      await expect(
        instructorPage.locator('td:has-text("Test Class"), div:has-text("Test Class")').first()
      ).toBeVisible();

      // Click the class name link to go to class details page
      await instructorPage.locator('a:has-text("Test Class")').first().click();
      await expect(instructorPage.locator('h1:has-text("Test Class")')).toBeVisible();

      // Create section from class details page
      const createSectionButton = instructorPage.locator(
        'button:has-text("New Section"), button:has-text("Create First Section")'
      ).first();
      await createSectionButton.click();
      await expect(instructorPage.locator('input#section_name').first()).toBeVisible();
      await instructorPage.fill('input#section_name', 'Test Section');
      await instructorPage.locator(
        'button[type="submit"]:has-text("Create"), button:has-text("Create Section")'
      ).first().click();
      await expect(instructorPage.locator('text=Test Section').first()).toBeVisible();

      // Navigate back to dashboard
      await navigateToDashboard(instructorPage);
      await expect(instructorPage.locator('h2:has-text("Dashboard")')).toBeVisible();
      await expect(instructorPage.locator('text=Test Section')).toBeVisible();

      // Get join code from dashboard table
      const joinCodeElement = instructorPage.locator('[data-testid="join-code"]').first();
      await expect(joinCodeElement).toBeVisible();
      const joinCode = await joinCodeElement.textContent();
      if (!joinCode) {
        throw new Error('Could not find join code on dashboard page');
      }

      // ===== STUDENT JOINS AND WRITES CODE =====
      // Register the student via the setupStudent fixture (creates user + enrolls in section)
      const student = await setupStudent(joinCode);

      // Look up the section ID and class ID from the join code
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;
      const classId = sectionInfo.class.id;

      // Create problem, publish to section, and start session via API
      // (sessions started from real problems allow students to join via the section page banner)
      const problem = await createProblem(instructor.token, classId, {
        title: 'Public View Problem',
        description: 'A problem for public view testing',
        starterCode: '# Write your solution\n',
      });
      await publishProblem(instructor.token, sectionId, problem.id);
      const session = await startSessionFromProblem(instructor.token, sectionId, problem.id);

      // Navigate instructor to the session page
      await instructorPage.goto(`/instructor/session/${session.id}`);

      // Verify session view loaded
      await expect(instructorPage.locator('[data-testid="active-session-header"]')).toBeVisible();

      // ===== OPEN PUBLIC VIEW =====
      [publicViewPage] = await Promise.all([
        instructorPage.context().waitForEvent('page'),
        instructorPage.locator('button:has-text("Open Public View")').click(),
      ]);

      // Verify public view loaded with join code visible
      await expect(publicViewPage.locator(`text=${joinCode}`)).toBeVisible();
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible();

      // Verify student list panel is visible on instructor page
      await expect(instructorPage.locator('h3:has-text("Connected Students")')).toBeVisible();

      await signInAs(page, student.email);
      await page.goto(`/sections/${sectionId}`);

      // Join active session (student is already enrolled via setupStudent)
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible();
      await joinNowButton.click();
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect(page.locator('text=Live').first()).toBeVisible();

      // Student types code in the Monaco editor using the programmatic API
      const studentCode = 'print("Hello from student!")';
      await waitForMonacoReady(page);
      await setMonacoValue(page, studentCode);

      // Wait for debounced code update (500ms debounce + network time)
      await page.waitForTimeout(1000);

      // ===== VERIFY INSTRUCTOR SEES STUDENT =====
      // Wait for student to appear - via Realtime broadcast or polling fallback
      await expect(instructorPage.locator('text=E2E student')).toBeVisible();

      // Click "Feature" button for this student
      const studentRow = instructorPage.locator('div:has-text("E2E student")').first();
      const featureBtn = studentRow.locator('button:has-text("Feature")');
      await featureBtn.click();

      // ===== VERIFY PUBLIC VIEW UPDATES =====
      // The public view should now show "Featured Code" title
      await expect(publicViewPage.locator('text=Featured Code')).toBeVisible();

      // Verify there is a Monaco editor visible with student code
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible();
    } finally {
      try {
        await publicViewPage?.close();
      } catch {
        /* ignore */
      }
      try {
        await instructorContext.close();
      } catch {
        /* ignore */
      }
    }
  });
});

/**
 * Public Problem Page (A3 hero reskin) — /problems/:id
 *
 * Verifies the unauthenticated public problem page after the A3 reskin and A1
 * solution-removal. These tests cover:
 *   1. The new hero: serif title, meta line, tests list visible to anonymous visitors.
 *   2. Regression guard (eval-e81): solution text NEVER appears on the public page even
 *      when the problem was created with a solution. This is the most important guard —
 *      if it fails, solution data is leaking to anonymous visitors.
 *
 * Why e2e matters here: the solution removal involves both the Go backend (dropping
 * the field from the SQL query) and the frontend (removing SolutionBlock). Only an
 * end-to-end test catches a regression in either layer.
 */
test.describe('Public Problem Page (A3)', () => {
  /**
   * Verifies the A3 hero layout and that the solution is never exposed publicly.
   *
   * Contract: GET /api/v1/public/problems/:id MUST NOT return a solution field,
   * and the page MUST NOT render any solution content regardless of what the
   * problem record stores. If this test fails, solution data is leaking to
   * anonymous (unauthenticated) visitors — a privacy regression.
   */
  test('A3 hero visible; solution content never appears on public page', async ({ page, setupInstructor }) => {
    test.setTimeout(30000);

    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `Public Page Class`);

    // Create a problem WITH a solution so we can verify it never leaks publicly
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Public Hero Test Problem',
      description: 'A problem for public page testing',
      language: 'python',
      starterCode: 'print("hello")\n',
      solution: 'SOLUTION_SENTINEL_TEXT_DO_NOT_SHOW',
      tags: ['e2e', 'public'],
    });

    // Visit the public problem page as an anonymous user (no sign-in)
    await page.goto(`/problems/${problem.id}`);

    // ── Hero: serif title must be visible ──────────────────────────────────
    await expect(page.locator('text=Public Hero Test Problem')).toBeVisible({ timeout: 15000 });

    // ── Meta line: should contain language (python) ────────────────────────
    // The meta line reads "python 3.11 · N tests · authored by X · updated <date>"
    await expect(page.locator('text=python')).toBeVisible();

    // ── Tag pills should be visible ────────────────────────────────────────
    // Use :text-is() for exact-match to avoid strict-mode violations when the
    // instructor display name also contains "e2e" as a substring.
    await expect(page.locator(':text-is("e2e")').first()).toBeVisible();
    await expect(page.locator(':text-is("public")').first()).toBeVisible();

    // ── REGRESSION GUARD: solution sentinel text must NOT appear anywhere ──
    // This assertion is the primary regression guard for eval-e81 / A1 / A3.
    // Any text containing the sentinel string would indicate a solution leak.
    await expect(page.locator('text=SOLUTION_SENTINEL_TEXT_DO_NOT_SHOW')).not.toBeVisible();

    // Also verify the page HTML does not contain the sentinel in any form
    // (guards against server-side rendering leaking it in a non-visible element)
    const pageContent = await page.content();
    if (pageContent.includes('SOLUTION_SENTINEL_TEXT_DO_NOT_SHOW')) {
      throw new Error(
        'REGRESSION: Solution sentinel text found in page HTML — solution is leaking publicly!'
      );
    }
  });
});
