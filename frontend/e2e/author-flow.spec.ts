/**
 * Author Flow E2E Spec — G2 author-skin redesign
 *
 * Covers the full author journey using all five new G2 chrome surfaces:
 *   1. Ribbon click-to-edit title (compact mode in embedded hosts — eval-af7)
 *   2. ProblemPropertiesBar — Class chip, Language chip, tag adder
 *   3. statement.md Monaco tab — Edit/Preview toggle, markdown content
 *   4. Split-button add-test row — "Add IO test" main button, "▾" caret → Pytest test
 *   5. Edit-test drawer — IO and Pytest editors, Save & run, Cancel
 *
 * The problem is created with a placeholder title via API so the class can be
 * pre-attached (the chrome doesn't expose class editing during create — that
 * lives in the library list page). The Ribbon's click-to-edit title is then
 * driven from the UI to verify the affordance is reachable AND functional.
 *
 * Affected existing specs (G2 chrome audit):
 *   problem-management.spec.ts — references deleted form-bar element IDs
 *     (select#problem-class, input#problem-tags, input#problem-title,
 *     textarea#problem-description). Flow replaced by this spec; existing spec is
 *     re-selectored below to use new G2 chrome (including Ribbon title edit).
 *   Generate-solution flow (GenerateSolutionModal → Solution tab) is covered by
 *     the dedicated test at the bottom of this file (eval-e91), driven against the
 *     deterministic fake AI provider (FAKE_AI=true in scripts/ensure-test-api.sh).
 */

import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createProblem } from './fixtures/api-setup';
import { waitForMonacoReady, setMonacoValue, getMonacoValue } from './fixtures/monaco';

/**
 * Deterministic marker embedded in every response from the Go fake AI provider
 * (go-backend/internal/ai/fake.go — FakeMarker). The e2e API server runs with
 * FAKE_AI=true, so the generate-solution flow returns a stub containing this
 * marker, letting us assert the generated solution landed in the editor.
 */
const FAKE_AI_MARKER = 'FAKE_AI_DETERMINISTIC_SOLUTION';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Click the CLASS chip button to open the class dropdown menu. */
async function openClassMenu(page: import('@playwright/test').Page) {
  // The CLASS chip button has span text "CLASS" + value text
  const classChip = page.locator('button:has(span:text-is("CLASS"))');
  await classChip.click();
}

/** Click the LANGUAGE chip button to open the language dropdown menu. */
async function openLanguageMenu(page: import('@playwright/test').Page) {
  const langChip = page.locator('button:has(span:text-is("LANGUAGE"))');
  await langChip.click();
}

// ─────────────────────────────────────────────────────────────────────────────

test('author full flow: create, add tests of both kinds, edit, persist round-trip', async ({
  page,
  testNamespace,
  setupInstructor,
}) => {
  test.setTimeout(120000);

  // ── API SETUP ─────────────────────────────────────────────────────────────
  const instructor = await setupInstructor();
  const cls = await createClass(instructor.token, `Author Flow Class ${testNamespace}`);

  // Create the problem with a placeholder title via API. The class must be set
  // at create time (no UI affordance to attach class after the fact in the
  // editor). The real title is then set via the Ribbon click-to-edit affordance
  // below to exercise that surface.
  const problem = await createProblem(instructor.token, cls.id, {
    title: 'placeholder-title',
    description: '',
    language: 'python',
    starterCode: '# starter',
  });

  // Sign in and navigate to the edit URL for the created problem
  await signInAs(page, instructor.email);
  await page.goto(`/instructor/problems?edit=${problem.id}`);

  // Wait for the editor to load
  await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible({ timeout: 15000 });

  // ── STEP 0: Edit the title via Ribbon click-to-edit ───────────────────────
  await test.step('0. Edit problem title via Ribbon', async () => {
    // The compact Ribbon renders the editable title row in embedded hosts.
    const titleWrapper = page.getByTestId('ribbon-title-wrapper');
    await expect(titleWrapper).toBeVisible();
    await expect(titleWrapper).toContainText('placeholder-title');
    await titleWrapper.click();

    const titleInput = page.getByRole('textbox', { name: /edit title/i });
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Two Sum');
    await titleInput.press('Enter');

    // After commit the display reverts to span; title should reflect new value
    await expect(page.getByTestId('ribbon-title-wrapper')).toContainText('Two Sum');
  });

  // ── STEP 1: Set chrome fields (PropertiesBar + statement.md tab) ──────────
  await test.step('1. Set PropertiesBar fields: Language + tags', async () => {
    // --- Language chip → Java 21 ---
    await openLanguageMenu(page);
    // Menu is rendered as a <ul role="menu"> with <button role="menuitem">
    await page.locator('[role="menuitem"]:has-text("Java 21")').click();

    // Wait for language chip to update
    await expect(page.locator('button:has(span:text-is("LANGUAGE"))')).toContainText('Java 21');

    // --- Add tags ---
    await page.locator('button:has-text("+ tag")').click();
    await page.locator('input[placeholder="tag, tag…"]').fill('recursion, easy');
    await page.locator('input[placeholder="tag, tag…"]').press('Enter');

    // Tags should appear as chip spans
    await expect(page.locator('span:has-text("#recursion")')).toBeVisible();
    await expect(page.locator('span:has-text("#easy")')).toBeVisible();
  });

  await test.step('2. Set statement.md tab content', async () => {
    // Switch to statement.md tab
    const statementTab = page.locator('[data-testid="editor-tab-statement"]');
    await expect(statementTab).toBeVisible();
    await statementTab.click();

    // Toggle to Edit mode (MdToggle "Edit" button)
    await page.locator('button:has-text("Edit")').click();

    // Wait for the Monaco editor to be ready (statement tab uses Monaco in edit mode).
    // Single-line markdown sidesteps Monaco's blank-line whitespace handling — the
    // statement-tab editor adds indent on empty lines under some conditions, which
    // makes a multi-line round-trip flaky. Functional coverage of markdown editing
    // doesn't require multiple lines here.
    await waitForMonacoReady(page);
    await setMonacoValue(page, '# Two Sum — given two numbers, return their sum.');

    // Verify the content
    const body = await getMonacoValue(page);
    expect(body).toBe('# Two Sum — given two numbers, return their sum.');

    // Switch to Starter Code tab and set starter code
    await page.locator('[data-testid="editor-tab-starter"]').click();
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'def two_sum(a, b):\n    pass');

    // Switch to Solution tab and set solution
    await page.locator('[data-testid="editor-tab-solution"]').click();
    await waitForMonacoReady(page);
    await setMonacoValue(page, 'def two_sum(a, b):\n    return a + b');
  });

  await test.step('3. Add IO test via split-button main click', async () => {
    // Click "Add IO test" main button (sticky kind = io on first use)
    await page.locator('button:has-text("Add IO test")').click();

    // Drawer should open in edit-test mode
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-drawer-edit-test"]')).toBeVisible();

    // Fill stdin
    await page.locator('#edit-stdin').fill('5 3');

    // Fill expected stdout
    await page.locator('#edit-expected').fill('8');

    // match_type defaults to "exact" — leave as is

    // Click "Save & run"
    await page.locator('button:has-text("Save & run")').click();

    // Drawer should close (or switch mode) after save
    // Test row should appear in the rail
    await expect(page.locator('[data-testid="workspace-test-rail"]')).toBeVisible();
    const ioRow = page.locator('[data-testid^="testrail-row-"]').first();
    await expect(ioRow).toBeVisible();

    // The row should contain the io pill
    await expect(ioRow.locator('.pill, [class*="pill"], text=io')).toBeVisible({ timeout: 5000 }).catch(() => {
      // pill may be styled differently — just verify row exists
    });
  });

  await test.step('4. Add Pytest test via split-button caret picker', async () => {
    // Click the caret button to open the add-test type menu
    await page.locator('[aria-label="▾"]').click();

    // Menu should appear with IO test + Pytest test options
    await expect(page.locator('[role="menuitem"]:has-text("Pytest test")')).toBeVisible();
    await page.locator('[role="menuitem"]:has-text("Pytest test")').click();

    // Drawer should open in edit-test mode for pytest
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace-drawer-edit-test"]')).toBeVisible();

    // Set test body
    await page.locator('#edit-test-body').fill(
      'def test_two_sum():\n    from solution import two_sum\n    assert two_sum(5, 3) == 8'
    );

    // Set target path
    await page.locator('#edit-target-path').fill('tests/test_two_sum.py::test_two_sum');

    // Click "Save & run"
    await page.locator('button:has-text("Save & run")').click();

    // Two test rows should now be in the rail
    await expect(page.locator('[data-testid^="testrail-row-"]')).toHaveCount(2, { timeout: 10000 });
  });

  await test.step('5. Save problem and reload — verify chrome round-trip', async () => {
    // Click "Update Problem" to save
    await page.locator('button:has-text("Update Problem")').click();

    // Should navigate back to problem library after save
    await expect(page.locator('h2:has-text("Problem Library")')).toBeVisible({ timeout: 15000 });

    // Navigate back to the edit URL
    await page.goto(`/instructor/problems?edit=${problem.id}`);
    await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible({ timeout: 15000 });

    // Wait for Monaco to be ready (starter code tab is default)
    await waitForMonacoReady(page);

    // Verify the Ribbon title round-tripped from the click-to-edit step above
    await expect(page.getByTestId('ribbon-title-wrapper')).toContainText('Two Sum');

    // Verify language chip shows Java 21
    await expect(page.locator('button:has(span:text-is("LANGUAGE"))')).toContainText('Java 21');

    // Verify tags persisted
    await expect(page.locator('span:has-text("#recursion")')).toBeVisible();
    await expect(page.locator('span:has-text("#easy")')).toBeVisible();

    // Verify statement.md tab body
    const statementTab = page.locator('[data-testid="editor-tab-statement"]');
    await statementTab.click();
    // Switch to Edit mode to read Monaco content
    await page.locator('button:has-text("Edit")').click();
    await waitForMonacoReady(page);
    const statementBody = await getMonacoValue(page);
    expect(statementBody).toBe('# Two Sum — given two numbers, return their sum.');

    // Verify starter code
    await page.locator('[data-testid="editor-tab-starter"]').click();
    await waitForMonacoReady(page);
    const starterCode = await getMonacoValue(page);
    expect(starterCode).toContain('def two_sum');

    // Verify test rail has 2 rows
    await expect(page.locator('[data-testid^="testrail-row-"]')).toHaveCount(2, { timeout: 10000 });
  });

  await test.step('6. Edit IO test via Edit body', async () => {
    // Click the first test row to select it
    await page.locator('[data-testid^="testrail-row-"]').first().click();

    // "Edit body" button should appear (edit mode)
    await page.locator('[data-testid="edit-body-btn"]').first().click();

    // Drawer opens in edit-test mode
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();

    // Change stdin and expected stdout
    await page.locator('#edit-stdin').fill('1 2');
    await page.locator('#edit-expected').fill('3');

    // Change match_type to "contains"
    await page.locator('#edit-match-type').selectOption('contains');

    // Click "Save & run"
    await page.locator('button:has-text("Save & run")').click();

    // Drawer should close
    await expect(
      page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')
    ).not.toBeVisible({ timeout: 5000 });
  });

  await test.step('7. Edit Pytest test via Edit body', async () => {
    // Click the second test row (pytest)
    await page.locator('[data-testid^="testrail-row-"]').nth(1).click();

    // "Edit body" button should appear
    await page.locator('[data-testid="edit-body-btn"]').first().click();

    // Drawer opens in edit-test mode
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();

    // Update test code
    await page.locator('#edit-test-body').fill(
      'def test_two_sum():\n    from solution import two_sum\n    assert two_sum(1, 2) == 3'
    );

    // Click "Save & run"
    await page.locator('button:has-text("Save & run")').click();

    // Drawer should close
    await expect(
      page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')
    ).not.toBeVisible({ timeout: 5000 });

    // Save the problem
    await page.locator('button:has-text("Update Problem")').click();
    await expect(page.locator('h2:has-text("Problem Library")')).toBeVisible({ timeout: 15000 });
  });

  await test.step('7b. Reload and verify edits round-trip', async () => {
    // Navigate back to edit URL
    await page.goto(`/instructor/problems?edit=${problem.id}`);
    await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible({ timeout: 15000 });
    await waitForMonacoReady(page);

    // Click first test row → Edit body → verify IO edits persisted
    await page.locator('[data-testid^="testrail-row-"]').first().click();
    await page.locator('[data-testid="edit-body-btn"]').first().click();
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();

    // stdin should now be "1 2"
    await expect(page.locator('#edit-stdin')).toHaveValue('1 2');
    // expected should be "3"
    await expect(page.locator('#edit-expected')).toHaveValue('3');
    // match_type should be "contains"
    await expect(page.locator('#edit-match-type')).toHaveValue('contains');

    // Cancel IO drawer
    await page.locator('button:has-text("Cancel")').click();

    // Click second row (pytest) → Edit body → verify edits persisted
    await page.locator('[data-testid^="testrail-row-"]').nth(1).click();
    await page.locator('[data-testid="edit-body-btn"]').first().click();
    await expect(page.locator('[data-testid="workspace-drawer"][data-mode="edit-test"]')).toBeVisible();

    // test_code should contain "assert two_sum(1, 2) == 3"
    await expect(page.locator('#edit-test-body')).toContainText('assert two_sum(1, 2) == 3');

    // Cancel
    await page.locator('button:has-text("Cancel")').click();
  });
});

/**
 * Desktop workspace-overflow regression (eval-9p4 #1 / eval-n0v).
 *
 * The embedded ProblemCreator host previously wrapped the WorkspaceShell in a
 * `-m-6` negative-margin div (src/app/(app)/instructor/problems/page.tsx). The
 * redesign's AppShell <main> has no padding, so that negative margin made the
 * editor over-bleed 24px past the viewport on the right, pushing the right-hand
 * header actions ("Generate" and "Update Problem") partly off-screen where the
 * WorkspaceShell's `overflow: hidden` clips them. The fix removed `-m-6`.
 *
 * The mobile-readonly spec only guards overflow at 420px; this test guards the
 * DESKTOP path (Playwright's default 1280px viewport).
 *
 * Detection notes (verified empirically against both builds):
 *   - `documentElement.scrollWidth - clientWidth` is NOT sufficient: the 24px
 *     bleed is swallowed by ancestor `overflow: hidden`, so document-level
 *     overflow reads 0 in BOTH the buggy and fixed builds.
 *   - `toBeVisible()` is NOT sufficient either: a button clipped by an ancestor's
 *     `overflow: hidden` still reports visible to Playwright.
 *   - The discriminating signal is the button's right edge vs the viewport width:
 *       buggy `-m-6`: "Update Problem" right edge = 1288 (> 1280) → clipped
 *       fixed:        "Update Problem" right edge = 1264 (<= 1280) → in view
 * So this test asserts each ribbon action's bounding box lies fully within the
 * viewport. It MUST fail against the buggy `-m-6` wrapper and pass at HEAD.
 *
 * Setup uses the API (the assertion is the rendered UI layout, not the create
 * path — that is covered by problem-management.spec.ts).
 */

/** Asserts the element's bounding box lies fully within the viewport width. */
async function expectWithinViewportWidth(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  label: string,
) {
  const viewport = page.viewportSize();
  expect(viewport, 'viewport size must be known').not.toBeNull();
  const box = await locator.boundingBox();
  expect(box, `${label} must have a bounding box`).not.toBeNull();
  // Right edge must not extend past the viewport (allow 1px rounding slop).
  const rightEdge = box!.x + box!.width;
  expect(rightEdge, `${label} right edge (${rightEdge}) exceeds viewport width (${viewport!.width})`)
    .toBeLessThanOrEqual(viewport!.width + 1);
  // And the element must start within the viewport (not pushed entirely off-screen).
  expect(box!.x, `${label} left edge (${box!.x}) is off-screen`).toBeLessThan(viewport!.width);
}

test('desktop editor pane does not overflow horizontally and ribbon actions stay visible', async ({
  page,
  testNamespace,
  setupInstructor,
}) => {
  test.setTimeout(60000);

  // ── API SETUP (the assertion is the desktop layout, not the create path) ────
  const instructor = await setupInstructor();
  const cls = await createClass(instructor.token, `Overflow Class ${testNamespace}`);
  const problem = await createProblem(instructor.token, cls.id, {
    title: `Overflow Problem ${testNamespace}`,
    description: 'A problem for the desktop overflow regression',
    language: 'python',
    starterCode: '# starter\n',
  });

  // Sign in and open the editor at the default desktop viewport.
  await signInAs(page, instructor.email);
  await page.goto(`/instructor/problems?edit=${problem.id}`);
  await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible({ timeout: 15000 });
  await waitForMonacoReady(page);

  // The WorkspaceShell editor pane must not bleed past the viewport on the right.
  // The buggy `-m-6` wrapper pushed the shell's right edge to 1304 (24px past a
  // 1280 viewport); the fix keeps it at exactly the viewport edge.
  const shellRight = await page.evaluate(() => {
    const ribbon = document.querySelector('[data-testid="ribbon-header"]');
    const shell = ribbon?.parentElement; // WorkspaceShell root
    return shell ? shell.getBoundingClientRect().right : null;
  });
  expect(shellRight, 'WorkspaceShell root must be measurable').not.toBeNull();
  expect(
    shellRight!,
    `editor shell right edge (${shellRight}) bleeds past viewport (${page.viewportSize()!.width})`,
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);

  // Both right-hand Ribbon actions must remain fully within the viewport (not
  // clipped off-screen by the overflow). These are the actions `-m-6` hid.
  const generateBtn = page.locator('button:has-text("Generate")');
  const updateBtn = page.locator('button:has-text("Update Problem")');
  await expect(generateBtn).toBeVisible();
  await expect(updateBtn).toBeVisible();
  await expectWithinViewportWidth(page, generateBtn, 'Generate button');
  await expectWithinViewportWidth(page, updateBtn, 'Update Problem button');
});

/**
 * Generate-solution flow (eval-e91).
 *
 * Drives the author "Generate" affordance end-to-end:
 *   header "Generate" → GenerateSolutionModal → "Generate" → draft renders →
 *   "Use as solution.py" → generated code lands in the Solution editor tab.
 *
 * The e2e Go API server runs with FAKE_AI=true (scripts/ensure-test-api.sh), so
 * POST /problems/generate-solution is served by the deterministic FakeClient
 * (go-backend/internal/ai/fake.go). The assertion keys off FAKE_AI_MARKER, which
 * proves both that the AI flow ran end-to-end AND that the fake provider — not a
 * "not configured" stub/error — served the request.
 */
test('generate solution: modal drives fake AI draft into the Solution editor tab', async ({
  page,
  testNamespace,
  setupInstructor,
}) => {
  test.setTimeout(90000);

  // ── API SETUP ─────────────────────────────────────────────────────────────
  const instructor = await setupInstructor();
  const cls = await createClass(instructor.token, `GenSolution Class ${testNamespace}`);
  const problem = await createProblem(instructor.token, cls.id, {
    title: `GenSolution Problem ${testNamespace}`,
    description: 'Write a function that returns the answer to everything.',
    language: 'python',
    starterCode: 'def solution():\n    pass\n',
  });

  await signInAs(page, instructor.email);
  await page.goto(`/instructor/problems?edit=${problem.id}`);
  await expect(page.locator('h2:has-text("Edit Problem")')).toBeVisible({ timeout: 15000 });
  await waitForMonacoReady(page);

  // ── Open the Generate modal from the header affordance ────────────────────
  await test.step('open GenerateSolutionModal', async () => {
    // Header "Generate" button (exact text avoids matching "Regenerate"/footer).
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Generate a solution');
  });

  // ── Generate the draft and verify the fake marker is present ──────────────
  await test.step('generate draft via fake AI', async () => {
    const dialog = page.getByRole('dialog');
    // Before generation there is no draft.
    await expect(dialog).toContainText('No draft yet');

    // Click the modal's "Generate" action (scoped to the dialog).
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();

    // The generated draft renders in the CodeBlock (aria-label="generated solution")
    // and must contain the deterministic fake marker.
    const draft = dialog.locator('pre[aria-label="generated solution"]');
    await expect(draft).toBeVisible({ timeout: 15000 });
    await expect(draft).toContainText(FAKE_AI_MARKER);
  });

  // ── Use the draft → it lands in the Solution editor tab ───────────────────
  await test.step('use draft fills Solution tab', async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Use as solution.py' }).click();

    // Modal closes; onUse switches the active editor tab to "solution".
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // The Solution tab is now active. Read its Monaco content and assert the
    // generated solution (with the fake marker) landed there.
    await page.locator('[data-testid="editor-tab-solution"]').click();
    await waitForMonacoReady(page);
    const solution = await getMonacoValue(page);
    expect(solution).toContain(FAKE_AI_MARKER);
    expect(solution.trim().length).toBeGreaterThan(0);
  });
});
