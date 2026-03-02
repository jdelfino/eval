import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, publishProblem } from './fixtures/api-setup';

/**
 * Session Start E2E Test
 *
 * Covers the instructor flow of starting a session via the section detail page UI.
 * Existing tests create sessions via API — this test exercises the actual instructor
 * UI path that instructors use every class (problem selector → session creation).
 *
 * Flow:
 * 1. Create class, section, problem via API; publish problem to section via API
 * 2. Instructor navigates to section detail page
 * 3. Click "Create Session" button on a published problem in the Problems tab
 * 4. Verify redirect to active session page
 * 5. Verify session is active with the correct problem title
 */

test.describe('Session Start via UI', () => {
  test('Instructor starts session from section page', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(60000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const problemTitle = `Session Start Problem ${testNamespace}`;

    const cls = await createClass(instructor.token, `Session Start Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Session Start Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: problemTitle,
      description: 'A problem for session start testing',
      starterCode: '# Write your solution\nprint("hello")\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);

    // ===== SIGN IN AND NAVIGATE TO SECTION DETAIL =====
    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    // Wait for the instructor section view to load
    await expect(page.locator('button:has-text("Preview as Student")')).toBeVisible({ timeout: 15000 });

    // ===== VERIFY PROBLEMS TAB SHOWS THE PUBLISHED PROBLEM =====
    // The "Problems" tab is active by default — verify the published problem appears
    await expect(page.locator(`text=${problemTitle}`)).toBeVisible({ timeout: 10000 });

    // ===== CLICK "CREATE SESSION" ON THE PROBLEM =====
    // Find the "Create Session" button for the specific problem card
    const problemCard = page.locator(`div:has-text("${problemTitle}")`).filter({ has: page.locator('button:has-text("Create Session")') }).first();
    const createSessionButton = problemCard.locator('button:has-text("Create Session")');
    await expect(createSessionButton).toBeVisible({ timeout: 10000 });
    await createSessionButton.click();

    // ===== VERIFY REDIRECT TO ACTIVE SESSION PAGE =====
    // After clicking "Create Session", the instructor is redirected to the session dashboard
    await page.waitForURL(/\/instructor\/session\//, { timeout: 15000 });

    // ===== VERIFY SESSION IS ACTIVE WITH CORRECT PROBLEM TITLE =====
    await expect(page.locator('h2:has-text("Active Session")')).toBeVisible({ timeout: 15000 });

    // Verify the session displays the correct problem title
    await expect(page.locator(`text=${problemTitle}`)).toBeVisible({ timeout: 10000 });
  });
});
