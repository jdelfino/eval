import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  getOrCreateStudentWork,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

/**
 * IO Test Case Execution E2E Tests
 *
 * Covers the primary student workflow introduced by PLAT-oztv:
 * - Instructor defines test cases on a problem
 * - Student opens the Cases panel, runs a case, sees Pass/Fail result
 * - Student adds a custom (run-only) case and executes it
 * - Run All executes every case and populates results
 *
 * Uses Python for speed. Java is covered by session-lifecycle.spec.ts.
 */

test.describe('IO Test Case Execution', () => {
  /**
   * Test 1: Instructor test cases → student runs a case → sees Pass/Fail.
   *
   * Flow:
   * 1. Create problem with two instructor test cases (one pass, one fail)
   * 2. Publish to section, create student work
   * 3. Student opens workspace → opens Cases panel
   * 4. Student selects the passing case and clicks its run button
   * 5. Output area shows "Pass"
   * 6. Student selects the failing case and clicks run
   * 7. Output area shows "Fail"
   */
  test('student runs instructor test cases and sees Pass/Fail results', async ({
    page,
    testNamespace,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `TC Execution Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `TC Execution Section ${testNamespace}`);

    // Problem with two instructor test cases:
    // - "case-pass": prints "hello" when given no input — expected "hello\n" → Pass
    // - "case-fail": expected "wrong\n" but code prints "hello" → Fail
    const problem = await createProblem(instructor.token, cls.id, {
      title: `TC Execution Problem ${testNamespace}`,
      description: 'Print hello',
      starterCode: 'print("hello")\n',
      testCases: [
        {
          name: 'case-pass',
          input: '',
          expected_output: 'hello\n',
          match_type: 'exact',
          order: 0,
        },
        {
          name: 'case-fail',
          input: '',
          expected_output: 'wrong\n',
          match_type: 'exact',
          order: 1,
        },
      ],
    });

    // Register student
    const student = await setupStudent(section.join_code);
    await publishProblem(instructor.token, section.id, problem.id);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== STUDENT OPENS WORKSPACE =====
    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);

    // Wait for Monaco to load
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    // Ensure starter code is in editor
    await setMonacoValue(page, 'print("hello")\n');
    // Wait for debounce auto-save
    await page.waitForTimeout(1000);

    // ===== OPEN CASES PANEL =====
    // The cases panel toggle button is in the activity bar
    await page.locator('[data-testid="cases-panel-toggle"]').click();

    // Verify the Cases panel is now visible (the panel header says "Test Cases")
    await expect(page.locator('text=Test Cases').first()).toBeVisible({ timeout: 5000 });

    // Verify both instructor cases appear in the list
    await expect(page.locator('text=case-pass')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=case-fail')).toBeVisible({ timeout: 5000 });

    // ===== RUN THE PASSING CASE =====
    // Click the list item to select case-pass, then click its run button
    await page.locator('li').filter({ hasText: 'case-pass' }).click();
    await page.locator(`button[aria-label="Run case-pass"]`).click();

    // Output area should show Pass badge (case is selected, result is available)
    const outputArea = page.locator('[data-testid="output-area"]');
    await expect(outputArea.locator('text="Pass"')).toBeVisible({ timeout: 15000 });

    // The inline Pass badge should also appear in the cases list
    const passCaseItem = page.locator('li').filter({ hasText: 'case-pass' });
    await expect(passCaseItem.locator('text="Pass"')).toBeVisible({ timeout: 5000 });

    // ===== RUN THE FAILING CASE =====
    // Click the list item to select case-fail, then click its run button
    await page.locator('li').filter({ hasText: 'case-fail' }).click();
    await page.locator(`button[aria-label="Run case-fail"]`).click();

    // Output area should now show Fail badge
    await expect(outputArea.locator('text="Fail"')).toBeVisible({ timeout: 15000 });

    // The inline Fail badge should appear in the cases list
    const failCaseItem = page.locator('li').filter({ hasText: 'case-fail' });
    await expect(failCaseItem.locator('text="Fail"')).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 2: Student adds a custom run-only test case → runs it → sees ✓ Success.
   *
   * Flow:
   * 1. Create problem with no instructor test cases (plain run-only problem)
   * 2. Student opens workspace → opens Cases panel
   * 3. Student clicks "+ Add Case"
   * 4. Clicks run on the new case
   * 5. Output shows ✓ Success and program output
   */
  test('student adds a custom test case and runs it', async ({
    page,
    testNamespace,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `Student Case Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Student Case Section ${testNamespace}`);

    // Problem with NO instructor test cases — student will add their own
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Student Case Problem ${testNamespace}`,
      description: 'Print hello',
      starterCode: 'print("custom case test")\n',
    });

    const student = await setupStudent(section.join_code);
    await publishProblem(instructor.token, section.id, problem.id);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== STUDENT OPENS WORKSPACE =====
    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    await setMonacoValue(page, 'print("custom case test")\n');
    await page.waitForTimeout(1000);

    // ===== OPEN CASES PANEL =====
    await page.locator('[data-testid="cases-panel-toggle"]').click();
    await expect(page.locator('text=Test Cases').first()).toBeVisible({ timeout: 5000 });

    // ===== STUDENT ADDS A CASE =====
    await page.locator('button[aria-label="Add Case"]').click();

    // The new case should appear in the list
    await expect(page.locator('text=Case 1')).toBeVisible({ timeout: 5000 });

    // Wait for the student case to be saved to the backend (500ms debounce + network)
    await page.waitForTimeout(1500);

    // ===== RUN THE NEW CUSTOM CASE =====
    // Select the case first so the output area shows its result
    await page.locator('li').filter({ hasText: 'Case 1' }).click();
    await page.locator(`button[aria-label="Run Case 1"]`).click();

    // Output area should show ✓ Success (run-only result — no expected output)
    const outputArea = page.locator('[data-testid="output-area"]');
    await expect(outputArea.locator('text=✓ Success')).toBeVisible({ timeout: 15000 });
    // Also verify the output contains the printed text
    await expect(outputArea.locator('text=custom case test')).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 3: Run All → all instructor cases executed → results populated in list.
   *
   * Flow:
   * 1. Create problem with two instructor test cases
   * 2. Student opens workspace, opens Cases panel
   * 3. Student clicks "Run All"
   * 4. Both cases show result badges (Pass / Fail) in the cases list
   * 5. Summary bar shows X/2 cases passed
   */
  test('Run All executes all cases and populates results', async ({
    page,
    testNamespace,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, `Run All Class ${testNamespace}`);
    const section = await createSection(instructor.token, cls.id, `Run All Section ${testNamespace}`);

    // Problem with two instructor cases
    const problem = await createProblem(instructor.token, cls.id, {
      title: `Run All Problem ${testNamespace}`,
      description: 'Print hello',
      starterCode: 'print("hello")\n',
      testCases: [
        {
          name: 'run-all-pass',
          input: '',
          expected_output: 'hello\n',
          match_type: 'exact',
          order: 0,
        },
        {
          name: 'run-all-fail',
          input: '',
          expected_output: 'wrong\n',
          match_type: 'exact',
          order: 1,
        },
      ],
    });

    const student = await setupStudent(section.join_code);
    await publishProblem(instructor.token, section.id, problem.id);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== STUDENT OPENS WORKSPACE =====
    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    await setMonacoValue(page, 'print("hello")\n');
    await page.waitForTimeout(1000);

    // ===== OPEN CASES PANEL =====
    await page.locator('[data-testid="cases-panel-toggle"]').click();
    await expect(page.locator('text=Test Cases').first()).toBeVisible({ timeout: 5000 });

    // ===== CLICK RUN ALL =====
    await page.locator('button[aria-label="Run All"]').click();

    // Wait for all cases to complete — both should have result badges
    // (Pass for run-all-pass, Fail for run-all-fail)
    // After Run All, the first case is auto-selected → output area shows its result
    const outputArea = page.locator('[data-testid="output-area"]');

    // The output area should show a result for the first case (run-all-pass → Pass)
    await expect(outputArea.locator('text=Pass')).toBeVisible({ timeout: 30000 });

    // The summary bar should show 1/2 cases passed
    await expect(outputArea.locator('text=1/2 cases passed')).toBeVisible({ timeout: 5000 });

    // Both case list items should now have result badges
    // Pass badge for run-all-pass
    const passCaseItem = page.locator('li').filter({ hasText: 'run-all-pass' });
    await expect(passCaseItem.locator('text="Pass"')).toBeVisible({ timeout: 5000 });

    // Fail badge for run-all-fail
    const failCaseItem = page.locator('li').filter({ hasText: 'run-all-fail' });
    await expect(failCaseItem.locator('text="Fail"')).toBeVisible({ timeout: 5000 });
  });
});
