import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, publishProblem, startSessionFromProblem } from './fixtures/api-setup';

/**
 * Session Start E2E Test
 *
 * Covers the instructor flow of starting a session via:
 *   (a) the section detail page UI (Create Session button on a problem card), and
 *   (b) the instructor home dashboard: start-session CTA + live-strip rejoin.
 *
 * The home-page tests verify B5 planned cases:
 *   - start-session-{sectionId} testid on the classes table row → modal → session URL
 *   - live strip renders "Live now" when an active session exists
 *   - rejoin-session-{sectionId} testid on the live strip → session URL
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
    await expect(page.locator('[data-testid="active-session-header"]')).toBeVisible({ timeout: 15000 });

    // Verify the session displays the correct section name
    const sectionName = `Session Start Section ${testNamespace}`;
    await expect(page.locator(`text=${sectionName}`)).toBeVisible({ timeout: 10000 });
  });

  /**
   * Verifies the instructor home dashboard start-session flow from the classes table.
   *
   * Contract: clicking start-session-{sectionId} on the classes table opens the
   * Start Session modal; completing it navigates to /instructor/session/...
   *
   * Why it matters: the B5 plan required home-page start-session coverage — the
   * only prior E2E test starts sessions from the section *detail* page.
   * What breaks if violated: the home dashboard start-session CTA becomes untested.
   */
  test('Instructor starts session from home dashboard classes table', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(60000);

    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Home Start Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Home Start Section ${testNamespace}`);

    await signInAs(page, instructor.email);
    await page.goto('/instructor');

    // Wait for the dashboard to load with the classes table
    await expect(page.locator('[data-testid="instructor-dashboard"]')).toBeVisible({ timeout: 15000 });

    // The section row's start-session button should be visible for idle sections
    const startBtn = page.locator(`[data-testid="start-session-${section.id}"]`);
    await expect(startBtn).toBeVisible({ timeout: 10000 });

    // Click the start-session button — this opens the StartSessionModal
    await startBtn.click();

    // The Start Session modal should appear with a "Start Session" heading
    await expect(page.locator('h2:has-text("Start Session")')).toBeVisible({ timeout: 10000 });

    // Select the "Create blank session" option in the modal
    await page.locator('button:has-text("Create blank session")').click();

    // Confirm the selection and start the session
    await page.locator('button:has-text("Start Session")').last().click();

    // Verify redirect to the active session page
    await page.waitForURL(/\/instructor\/session\//, { timeout: 15000 });
    await expect(page.locator('[data-testid="active-session-header"]')).toBeVisible({ timeout: 15000 });
  });

  /**
   * Verifies the instructor home dashboard live strip: when an active session exists,
   * the live strip renders "Live now" and the rejoin-session-{sectionId} button
   * navigates to the existing session page.
   *
   * Contract: rejoin-session-{sectionId} is keyed on the SECTION id (not session id),
   * because the live strip groups by section. Clicking it pushes to
   * /instructor/session/{sessionId} via the onRejoinSession handler.
   *
   * Why it matters: the B5 plan required live-strip rejoin coverage — it was a
   * planned case that was silently dropped.
   * What breaks if violated: the live-strip "Rejoin session" CTA becomes untested,
   * and regressions in onRejoinSession routing would be invisible.
   */
  test('Instructor home live strip shows active session and rejoin navigates to session', async ({ page, testNamespace, setupInstructor }) => {
    test.setTimeout(60000);

    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, `Live Strip Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Live Strip Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Live Strip Problem ${testNamespace}`,
      description: 'A problem for live strip testing',
      starterCode: '# Write your solution\n',
    });

    // Start a session via API so the dashboard shows the live strip
    const session = await startSessionFromProblem(instructor.token, section.id, problem.id);

    await signInAs(page, instructor.email);
    await page.goto('/instructor');

    // Wait for the dashboard to load
    await expect(page.locator('[data-testid="instructor-dashboard"]')).toBeVisible({ timeout: 15000 });

    // The live strip should render the "Live now" label for the active session
    await expect(page.locator('text=Live now')).toBeVisible({ timeout: 10000 });

    // The rejoin button is keyed by section id (not session id)
    const rejoinBtn = page.locator(`[data-testid="rejoin-session-${section.id}"]`);
    await expect(rejoinBtn).toBeVisible({ timeout: 10000 });

    // Clicking rejoin navigates to the session page
    await rejoinBtn.click();
    await page.waitForURL(new RegExp(`/instructor/session/${session.id}`), { timeout: 15000 });
    await expect(page.locator('[data-testid="active-session-header"]')).toBeVisible({ timeout: 15000 });
  });
});
