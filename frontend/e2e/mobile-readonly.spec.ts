/**
 * E2E tests for the G8 mobile read-only surfaces (420×820).
 *
 * v4 commits to a mobile read-only strategy: laptops do the real work, phones are
 * pass-through. This spec exercises the four mobile surfaces plus the single
 * /student workspace guard end-to-end at a real phone viewport.
 *
 * The Playwright config is Desktop-Chrome-only, so every test in this file opts
 * into a 420×820 viewport via `test.use({ viewport: ... })` at the describe level.
 *
 * What each test verifies (full strength — no presence-only downgrades):
 *  1. Landing — the join-code input renders and the card fits without horizontal scroll.
 *  2. Public problem — read-only Statement + Tests render AND the solve CTA is
 *     replaced by the OpenOnLaptop "Open on laptop to solve" + Copy-link affordance.
 *  3. Sign-in — the three OAuth providers stack ("Continue with …").
 *  4. Student section (live pointer) — the live card nudges to the laptop instead
 *     of presenting Join-now as the primary navigate-to-workspace action.
 *  5. /student guard — OpenOnLaptop ("Open this session on your laptop") renders and
 *     the workspace editor (Monaco) is NOT mounted on the guarded route.
 *
 * Why e2e matters here: the mobile swaps depend on useMobileViewport (a client
 * effect that corrects after the first frame) plus per-surface branching. Only a
 * real-viewport browser run catches a regression in that hydration/branch chain.
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  startSessionFromProblem,
} from './fixtures/api-setup';

const MOBILE_VIEWPORT = { width: 420, height: 820 };

/**
 * Asserts the document does not overflow horizontally at the current viewport.
 * A mobile surface that leaks a fixed width / non-fluid padding produces a
 * scrollWidth wider than the viewport — the classic "doesn't fit on a phone" bug.
 */
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    // Allow a 1px rounding slop.
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Mobile read-only surfaces (420×820)', () => {
  // Config is Desktop-Chrome-only; opt this whole file into a phone viewport.
  test.use({ viewport: MOBILE_VIEWPORT });

  test('landing renders the join-code input and fits without horizontal scroll', async ({ page }) => {
    await page.goto('/');

    // The join-code field is the primary job of the landing page (id preserved
    // across the responsive reskin).
    await expect(page.locator('#join-code')).toBeVisible({ timeout: 15000 });

    // The card must fit a 420px phone without horizontal overflow.
    await expectNoHorizontalOverflow(page);
  });

  test('public problem is read-only on mobile: Statement + Tests render, solve path swaps to OpenOnLaptop', async ({
    page,
    setupInstructor,
  }) => {
    test.setTimeout(45000);

    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Mobile Public Problem Class');
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Mobile Public Hero Problem',
      description: 'A problem for mobile read-only testing',
      language: 'python',
      starterCode: 'print("hello")\n',
      testCases: [
        {
          kind: 'io' as const,
          name: 'mobile hello test',
          input: '',
          expected_output: 'hello\n',
          order: 0,
        },
      ],
    });

    await page.goto(`/problems/${problem.id}`);

    // Read-only content stays visible on mobile: title, Statement, Tests.
    await expect(page.locator('text=Mobile Public Hero Problem')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Statement')).toBeVisible();
    await expect(page.locator('text=Tests')).toBeVisible();
    await expect(page.locator('text=mobile hello test')).toBeVisible();

    // The solve/practice CTA block is replaced by the OpenOnLaptop affordance.
    await expect(page.locator('text=Open on laptop to solve')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

    // The anonymous solve entry point (the "Sign in" CTA on a class-less public
    // problem) must NOT be presented on mobile — it is swapped out.
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    // …but a deep-linked anon mobile user is not dead-ended: a secondary
    // sign-in link rides on the OpenOnLaptop affordance.
    await expect(page.getByRole('link', { name: /you can still sign in/i })).toHaveAttribute(
      'href',
      '/auth/signin',
    );

    await expectNoHorizontalOverflow(page);
  });

  test('sign-in stacks the OAuth provider buttons on mobile', async ({ page }) => {
    await page.goto('/auth/signin');

    // The three social providers render as a stacked "Continue with …" set.
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Continue with GitHub/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Microsoft/i })).toBeVisible();

    // The footer escape hatch is still reachable.
    await expect(page.getByRole('link', { name: /Join as a student/i })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test('student section live card nudges to the laptop instead of presenting Join-now', async ({
    page,
    browser,
    testNamespace,
    setupInstructor,
    setupStudent,
    logCollector,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP: a live session so the section live card renders ==========
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `Mobile Live Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Mobile Live Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Mobile Live Problem ${testNamespace}`,
      description: 'A problem for mobile live-banner testing',
      starterCode: 'print("hi")\n',
    });
    await publishProblem(instructor.token, section.id, problem.id);
    const student = await setupStudent(section.join_code);

    // Start a live session from the problem so the section pointer is set and the
    // student section view shows the live card.
    const instructorContext = await browser.newContext();
    const instructorPage = await instructorContext.newPage();
    logCollector.attachPage(instructorPage, 'instructor-page');

    try {
      await signInAs(instructorPage, instructor.email);
      await startSessionFromProblem(instructor.token, section.id, problem.id);

      // ===== STUDENT VIEWS THE SECTION ON MOBILE ===============================
      await signInAs(page, student.email);
      await page.goto(`/sections/${section.id}`);

      // The live card renders (pointer is set) and nudges to the laptop: both the
      // nudge sub-copy and the OpenOnLaptop heading appear in the live state.
      await expect(
        page.getByText('Open this session on your laptop to participate.')
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.getByRole('heading', { name: 'Open this session on your laptop' })
      ).toBeVisible();
      // The OpenOnLaptop Copy-link affordance is present in the live card.
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

      // Mobile must NOT present the primary navigate-to-workspace Join action.
      await expect(page.getByRole('button', { name: /^Join now$/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Jump in$/ })).toHaveCount(0);

      await expectNoHorizontalOverflow(page);
    } finally {
      try {
        await instructorContext.close();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  test('/student workspace guard shows OpenOnLaptop and does NOT mount the editor on mobile', async ({
    page,
    setupInstructor,
  }) => {
    test.setTimeout(45000);

    // A signed-in user is needed to reach the (fullscreen) /student route at all.
    const instructor = await setupInstructor();
    await signInAs(page, instructor.email);

    // Navigate directly to the guarded workspace route on a mobile viewport.
    await page.goto('/student?work_id=mobile-guard-probe');

    // The guard renders the OpenOnLaptop affordance with the session-specific copy.
    await expect(
      page.getByRole('heading', { name: 'Open this session on your laptop' })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

    // The workspace editor (Monaco) must NEVER mount on the guarded mobile route.
    // Give the page a beat to settle so this isn't a false "not yet rendered" pass.
    await page.waitForTimeout(1000);
    await expect(page.locator('.monaco-editor')).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
  });
});
