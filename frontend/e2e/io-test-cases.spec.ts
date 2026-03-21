/**
 * IO Test Cases E2E Tests
 *
 * Acceptance tests for PLAT-c6g6.3: I/O test case UI for students and instructors.
 *
 * Test 1: Student runs instructor test cases and sees Pass/Fail results.
 *   Verifies the CasesPanel renders correct Pass/Fail badges after "Run All".
 *   This is the core correctness contract — if broken, students can't verify their code.
 *
 * Test 2: Student adds a custom test case, runs it, and it persists after reload.
 *   Verifies the full add→run→save→reload loop for student-defined cases.
 *   If broken, student work is silently lost, undermining the custom test feature.
 *
 * Test 3: Instructor creates problem with IO test cases and they persist after save+reload.
 *   Verifies the ProblemCreator Cases tab saves test cases to the backend correctly.
 *   If broken, instructors' test cases are silently dropped on save.
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import {
  createClass,
  createSection,
  createProblem,
  publishProblem,
  startSessionFromProblem,
  getOrCreateStudentWork,
} from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue } from './fixtures/monaco';

test.describe('IO Test Cases', () => {
  /**
   * Test 1: Student runs instructor test cases and sees Pass/Fail results.
   *
   * Seed: problem with 2 IOTestCases — one passes the given starter code, one fails.
   * Starter code: print("hello") → Case 1 expects "hello", Case 2 expects "goodbye".
   * After student clicks "Run All" in CasesPanel, 1 Pass badge and 1 Fail badge appear.
   */
  test('Student runs instructor test cases and sees Pass/Fail results', async ({
    page,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'IO Test Class');
    const section = await createSection(instructor.token, cls.id, 'IO Test Section');

    // Create problem with 2 test cases — starter code prints "hello"
    // Case 1: expects "hello" → PASS
    // Case 2: expects "goodbye" → FAIL
    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Hello Test',
      starterCode: 'print("hello")\n',
      testCases: [
        {
          name: 'Passes',
          input: '',
          expected_output: 'hello',
          match_type: 'exact',
          order: 0,
        },
        {
          name: 'Fails',
          input: '',
          expected_output: 'goodbye',
          match_type: 'exact',
          order: 1,
        },
      ],
    });

    await publishProblem(instructor.token, section.id, problem.id);
    await startSessionFromProblem(instructor.token, section.id, problem.id);

    const student = await setupStudent(section.join_code);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== STUDENT VIEW =====
    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);

    // Wait for the editor to load
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    // Open the Test Cases panel (collapsed by default)
    const testCasesButton = page.locator('button[aria-label="Test Cases"]');
    await expect(testCasesButton).toBeVisible({ timeout: 10000 });
    await testCasesButton.click();

    // "Run All" button should now be visible in the CasesPanel
    const runAllButton = page.locator('button:has-text("Run All")');
    await expect(runAllButton).toBeVisible({ timeout: 10000 });

    // Click Run All
    await runAllButton.click();

    // Wait for execution to complete — both Pass and Fail badges should appear
    await expect(page.locator('li span:has-text("Pass")').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('li span:has-text("Fail")').first()).toBeVisible({ timeout: 15000 });

    // Verify exactly 1 Pass and 1 Fail badge in the case list
    const passBadges = page.locator('li span:has-text("Pass")');
    const failBadges = page.locator('li span:has-text("Fail")');
    await expect(passBadges).toHaveCount(1, { timeout: 5000 });
    await expect(failBadges).toHaveCount(1, { timeout: 5000 });
  });

  /**
   * Test 2: Student adds a custom test case, runs it, output shows, and it persists after reload.
   *
   * Verifies:
   * - "Add Case" button creates a new student case in the list
   * - Running the case shows program output (run-only case, no expected output)
   * - After page reload, the student case is still present (saved to student_work)
   */
  test('Student adds a custom test case, runs it, and it persists after reload', async ({
    page,
    setupInstructor,
    setupStudent,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Custom Case Class');
    const section = await createSection(instructor.token, cls.id, 'Custom Case Section');

    const problem = await createProblem(instructor.token, cls.id, {
      title: 'Echo Test',
      starterCode: 'name = input()\nprint(f"Hello, {name}!")\n',
    });

    await publishProblem(instructor.token, section.id, problem.id);
    // Practice mode (no session needed for student work)

    const student = await setupStudent(section.join_code);
    const work = await getOrCreateStudentWork(student.token, section.id, problem.id);

    // ===== STUDENT VIEW =====
    await signInAs(page, student.email);
    await page.goto(`/student?work_id=${work.id}`);

    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    // Set the code in Monaco so the case runner has code to execute
    // (Student work starts with empty code; runCase returns early if code is empty)
    await setMonacoValue(page, 'name = input()\nprint(f"Hello, {name}!")');

    // Open the Test Cases panel (collapsed by default)
    const testCasesButton = page.locator('button[aria-label="Test Cases"]');
    await expect(testCasesButton).toBeVisible({ timeout: 10000 });
    await testCasesButton.click();

    // Click "+ Add Case" to create a new student-defined case
    const addCaseButton = page.locator('button[aria-label="Add Case"]');
    await expect(addCaseButton).toBeVisible({ timeout: 10000 });
    await addCaseButton.click();

    // A new case "My Case 1" should appear in the list
    await expect(page.locator('li span:has-text("My Case 1")')).toBeVisible({ timeout: 5000 });

    // Click the case to select it and show the detail panel
    await page.locator('li span:has-text("My Case 1")').click();

    // Fill in the input field in the case detail panel
    // The detail panel appears below the list with a border-t separator
    const inputArea = page.locator('.border-t textarea').first();
    await expect(inputArea).toBeVisible({ timeout: 5000 });
    await inputArea.fill('World');

    // Wait for state update
    await page.waitForTimeout(300);

    // Run the new case using the per-case run button (▶ button for "My Case 1")
    const runCaseButton = page.locator('li:has(span:has-text("My Case 1")) button[aria-label="Run My Case 1"]');
    await expect(runCaseButton).toBeVisible({ timeout: 5000 });
    await runCaseButton.click();

    // Wait for execution — output should show the result
    // Run-only case (no expected output) shows actual output
    await expect(page.locator('text=Hello, World!')).toBeVisible({ timeout: 30000 });

    // Wait for auto-save debounce (500ms) + buffer
    await page.waitForTimeout(1500);

    // ===== RELOAD AND VERIFY PERSISTENCE =====
    await page.reload();

    // Wait for the editor to load again
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

    // The custom test case should still be present after reload
    await expect(page.locator('li span:has-text("My Case 1")')).toBeVisible({ timeout: 10000 });
  });

  /**
   * Test 3: Instructor creates a problem with IO test cases via ProblemCreator.
   *
   * Verifies:
   * - Instructor can add test cases via the Cases tab in ProblemCreator
   * - Test cases are saved to the backend on "Create Problem"
   * - After reload (Edit mode), both test cases are present in the Cases tab
   */
  test('Instructor creates problem with IO test cases and they persist after save+reload', async ({
    page,
    setupInstructor,
  }) => {
    test.setTimeout(90000);

    // ===== API SETUP =====
    const instructor = await setupInstructor();
    await createClass(instructor.token, 'Instructor Cases Class');

    // ===== INSTRUCTOR UI =====
    await signInAs(page, instructor.email);
    await page.goto('/instructor/problems');

    // Wait for the Problem Library to load
    await expect(
      page.locator('h2:has-text("Problem Library"), button:has-text("Create Your First Problem")').first()
    ).toBeVisible({ timeout: 15000 });

    // Open the ProblemCreator
    const createButton = page
      .locator('button:has-text("Create New Problem"), button:has-text("Create Your First Problem")')
      .first();
    await expect(createButton).toBeVisible();
    await createButton.click();

    await expect(page.locator('h2:has-text("Create New Problem")')).toBeVisible();

    // Fill in title using the creator-title input
    const titleInput = page.locator('input#creator-title');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('IO Test Problem');

    // Select class
    const classSelect = page.locator('select#problem-class');
    await expect(classSelect).toBeVisible();
    await classSelect.selectOption({ label: 'Instructor Cases Class' });

    // Switch to "Cases" tab
    const casesTab = page.locator('[role="tab"]:has-text("Cases")');
    await expect(casesTab).toBeVisible();
    await casesTab.click();

    // ===== ADD FIRST TEST CASE =====
    const addCaseButton = page.locator('button[aria-label="Add Case"]');
    await expect(addCaseButton).toBeVisible({ timeout: 10000 });
    await addCaseButton.click();

    // "Case 1" should appear in the list and be selected (detail panel shows below)
    await expect(page.locator('li span:has-text("Case 1")')).toBeVisible({ timeout: 5000 });

    // The detail panel shows the case fields — fill in input for Case 1
    const inputAreas = page.locator('.border-t textarea');
    await expect(inputAreas.first()).toBeVisible({ timeout: 5000 });
    await inputAreas.first().fill('hello');

    // ===== ADD SECOND TEST CASE =====
    await addCaseButton.click();

    // "Case 2" should appear in the list
    await expect(page.locator('li span:has-text("Case 2")')).toBeVisible({ timeout: 5000 });

    // The detail panel now shows Case 2 — fill in its input
    await inputAreas.first().fill('world');

    // ===== SAVE THE PROBLEM =====
    await page.locator('button:has-text("Create Problem")').click();

    // After creation, Problem Library is shown
    await expect(page.locator('h2:has-text("Problem Library")')).toBeVisible({ timeout: 15000 });

    // The new problem should appear in the list
    await expect(page.locator('h3:has-text("IO Test Problem")')).toBeVisible({ timeout: 10000 });

    // ===== OPEN EDIT MODE (simulates reload check) =====
    const editButton = page
      .locator('div:has(h3:has-text("IO Test Problem")) button:has-text("Edit")')
      .first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible();

    // Switch to "Cases" tab in the editor
    const editCasesTab = page.locator('[role="tab"]:has-text("Cases")');
    await expect(editCasesTab).toBeVisible({ timeout: 10000 });
    await editCasesTab.click();

    // Both test cases should still be present after save+reload
    await expect(page.locator('li span:has-text("Case 1")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('li span:has-text("Case 2")')).toBeVisible({ timeout: 5000 });
  });
});
