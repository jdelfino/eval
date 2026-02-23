---
name: e2e-testing
description: Guide for writing, running, and debugging Playwright E2E tests in eval.
---

# E2E Testing

Guide for writing, running, and debugging Playwright E2E tests. The eval platform uses a multi-service architecture (Go API + Next.js + PostgreSQL + Redis + Centrifugo + executor) orchestrated by a shell script for E2E runs.

## Core Principles

1. **Failing tests indicate real bugs.** The tests interact with the real app. If a test fails, the app is broken — investigate the app, not the test.
2. **Debug locally first.** Read error messages, check screenshots/video, check browser console logs. Most issues are obvious once you look at the artifacts.
3. **Fix the app, not the test.** If the test exposes a real bug, fix the production code. Only change the test if the test itself is wrong (wrong selector, wrong expectation, race condition in the test).
4. **Tests must be independent.** Each test gets its own namespace. Never depend on state from another test.

## Debugging Approach

When a test fails, follow this sequence:

### 1. Read the Error Message

Playwright error messages are descriptive. They tell you exactly what selector failed and why. Start there.

### 2. Check Failure Artifacts

On failure, Playwright captures:
- **Screenshots** — `frontend/test-results/<test-name>/` — shows what the page looked like
- **Video** — same directory — shows the full test interaction leading up to the failure
- **Browser console logs** — attached to the test report (captured by the `logCollector` fixture)

Open the HTML report:
```bash
cd frontend && npx playwright show-report
```

### 3. Check API Responses

The test fixtures log API requests/responses to the browser console. Look for non-200 responses or unexpected error bodies in the console log artifacts.

### 4. Trace Back to the Bug

Common failure patterns:
- **Element not found** — check if the selector changed, or if the page didn't load (API error, auth issue)
- **Timeout waiting for element** — usually means the feature is broken or the page never navigated
- **Text mismatch** — check if the API returned unexpected data
- **"Failed to create/start/register"** — API setup failed; check that the Go backend is running and migrations are current

### 5. Run in Headed Mode

For interactive debugging:
```bash
# Start infrastructure first (if not already running)
./scripts/ensure-test-postgres.sh
# Start API manually
./scripts/ensure-test-api.sh

# Run a single test with browser visible
cd frontend && npx playwright test e2e/your-test.spec.ts --headed

# Or with Playwright Inspector (step-by-step debugging)
cd frontend && npx playwright test e2e/your-test.spec.ts --debug
```

**Note:** For headed/debug mode, you need the backend services running separately. The `make test-e2e` script manages this automatically for CI-style runs, but for interactive debugging you start services manually.

## Running Tests

### Full Suite (Recommended for CI)

```bash
make test-e2e
```

This orchestrates everything:
1. Ensures PostgreSQL is running with migrations applied
2. Starts executor service (Docker Compose)
3. Builds and starts Go API on a random port
4. Builds Next.js in production mode (with test auth)
5. Runs Playwright tests

### Single Test File

```bash
# Option 1: Via make (handles all infrastructure)
make test-e2e -- e2e/your-test.spec.ts

# Option 2: Manual (requires infrastructure already running)
cd frontend && API_BASE_URL=http://localhost:$API_PORT npx playwright test e2e/your-test.spec.ts
```

### Single Test by Name

```bash
cd frontend && npx playwright test -g "test name substring"
```

## Writing Tests

### Test Structure

Every test file follows this pattern:

```typescript
import { test, expect } from './fixtures/test-fixture';
import { signInAs } from './fixtures/auth';
import { createClass, createSection, /* ... */ } from './fixtures/api-setup';

test.describe('Feature Name', () => {
  test('what it does', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
    // 1. API SETUP — create data via HTTP helpers (fast, no UI interaction)
    const instructor = await setupInstructor();
    const cls = await createClass(instructor.token, 'Test Class');
    const section = await createSection(instructor.token, cls.id, 'Test Section');

    // 2. UI INTERACTION — sign in, navigate, interact
    await signInAs(page, instructor.email);
    await page.goto('/instructor');

    // 3. ASSERTIONS — verify expected state
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible();
  });
});
```

### Namespace Isolation

Every test gets a unique `testNamespace` via the fixture. Use it when creating test data to avoid collisions:

```typescript
const studentExternalId = `student-${testNamespace}`;
const studentEmail = `${studentExternalId}@test.local`;
```

The namespace is auto-created by the `testNamespace` fixture. All data created within a namespace is isolated from other tests.

### API-Based Test Data Setup

**Always create test data via API helpers, not UI interactions.** This is faster and more reliable. Use UI interactions only to test the UI flow you're actually verifying.

Available helpers in `e2e/fixtures/api-setup.ts`:

| Helper | Purpose |
|--------|---------|
| `createNamespace(id, name)` | Create isolated namespace |
| `createInvitation(email, role, namespaceId)` | Invite a user |
| `acceptInvitation(invId, token, displayName)` | Accept invitation (creates user) |
| `createClass(token, name)` | Create a class |
| `createSection(token, classId, name)` | Create a section (returns `join_code`) |
| `createProblem(token, classId, opts)` | Create a coding problem |
| `startSession(token, sectionId, sectionName)` | Start a session (inline problem) |
| `startSessionFromProblem(token, sectionId, problemId)` | Start session from existing problem |
| `registerStudent(joinCode, extId, email, name)` | Register student in section |
| `getSectionByJoinCode(joinCode)` | Look up section/class by join code |

The `setupInstructor` fixture combines `createInvitation` + `acceptInvitation` into one call.

### Authentication

The platform runs in test auth mode (`AUTH_MODE=test`). Tokens are format `test:<externalId>:<email>`.

```typescript
// Sign in through the UI (for testing the login flow)
import { signInAs, loginAsSystemAdmin } from './fixtures/auth';
await signInAs(page, 'user@test.local');

// Generate a token for API calls (no UI needed)
import { testToken } from './fixtures/api-setup';
const token = testToken('my-external-id', 'my@test.local');
```

### Multi-Actor Tests (Instructor + Student)

Use separate browser contexts for different users:

```typescript
test('multi-actor flow', async ({ page, browser, testNamespace, setupInstructor, logCollector }) => {
  const instructor = await setupInstructor();

  // Create a separate browser context for the instructor
  const instructorContext = await browser.newContext();
  const instructorPage = await instructorContext.newPage();
  logCollector.attachPage(instructorPage, 'instructor-page');

  try {
    await signInAs(instructorPage, instructor.email);
    // ... instructor actions ...

    // Default `page` is for the student
    await signInAs(page, studentEmail);
    // ... student actions ...
  } finally {
    await instructorContext.close();
  }
});
```

**Always** attach additional pages to the `logCollector` so their console logs are captured on failure.

### Waiting and Timing

- **Use Playwright auto-waiting** — `expect(...).toBeVisible()`, `page.waitForURL()` etc. handle retries automatically.
- **Use `waitForTimeout` sparingly** — only for debounce windows (code sync has a 500ms debounce) and brief settle times.
- **Set explicit timeouts for long operations** — `test.setTimeout(60000)` for multi-actor tests; `{ timeout: 15000 }` for slow assertions (e.g., waiting for code execution results).

### Monaco Editor Interactions

The code editor is Monaco. Interact with it via keyboard, not by setting values directly:

```typescript
const monacoEditor = page.locator('.monaco-editor').first();
await monacoEditor.click();
await page.keyboard.press('ControlOrMeta+a');   // Select all
await page.waitForTimeout(200);
await page.keyboard.press('Backspace');           // Clear
await page.waitForTimeout(300);
await page.keyboard.type('print("hello")', { delay: 50 });  // Type slowly

// Wait for debounced sync to server
await page.waitForTimeout(2000);
```

### Verifying Monaco Content

Monaco splits text across DOM elements, so direct text assertions don't work. Use `page.evaluate`:

```typescript
const hasCode = await page.evaluate(() => {
  const editor = document.querySelector('.monaco-editor');
  if (!editor) return false;
  const text = editor.textContent?.replace(/\s/g, '') || '';
  return text.includes('YOUR_EXPECTED_TEXT');
});
expect(hasCode).toBe(true);
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/e2e/fixtures/test-fixture.ts` | Extended Playwright test with `testNamespace`, `setupInstructor`, `logCollector` fixtures |
| `frontend/e2e/fixtures/api-setup.ts` | HTTP helpers for test data setup (namespace, class, section, student, session) |
| `frontend/e2e/fixtures/auth.ts` | `signInAs()`, `loginAsSystemAdmin()`, sidebar navigation helpers |
| `frontend/playwright.config.ts` | Playwright config (Chromium only, parallel, no retries, screenshots + video on failure) |
| `scripts/run-e2e-tests.sh` | Full-stack E2E orchestrator (postgres, executor, Go API, Next.js, Playwright) |
| `scripts/ensure-test-postgres.sh` | Ensures test PostgreSQL is running with migrations |
| `scripts/ensure-test-api.sh` | Builds and starts Go API in test mode on a random port |

## Configuration

From `frontend/playwright.config.ts`:
- **Test directory:** `frontend/e2e/`
- **Parallelism:** `fullyParallel: true`, 2 workers (safe due to namespace isolation)
- **Retries:** 0 (flaky tests should fail immediately)
- **Timeout:** 30s per test (override with `test.setTimeout()` for longer tests)
- **Browser:** Chromium only
- **Artifacts:** Screenshot + video on failure; trace recording off (avoids file races)
- **Base URL:** `http://localhost:3000`
