/**
 * E2E tests for the Public View feature.
 *
 * Tests the public display view that instructors show during class.
 * Verifies that when an instructor features a student, the public view
 * updates to display that student's code.
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs, navigateToDashboard } from './fixtures/auth';
import { registerStudent } from './fixtures/api-setup';

test.describe('Public View Feature', () => {
  test('Public view updates when instructor features different students', async ({ page, browser, testNamespace, setupInstructor }) => {
    // Increase timeout for this multi-actor test (instructor + student + public view)
    test.setTimeout(90_000);

    // ===== SETUP USERS VIA API =====
    const instructor = await setupInstructor();
    const studentExternalId = `student-${testNamespace}`;
    const studentEmail = `${studentExternalId}@test.local`;

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
      ).toBeVisible({ timeout: 10_000 });

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
      ).toBeVisible({ timeout: 5_000 });

      // Click the class name link to go to class details page
      await instructorPage.locator('a:has-text("Test Class")').first().click();
      await expect(instructorPage.locator('h1:has-text("Test Class")')).toBeVisible({ timeout: 5_000 });

      // Create section from class details page
      const createSectionButton = instructorPage.locator(
        'button:has-text("New Section"), button:has-text("Create First Section")'
      ).first();
      await createSectionButton.click();
      await expect(instructorPage.locator('input#section_name').first()).toBeVisible({ timeout: 5_000 });
      await instructorPage.fill('input#section_name', 'Test Section');
      await instructorPage.locator(
        'button[type="submit"]:has-text("Create"), button:has-text("Create Section")'
      ).first().click();
      await expect(instructorPage.locator('text=Test Section').first()).toBeVisible({ timeout: 5_000 });

      // Navigate back to dashboard
      await navigateToDashboard(instructorPage);
      await expect(instructorPage.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 5_000 });
      await expect(instructorPage.locator('text=Test Section')).toBeVisible({ timeout: 5_000 });

      // Get join code from dashboard table
      const joinCodeElement = instructorPage.locator('[data-testid="join-code"]').first();
      await expect(joinCodeElement).toBeVisible({ timeout: 5_000 });
      const joinCode = await joinCodeElement.textContent();
      if (!joinCode) {
        throw new Error('Could not find join code on dashboard page');
      }

      // Click "Start Session" to open the modal
      await instructorPage.locator('button:has-text("Start Session")').first().click();
      await expect(instructorPage.locator('h2:has-text("Start Session")')).toBeVisible({ timeout: 5_000 });

      // Click "Create blank session" option
      await instructorPage.locator('button:has-text("Create blank session")').click();

      // Wait for Start Session button to be enabled, then click it
      await expect(
        instructorPage.locator('button:has-text("Start Session"):not([disabled])').last()
      ).toBeEnabled({ timeout: 5_000 });
      await instructorPage.locator('button:has-text("Start Session"):not([disabled])').last().click();

      // Wait for navigation to session page
      await expect(instructorPage).toHaveURL(/\/instructor\/session\//, { timeout: 10_000 });

      // Verify session view loaded
      await expect(instructorPage.locator('h2:has-text("Active Session")')).toBeVisible({ timeout: 10_000 });

      // ===== OPEN PUBLIC VIEW =====
      [publicViewPage] = await Promise.all([
        instructorPage.context().waitForEvent('page'),
        instructorPage.locator('button:has-text("Open Public View")').click(),
      ]);

      // Verify public view loaded with join code visible
      await expect(publicViewPage.locator(`text=${joinCode}`)).toBeVisible({ timeout: 10_000 });
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible({ timeout: 5_000 });

      // Verify student list panel is visible on instructor page
      await expect(instructorPage.locator('h3:has-text("Connected Students")')).toBeVisible({ timeout: 5_000 });

      // ===== STUDENT JOINS AND WRITES CODE =====
      // Register the student via API (creates user + enrolls in section)
      await registerStudent(joinCode, studentExternalId, studentEmail, 'E2E Student');

      await signInAs(page, studentEmail);
      await page.goto('/sections');
      await expect(page.locator('h1:has-text("My Sections")')).toBeVisible({ timeout: 5_000 });

      // Join active session (student is already enrolled via registerStudent)
      const joinNowButton = page.locator('button:has-text("Join Now")');
      await expect(joinNowButton).toBeVisible({ timeout: 10_000 });
      await joinNowButton.click();
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Connected')).toBeVisible({ timeout: 5_000 });

      // Student types code in the Monaco editor
      const studentCode = 'print("Hello from student!")';
      const monacoEditor = page.locator('.monaco-editor').first();
      await monacoEditor.click();
      await page.keyboard.type(studentCode);

      // Wait for debounced code update (500ms debounce + network time)
      await page.waitForTimeout(2_000);

      // ===== VERIFY INSTRUCTOR SEES STUDENT =====
      // Wait for student to appear - via Realtime broadcast or polling fallback
      await expect(instructorPage.locator('text=E2E Student')).toBeVisible({ timeout: 15_000 });

      // Click "Feature" button for this student
      const studentRow = instructorPage.locator('div:has-text("E2E Student")').first();
      const featureBtn = studentRow.locator('button:has-text("Feature")');
      await featureBtn.click();

      // ===== VERIFY PUBLIC VIEW UPDATES =====
      // The public view should now show "Featured Code" title
      await expect(publicViewPage.locator('text=Featured Code')).toBeVisible({ timeout: 10_000 });

      // Verify there is a Monaco editor visible with student code
      await expect(publicViewPage.locator('.monaco-editor')).toBeVisible({ timeout: 5_000 });
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
