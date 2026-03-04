import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  getOrCreateStudentWork,
} from './fixtures/api-setup';

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

    // Progress column should show "1 / 1 problems" (1 problem published, 1 started)
    const studentRow = studentsTable.locator('tr').filter({ hasText: studentDisplayName });
    await expect(studentRow.locator('td').filter({ hasText: /\d+ \/ \d+ problems/ })).toBeVisible();

    // ===== CLICK STUDENT TO VIEW THEIR WORK PAGE =====
    await studentLink.click();

    // Wait for the student work page to load
    await page.waitForURL(`/sections/${section.id}/students/**`, { timeout: 10000 });

    // Verify student name heading
    await expect(page.locator('h1').filter({ hasText: studentDisplayName })).toBeVisible({ timeout: 10000 });

    // Verify progress summary
    await expect(page.locator('p').filter({ hasText: /\d+ \/ \d+ problems started/ })).toBeVisible();

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
});
