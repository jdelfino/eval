import { test, expect } from './fixtures/test-fixture';
import { signInAs, navigateToDashboard } from './fixtures/auth';
import { getSectionByJoinCode, createProblem, publishProblem, startSessionFromProblem } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue, getMonacoValue } from './fixtures/monaco';

/**
 * Critical Path E2E Tests
 *
 * These tests cover the complete end-to-end user journey:
 * 1. Instructor creates class and section
 * 2. Instructor starts a coding session
 * 3. Student joins section via join code
 * 4. Student participates in session and runs code
 *
 * And the code sync flow:
 * 1. Student modifies code in their editor
 * 2. Code is saved/synced to the server
 * 3. Instructor can view the student's code in real-time
 * 4. Code can be displayed on the public view
 *
 * These are the most important tests to maintain -- they verify the core
 * functionality that users depend on from start to finish.
 *
 * Per-test namespace isolation ensures tests do not interfere with each other.
 */

test.describe('Critical User Paths', () => {
  test('Complete workflow: Instructor setup and student participation', async ({ page, browser, setupInstructor, setupStudent, logCollector }) => {
    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // ===== INSTRUCTOR SETUP =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    // Capture browser console logs from instructor page
    logCollector.attachPage(instructorPage, 'instructor-page');

    // Monitor API requests for debugging
    instructorPage.on('request', (request) => {
      if (request.url().includes('/api/')) {
        console.log(`[API Request] ${request.method()} ${request.url()}`);
      }
    });
    instructorPage.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        const status = response.status();
        let body = '';
        try {
          body = await response.text();
          if (body.length > 500) body = body.substring(0, 500) + '...';
        } catch { /* ignore */ }
        console.log(`[API Response] ${response.status()} ${response.url()} - ${body}`);
      }
    });

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto('/instructor');

      // Wait for the instructor dashboard to load
      // New dashboard shows "Dashboard" heading or empty state with "Create Your First Class"
      await expect(
        instructorPage.locator('h2:has-text("Dashboard"), button:has-text("Create Your First Class")').first()
      ).toBeVisible();

      // Create class from dashboard
      const createClassButton = instructorPage
        .locator('button:has-text("New Class"), button:has-text("Create Your First Class")')
        .first();
      await createClassButton.click();
      // G7-T4 reskinned CreateClassModal onto the shared Modal primitive; the
      // title heading now uses the v4 copy "New class" (the old hand-rolled
      // "Create New Class" heading is gone). The footer submit button is
      // "Create class" (matched case-insensitively below).
      await expect(instructorPage.locator('h2:has-text("New class")')).toBeVisible();
      await instructorPage.fill('input#class-name', 'Test Class');
      await instructorPage.click('button:has-text("Create class")');

      // Wait for class to appear in dashboard table
      await expect(
        instructorPage.locator('td:has-text("Test Class"), div:has-text("Test Class")').first()
      ).toBeVisible();

      // Click the class name link to go to class details page where we can create sections
      await instructorPage.locator('a:has-text("Test Class")').first().click();

      // Wait for class details page to load
      await expect(instructorPage.locator('h1:has-text("Test Class")')).toBeVisible();

      // Create section from class details page
      const createSectionButton = instructorPage
        .locator('button:has-text("New Section"), button:has-text("Create First Section")')
        .first();
      await createSectionButton.click();

      // Fill in section form
      await expect(instructorPage.locator('input#section_name').first()).toBeVisible();
      await instructorPage.fill('input#section_name', 'Test Section');
      await instructorPage
        .locator('button[type="submit"]:has-text("Create"), button:has-text("Create Section")')
        .first()
        .click();

      // Wait for section to appear
      await expect(instructorPage.locator('text=Test Section').first()).toBeVisible();

      // Navigate back to dashboard
      await navigateToDashboard(instructorPage);
      await expect(instructorPage.locator('h2:has-text("Dashboard")')).toBeVisible();

      // The section should appear in the dashboard table with "Start Session" button
      await expect(instructorPage.locator('text=Test Section')).toBeVisible();

      // Get join code from dashboard table using data-testid
      const joinCodeElement = instructorPage.locator('[data-testid="join-code"]').first();
      await expect(joinCodeElement).toBeVisible();
      const joinCode = await joinCodeElement.textContent();
      if (!joinCode) {
        throw new Error('Could not find join code on dashboard page');
      }

      // Look up the section ID and class ID from the join code
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;
      const classId = sectionInfo.class.id;

      // Create problem, publish to section, and start session via API
      // (sessions started from real problems allow students to join via the section page banner)
      const problem = await createProblem(instructor.token, classId, {
        title: 'Hello World',
        description: 'Print hello world',
        starterCode: '# Write your solution\n',
      });
      await publishProblem(instructor.token, sectionId, problem.id);
      const session = await startSessionFromProblem(instructor.token, sectionId, problem.id);

      // ===== STUDENT FLOW =====
      // Register the student via the setupStudent fixture (creates user + enrolls in section)
      const student = await setupStudent(joinCode);

      // Navigate instructor to the session page
      await instructorPage.goto(`/instructor/session/${session.id}`);

      // Verify session view loaded
      await expect(instructorPage.locator('[data-testid="active-session-header"]')).toBeVisible();

      // Student signs in and navigates to their section detail page
      await signInAs(page, student.email);
      await page.goto(`/sections/${sectionId}`);

      // Wait for the active session with "Join Now" button to load
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible();

      // Click "Join Now" to join the active session
      await joinNowButton.click();

      // Verify student entered session (editor loads directly)
      await expect(page.locator('.monaco-editor')).toBeVisible();

      // Verify connected status (shown inline via ConnectionDot)
      await expect(page.locator('text=Live').first()).toBeVisible();

      // Verify the Run all button is present in the test rail (confirms workspace loaded)
      await expect(page.locator('[data-testid="workspace-run-all"]')).toBeVisible();

      // Success! The complete flow works:
      // - Instructor created class + section from dashboard
      // - Instructor started session from dashboard modal
      // - Student joined section and entered the active session
    } finally {
      await instructorContext.close();
    }
  });

  test('Student code sync: code changes sync to instructor and public view', async ({ page, browser, setupInstructor, setupStudent, logCollector }) => {
    // Extend timeout for this multi-page test
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();

    // ===== INSTRUCTOR SETUP =====
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    // Capture browser console logs from instructor page
    logCollector.attachPage(instructorPage, 'instructor-page');
    let publicViewPage: Awaited<ReturnType<typeof browser.newPage>> | undefined;

    try {
      await signInAs(instructorPage, instructor.email);
      await instructorPage.goto('/instructor');

      // Wait for dashboard to load
      await expect(
        instructorPage.locator('h2:has-text("Dashboard"), button:has-text("Create Your First Class")').first()
      ).toBeVisible();

      // Create class
      const createClassButton = instructorPage
        .locator('button:has-text("New Class"), button:has-text("Create Your First Class")')
        .first();
      await createClassButton.click();
      await instructorPage.fill('input#class-name', 'Sync Test Class');
      await instructorPage.click('button:has-text("Create Class")');
      await expect(
        instructorPage.locator('td:has-text("Sync Test Class"), div:has-text("Sync Test Class")').first()
      ).toBeVisible();

      // Go to class and create section
      await instructorPage.locator('a:has-text("Sync Test Class")').first().click();
      await expect(instructorPage.locator('h1:has-text("Sync Test Class")')).toBeVisible();

      const createSectionButton = instructorPage
        .locator('button:has-text("New Section"), button:has-text("Create First Section")')
        .first();
      await createSectionButton.click();
      await expect(instructorPage.locator('input#section_name').first()).toBeVisible();
      await instructorPage.fill('input#section_name', 'Sync Test Section');
      await instructorPage
        .locator('button[type="submit"]:has-text("Create"), button:has-text("Create Section")')
        .first()
        .click();
      await expect(instructorPage.locator('text=Sync Test Section').first()).toBeVisible();

      // Go back to dashboard and start session
      await navigateToDashboard(instructorPage);
      await expect(instructorPage.locator('h2:has-text("Dashboard")')).toBeVisible();

      // Get join code
      const joinCodeElement = instructorPage.locator('[data-testid="join-code"]').first();
      await expect(joinCodeElement).toBeVisible();
      const joinCode = await joinCodeElement.textContent();
      if (!joinCode) {
        throw new Error('Could not find join code');
      }

      // Look up the section ID and class ID from the join code
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;
      const classId = sectionInfo.class.id;

      // Create problem, publish to section, and start session via API
      const problem = await createProblem(instructor.token, classId, {
        title: 'Sync Test Problem',
        description: 'A problem for sync testing',
        starterCode: '# Write your solution\n',
      });
      await publishProblem(instructor.token, sectionId, problem.id);
      const session = await startSessionFromProblem(instructor.token, sectionId, problem.id);

      // Navigate instructor to the session page
      await instructorPage.goto(`/instructor/session/${session.id}`);
      await expect(instructorPage.locator('[data-testid="active-session-header"]')).toBeVisible();

      // ===== OPEN PUBLIC VIEW =====
      // Open public view in a new tab
      [publicViewPage] = await Promise.all([
        instructorPage.context().waitForEvent('page'),
        instructorPage.locator('button:has-text("Open Public View")').click(),
      ]);

      // Verify public view loads with initial state
      await expect(publicViewPage.locator(`text=${joinCode}`)).toBeVisible();
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible();

      // ===== STUDENT JOINS AND WRITES CODE =====
      // Register the student via the setupStudent fixture (creates user + enrolls in section)
      const student = await setupStudent(joinCode);

      await signInAs(page, student.email);
      await page.goto(`/sections/${sectionId}`);

      // Join active session (student is already enrolled via setupStudent)
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible();
      await joinNowButton.click();
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect(page.locator('text=Live').first()).toBeVisible();

      // Wait for initial empty code sync to complete (500ms debounce + buffer)
      // This prevents the initial empty code update from racing with our typed code
      await page.waitForTimeout(800);

      // ===== STUDENT TYPES CODE =====
      const studentCode = 'print("SYNC_TEST_12345")';
      await waitForMonacoReady(page);
      await setMonacoValue(page, studentCode);

      // Wait for debounced sync (500ms debounce + network time)
      await page.waitForTimeout(1000);

      // ===== VERIFY INSTRUCTOR SEES STUDENT ON THE LIVE DASHBOARD =====
      // The G4 dashboard surfaces joined students in the roster column. Dismiss
      // the post-launch strip first so it never overlays the grid.
      const stripDismiss = instructorPage.locator('[data-testid="session-launch-strip-dismiss"]');
      if (await stripDismiss.isVisible().catch(() => false)) {
        await stripDismiss.click();
      }
      await expect(instructorPage.locator('[data-testid="session-dashboard-grid"]')).toBeVisible({ timeout: 10000 });

      const studentDisplayName = 'E2E student';
      // The roster row for the student (Activity tab is the default).
      const rosterRow = instructorPage
        .locator('[data-testid^="student-row-"]')
        .filter({ hasText: studentDisplayName })
        .first();
      await expect(rosterRow).toBeVisible({ timeout: 15000 });

      // ===== FOCUS THE STUDENT → FOCUSED PANEL SHOWS THEIR LIVE CODE =====
      // Click the roster row to focus the student; the center focused panel embeds
      // a read-only workspace bound to that student's live code (replaces the old
      // "View" button + "{name}'s Code" header from SessionStudentPane).
      await rosterRow.click();
      const focusedPanel = instructorPage.locator('[data-testid="focused-student-panel"]');
      await expect(focusedPanel).toBeVisible({ timeout: 10000 });
      // The focused top bar carries the student's status line (unique element).
      await expect(focusedPanel.locator('[data-testid="focused-status-line"]')).toBeVisible({ timeout: 10000 });

      // Verify the focused panel's Monaco editor is displaying the student's code.
      await expect(focusedPanel.locator('.monaco-editor')).toBeVisible({ timeout: 10000 });
      await waitForMonacoReady(instructorPage);
      await expect.poll(() => getMonacoValue(instructorPage), {
        timeout: 10000,
        message: 'Monaco editor on the focused student panel should contain student code',
      }).toContain('SYNC_TEST');

      // ===== FEATURE STUDENT ON PUBLIC VIEW =====
      // Feature button lives in the focused panel's top bar (replaces the old
      // per-row Feature button on SessionStudentPane).
      const featureButton = focusedPanel.locator('[data-testid="focused-feature-button"]');
      await expect(featureButton).toBeVisible();
      await featureButton.click();

      // ===== VERIFY PUBLIC VIEW SHOWS STUDENT CODE =====

      // Verify "Featured Code" section is displayed
      await expect(publicViewPage.locator('text=Featured Code')).toBeVisible();

      // Verify Monaco editor is visible in public view
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible();

      // Verify the student's code content is visible on public view via the Monaco API
      await waitForMonacoReady(publicViewPage!);
      await expect.poll(() => getMonacoValue(publicViewPage!), {
        timeout: 10000,
        message: 'Monaco editor on public view should contain student code',
      }).toContain('SYNC_TEST');
    } finally {
      try {
        await publicViewPage?.close();
      } catch {
        /* ignore cleanup errors */
      }
      try {
        await instructorContext?.close();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });
});
