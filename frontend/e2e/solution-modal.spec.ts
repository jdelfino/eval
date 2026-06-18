import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, createProblem, publishProblem } from './fixtures/api-setup';

/**
 * Solution Viewer Modal E2E (G7-T5).
 *
 * Exercises the consolidated SolutionViewerModal — the single component that
 * replaced the two former inline solution viewers (instructor
 * `solution-viewer-modal` in SessionProblemEditor and the student `SolutionModal`
 * in StudentSectionView). It is built on the Modal + Tabs primitives with exactly
 * two tabs (solution.py + diff vs. last revision; DEC-10: no Notes tab).
 *
 * Contract verified here, in a real browser:
 *   - Opening a released reference solution renders the modal with the preserved
 *     `solution-viewer-modal` testid AND role="dialog".
 *   - The code tab (solution.py) shows the reference solution source.
 *   - The diff tab degrades gracefully to "No prior revision to compare" when the
 *     viewer has no session revision context (the explicitly required fallback —
 *     a student opening a released solution for a problem they have not worked on
 *     in a live session has no last revision to diff against).
 *   - No "Notes" tab is present (DEC-10).
 *
 * Why it matters: the T5 consolidation deleted two inline modals and routed both
 * call sites through one component. A regression in the testid/role, the tab set,
 * or the diff fallback would silently break the student "View Solution" affordance
 * and the instructor solution viewer at once. What breaks if violated: students
 * lose access to released reference solutions, or the diff tab throws instead of
 * degrading.
 *
 * Seed support note: the existing API fixtures fully support a released solution
 * (createProblem accepts `solution`; publishProblem accepts `showSolution=true`),
 * so no seed-data change is required for this flow.
 */

test.describe('Solution Viewer Modal', () => {
  test('Student opens a released reference solution: code tab shows solution, diff tab degrades gracefully', async ({
    page,
    testNamespace,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(60000);

    const SOLUTION_SOURCE = 'def solve():\n    return 42  # SOLUTION_VIEWER_E2E\n';

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const problemTitle = `Solution Viewer Problem ${testNamespace}`;

    const cls = await createClass(instructor.token, `Solution Viewer Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Solution Viewer Section ${testNamespace}`);
    const problem = await createProblem(instructor.token, cls.id, {
      title: problemTitle,
      description: 'A problem whose reference solution is released to students',
      starterCode: '# Write your solution\n',
      solution: SOLUTION_SOURCE,
    });

    // Register the student in the section.
    const student = await setupStudent(section.join_code);

    // Publish the problem to the section WITH the solution released (show_solution=true).
    await publishProblem(instructor.token, section.id, problem.id, true);

    // ===== STUDENT NAVIGATES TO THE SECTION =====
    await signInAs(page, student.email);
    await page.goto(`/sections/${section.id}`);

    // The published problem appears in the student's section view.
    await expect(page.locator(`text=${problemTitle}`)).toBeVisible({ timeout: 15000 });

    // "View Solution" is rendered because the solution was released.
    const viewSolutionButton = page.locator('button:has-text("View Solution")');
    await expect(viewSolutionButton).toBeVisible({ timeout: 10000 });
    await viewSolutionButton.click();

    // ===== MODAL OPENS — preserved testid + role=dialog =====
    const modal = page.locator('[data-testid="solution-viewer-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Title heading uses the v4 consolidated copy "Reference solution · <problem>".
    await expect(
      page.getByRole('heading', { name: `Reference solution · ${problemTitle}` })
    ).toBeVisible();

    // ===== CODE TAB (default) shows the reference solution =====
    await expect(modal.getByRole('tab', { name: 'solution.py' })).toBeVisible();
    await expect(modal.locator('text=SOLUTION_VIEWER_E2E')).toBeVisible();

    // DEC-10: exactly two tabs, no "Notes" tab.
    await expect(modal.getByRole('tab')).toHaveCount(2);
    await expect(modal.getByRole('tab', { name: /notes/i })).toHaveCount(0);

    // ===== DIFF TAB degrades gracefully (no session revision context) =====
    await modal.getByRole('tab', { name: 'vs. last revision' }).click();
    await expect(modal.locator('text=No prior revision to compare')).toBeVisible({ timeout: 5000 });
    // The reference solution should NOT render in the diff tab fallback state.
    await expect(modal.locator('text=SOLUTION_VIEWER_E2E')).toHaveCount(0);
  });
});
