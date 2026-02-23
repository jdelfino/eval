import { test, expect } from './fixtures/test-fixture';
import { signInAs, navigateToDashboard } from './fixtures/auth';
import { registerStudent, getSectionByJoinCode } from './fixtures/api-setup';

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
  test('Complete workflow: Instructor setup and student participation', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const studentExternalId = `student-${testNamespace}`;
    const studentEmail = `${studentExternalId}@test.local`;

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
      await expect(instructorPage.locator('h2:has-text("Create New Class")')).toBeVisible();
      await instructorPage.fill('input#class-name', 'Test Class');
      await instructorPage.click('button:has-text("Create Class")');

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

      // Click "Start Session" to open the modal
      await instructorPage.locator('button:has-text("Start Session")').first().click();

      // Wait for the Start Session modal
      await expect(instructorPage.locator('h2:has-text("Start Session")')).toBeVisible();

      // Click "Create blank session" option to enable the Start Session button
      await instructorPage.locator('button:has-text("Create blank session")').click();

      // Wait for Start Session button to be enabled, then click it
      await expect(
        instructorPage.locator('button:has-text("Start Session"):not([disabled])').last()
      ).toBeEnabled();
      await instructorPage.locator('button:has-text("Start Session"):not([disabled])').last().click();

      // Wait for navigation to session page
      await expect(instructorPage).toHaveURL(/\/instructor\/session\//, {});

      // Verify session view loaded
      await expect(instructorPage.locator('h2:has-text("Active Session")')).toBeVisible();

      // ===== STUDENT FLOW =====
      // Register the student via API (creates user + enrolls in section)
      await registerStudent(joinCode, studentExternalId, studentEmail, 'E2E Student');

      // Look up the section ID from the join code so we can navigate directly
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;

      // Student signs in and navigates to their section detail page
      await signInAs(page, studentEmail);
      await page.goto(`/sections/${sectionId}`);

      // Wait for the active session with "Join Now" button to load
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible();

      // Click "Join Now" to join the active session
      await joinNowButton.click();

      // Verify student entered session (editor loads directly)
      await expect(page.locator('.monaco-editor')).toBeVisible();

      // Verify connected status (shown in global header badge)
      await expect(page.locator('text=Connected')).toBeVisible();

      // Verify the Run Code button is present (confirms editor loaded)
      await expect(page.locator('button:has-text("Run Code")')).toBeVisible();

      // Success! The complete flow works:
      // - Instructor created class + section from dashboard
      // - Instructor started session from dashboard modal
      // - Student joined section and entered the active session
    } finally {
      await instructorContext.close();
    }
  });

  test('Student code sync: code changes sync to instructor and public view', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
    // Extend timeout for this multi-page test
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const studentExternalId = `student-${testNamespace}`;
    const studentEmail = `${studentExternalId}@test.local`;

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

      // Start session
      await instructorPage.locator('button:has-text("Start Session")').first().click();
      await expect(instructorPage.locator('h2:has-text("Start Session")')).toBeVisible();
      await instructorPage.locator('button:has-text("Create blank session")').click();
      await expect(
        instructorPage.locator('button:has-text("Start Session"):not([disabled])').last()
      ).toBeEnabled();
      await instructorPage.locator('button:has-text("Start Session"):not([disabled])').last().click();
      await expect(instructorPage).toHaveURL(/\/instructor\/session\//, {});
      await expect(instructorPage.locator('h2:has-text("Active Session")')).toBeVisible();

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
      // Register the student via API (creates user + enrolls in section)
      await registerStudent(joinCode, studentExternalId, studentEmail, 'E2E Student');

      // Look up the section ID from the join code so we can navigate directly
      const sectionInfo = await getSectionByJoinCode(joinCode);
      const sectionId = sectionInfo.section.id;

      await signInAs(page, studentEmail);
      await page.goto(`/sections/${sectionId}`);

      // Join active session (student is already enrolled via registerStudent)
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible();
      await joinNowButton.click();
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect(page.locator('text=Connected')).toBeVisible();

      // Wait for initial empty code sync to complete (500ms debounce + buffer)
      // This prevents the initial empty code update from racing with our typed code
      await page.waitForTimeout(800);

      // ===== STUDENT TYPES CODE =====
      const studentCode = 'print("SYNC_TEST_12345")';
      const monacoEditor = page.locator('.monaco-editor').first();
      await monacoEditor.click();
      // Clear any existing code first (select all and delete)
      await page.keyboard.press('ControlOrMeta+a');
      await page.waitForTimeout(200);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
      // Type the new code slowly to ensure Monaco captures it
      await page.keyboard.type(studentCode, { delay: 50 });

      // Wait for debounced sync (500ms debounce + network time)
      await page.waitForTimeout(2000);

      // ===== VERIFY INSTRUCTOR SEES STUDENT WITH CODE =====
      // Student should appear in the connected students list
      const studentDisplayName = 'E2E Student';
      await expect(instructorPage.locator(`text=${studentDisplayName}`)).toBeVisible();

      // Wait for the "In progress" badge to appear -- this confirms the code synced
      const studentRow = instructorPage.locator(`div.border:has-text("${studentDisplayName}")`).first();
      await expect(studentRow.locator('text=In progress')).toBeVisible();

      // ===== VERIFY INSTRUCTOR CAN VIEW STUDENT CODE =====
      // Click "View" button to see student's code
      const viewButton = studentRow.locator('button:has-text("View")').first();
      await viewButton.click();

      // Wait for code editor to load with student's code
      await expect(instructorPage.locator(`text=${studentDisplayName}'s Code`)).toBeVisible();

      // Verify the actual code content is visible in the Monaco editor
      await expect(instructorPage.locator('.monaco-editor')).toBeVisible();

      // Verify the Monaco editor is displaying student code
      // Monaco splits text across elements, so check normalized text content
      const codeInEditor = await instructorPage.evaluate(() => {
        const editorArea = document.querySelector('.monaco-editor');
        if (!editorArea) return false;
        const text = editorArea.textContent?.replace(/\s/g, '') || '';
        return text.includes('SYNC_TEST') || text.includes('print');
      });
      expect(codeInEditor).toBe(true);

      // ===== FEATURE STUDENT ON PUBLIC VIEW =====
      // Click "Feature" button to show student code on public view
      const featureButton = studentRow.locator('button:has-text("Feature")');
      await featureButton.click();

      // ===== VERIFY PUBLIC VIEW SHOWS STUDENT CODE =====

      // Verify "Featured Code" section is displayed
      await expect(publicViewPage.locator('text=Featured Code')).toBeVisible();

      // Verify Monaco editor is visible in public view
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible();

      // Verify the student's code content is visible on public view
      // Use polling assertion — Monaco renders asynchronously, so a one-shot
      // evaluate() can race against the editor populating its DOM.
      await expect.poll(async () => {
        return publicViewPage!.evaluate(() => {
          const editorArea = document.querySelector('.monaco-editor');
          if (!editorArea) return false;
          const text = editorArea.textContent?.replace(/\s/g, '') || '';
          return text.includes('SYNC_TEST') || text.includes('print');
        });
      }, { timeout: 10000, message: 'Monaco editor on public view should contain student code' }).toBe(true);
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
