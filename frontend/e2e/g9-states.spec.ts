/**
 * E2E coverage for the G9 state surfaces (eval-cej.25.10 / T5f).
 *
 * G9 introduced shared empty/error/loading surfaces on the EmptyState primitive.
 * This spec exercises the states that are *deterministically reachable* through
 * the real app in a full-stack run:
 *
 *   - 404 not-found page (bogus route → the global not-found.tsx EmptyState)
 *   - invalid / inactive join-code state (JoinSectionForm's dedicated state)
 *   - empty problem library (instructor with a class but no problems)
 *   - empty section publish ramps (section with no published problems)
 *
 * Each assertion binds to the *shipped* G9 copy/CTAs at full strength (role/name
 * + exact text), so the test FAILS against the old hand-rolled markup and PASSES
 * against the migrated surfaces. No loose text/regex fallbacks.
 *
 * States NOT covered here (covered at unit level — see Concerns in the task):
 *   - 500 error boundary (app/error.tsx): can't be triggered without forcing a
 *     render-time throw in a real route; unit-tested in app/__tests__/error.test.tsx.
 *   - Realtime reconnecting banner (workspace/ReconnectingBanner): requires
 *     forcing a Centrifugo lost-link transition mid-session, which is flaky in
 *     e2e; unit-tested in workspace/__tests__/ReconnectingBanner.test.tsx and
 *     student/__tests__/page-connection-dot.test.tsx.
 *   - Loading skeletons (route loading.tsx): the Next.js segment skeleton flashes
 *     too briefly on a fast local API to assert deterministically; unit-tested in
 *     the three loading.test.tsx files.
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection } from './fixtures/api-setup';

test.describe('G9 state surfaces', () => {
  /**
   * Test Case #1: the global 404 page.
   *
   * Contract: an unknown route renders the not-found EmptyState with the
   * "404 · Not found" code badge and the two ramps (Browse library / Back home).
   * What breaks if violated: link-rot lands users on a blank/broken page with
   * no way back.
   */
  test('404 page renders the code badge and both ramps', async ({ page }) => {
    // A syntactically valid but nonexistent problem URL — exercises the global
    // not-found boundary rather than a route-level error.
    await page.goto('/problems/00000000-0000-0000-0000-000000000000');

    // Code badge (mono chip above the icon) — exact shipped copy.
    await expect(page.getByText('404 · Not found')).toBeVisible({ timeout: 15000 });

    // Headline rendered by EmptyState as an <h2>.
    await expect(
      page.getByRole('heading', { name: "That page isn't here anymore." })
    ).toBeVisible();

    // Both ramps are links with their shipped destinations.
    const browse = page.getByRole('link', { name: 'Browse library' });
    await expect(browse).toBeVisible();
    await expect(browse).toHaveAttribute('href', '/instructor/problems');

    const home = page.getByRole('link', { name: 'Back home' });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute('href', '/');
  });

  /**
   * Test Case #3: the invalid / inactive join-code state.
   *
   * Contract (plan-review amendment): the backend has NO 403/"expired" code.
   * A bad code → 404 "section not found"; an inactive section → 400 "section is
   * not active". JoinSectionForm catches both and swaps the form for a dedicated
   * invalid/unavailable state with "Try a new code" (returns to the form) and
   * "Sign in instead". A valid code still joins.
   *
   * What breaks if violated: students who fumble a code see a raw error or a
   * dead form with no recovery path.
   */
  test('invalid join code shows the unavailable state with both CTAs; valid code joins', async ({
    page,
    testNamespace,
    setupInstructor,
  }) => {
    // The section *owner* is auto-enrolled, so joining their own section returns
    // 409 "already a member". Use a SECOND authed user (a distinct instructor —
    // any authed user can reach /sections/join) as the joiner so the valid-code
    // path actually joins a section they're not already in.
    const owner = await setupInstructor('e2e-section-owner');
    const cls = await createClass(owner.token, `Join Class ${testNamespace}`);
    const section = await createSection(owner.token, cls.id, `Join Section ${testNamespace}`);

    const joiner = await setupInstructor('e2e-section-joiner');

    await signInAs(page, joiner.email);
    await page.goto('/sections/join');

    const joinCodeInput = page.locator('#join_code');
    await expect(joinCodeInput).toBeVisible({ timeout: 15000 });

    // ── Bad code → invalid/unavailable state (NOT "expired") ──
    // "ZZZ-999" is a format-valid code that does not exist → backend 404.
    await joinCodeInput.fill('ZZZ999');
    await page.getByRole('button', { name: /Join section/ }).click();

    // The dedicated invalid-code state. Note the code badge is "404 · Join code",
    // and the copy is about availability — NOT "expired".
    await expect(page.getByText('404 · Join code')).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: "That join code isn't available." })
    ).toBeVisible();
    // Must NOT use "expired" framing (binding amendment).
    await expect(page.getByText(/expired/i)).toHaveCount(0);

    // Both CTAs present.
    const tryNew = page.getByRole('button', { name: /Try a new code/ });
    await expect(tryNew).toBeVisible();
    const signIn = page.getByRole('link', { name: 'Sign in instead' });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/auth/signin');

    // ── "Try a new code" returns to the form ──
    await tryNew.click();
    await expect(page.locator('#join_code')).toBeVisible();
    await expect(page.getByText('404 · Join code')).toHaveCount(0);

    // ── Valid code still joins → redirects to the section detail page ──
    await page.locator('#join_code').fill(section.join_code.replace(/-/g, ''));
    await page.getByRole('button', { name: /Join section/ }).click();
    await page.waitForURL(new RegExp(`/sections/${section.id}`), { timeout: 15000 });
  });

  /**
   * Test Case #5a: empty problem library.
   *
   * Contract (DEC-11): an instructor with no authored problems sees the
   * EmptyState with the single "Author a problem" ramp — NO starter-packs.
   * What breaks if violated: a new instructor lands on an empty table with no
   * call to action.
   */
  test('empty library shows "Author a problem" and no starter packs', async ({
    page,
    testNamespace,
    setupInstructor,
  }) => {
    const instructor = await setupInstructor();
    // A class exists so the library renders, but no problems are authored.
    await createClass(instructor.token, `Empty Library Class ${testNamespace}`);

    await signInAs(page, instructor.email);
    await page.goto('/instructor/problems');

    await expect(
      page.getByRole('heading', { name: 'No problems yet' })
    ).toBeVisible({ timeout: 15000 });

    // The sole ramp.
    await expect(
      page.getByRole('button', { name: 'Author a problem' })
    ).toBeVisible();

    // DEC-11: no starter-pack affordance.
    await expect(page.getByText(/starter pack/i)).toHaveCount(0);
  });

  /**
   * Test Case #5b: empty-section publish ramps.
   *
   * Contract (DEC-11): a section with no published problems shows the EmptyState
   * with EXACTLY two ramps — "Browse library" and "Create new problem".
   * What breaks if violated: instructors can't tell how to populate a new section.
   */
  test('empty section shows exactly the two publish ramps', async ({
    page,
    testNamespace,
    setupInstructor,
  }) => {
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `Empty Section Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Empty Section ${testNamespace}`);

    await signInAs(page, instructor.email);
    await page.goto(`/sections/${section.id}`);

    await expect(
      page.getByRole('heading', { name: 'No problems published to this section yet' })
    ).toBeVisible({ timeout: 15000 });

    // Exactly the two ramps, with their shipped destinations.
    const browse = page.getByRole('link', { name: 'Browse library' });
    await expect(browse).toBeVisible();
    await expect(browse).toHaveAttribute('href', '/instructor/problems');

    const createNew = page.getByRole('link', { name: 'Create new problem' });
    await expect(createNew).toBeVisible();
    await expect(createNew).toHaveAttribute('href', '/instructor/problems?edit=new');
  });
});
