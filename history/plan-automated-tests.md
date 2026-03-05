# Epic: Automated Tests for Small Problems

**GH Issue:** #144
**Status:** Planning

## Overview

Add test case support for single-file problems. Instructors define cases (I/O and unit tests), students run them and see structured results. This builds the foundation for autograding and dovetails into future assignment/grading features.

## Design Decisions

1. **Unified "cases" model.** A case is "run my code this way and show me what happens." I/O cases have input configuration (stdin, random_seed, attached_files) plus optional expected output. Unit tests have code that calls/asserts against the student's code. Both types appear in a single flat list in the student sidebar. The existing execution settings panel is replaced by the cases model — what students currently do (set stdin + run) becomes "run a case without expected output."

2. **Two case types, one UX:** I/O cases and unit tests are both "cases" from the student's perspective. The sidebar lists them together. The difference is in detail view and results rendering:
   - I/O case selected → form view: input fields, expected output, actual output, diff on failure
   - Unit test selected → opens test file as read-only tab in code editor, jumps to that test function

3. **Editor tabs.** The code editor gains tab support. Student code is always the first tab (editable). When a unit test case is selected, the test file opens as a read-only tab. This also sets up for multi-file editing in future (large problems).

4. **Two sources of cases:** Instructor-defined cases come from the problem definition (stored on `problems` table). Student-defined cases are personal (stored on `student_work` table). Students can add their own I/O cases to try inputs — same model as today's execution settings, but formalized as named cases.

5. **Executor architecture:** New `POST /test` endpoint, separate from `/execute`. Accepts I/O test definitions and/or unit test code. Generates internal wrapper scripts to run all tests in a single sandbox invocation. Returns structured pass/fail results.

6. **I/O test execution model:** Wrapper script runs student code as a subprocess per test (sequential, fresh process each time — no state leakage). One nsjail call for N tests.

7. **I/O test storage:** Structured JSONB on the `problems` table (repurpose existing `test_cases` column). Schema: `[{name, input, expected_output, match_type, random_seed, attached_files, order}]`. Student-defined cases stored similarly on `student_work`.

8. **Unit test storage:** New `unit_test_code TEXT` column on `problems` (Phase 3). Contains pytest/junit code.

9. **Result format:** Unified `TestResult` type works for both I/O and unit tests. Type-specific fields are optional. Frontend renders differently based on type but the data model is shared.

10. **Trace debugging (Phase 4):** I/O tests: trace student code with the test's stdin (basically existing tracer). Unit tests: backend wraps test + student code together, passes to tracer.

11. **Public/hidden visibility (Phase 5):** `visible` boolean per I/O test, separate `hidden_unit_test_code` field for unit tests. Students see aggregate results for hidden tests.

## Shared Types (Designed for Both Phases)

These types are defined once in Phase 1 and extended (not reworked) in later phases.

### Executor API types (`pkg/executorapi/types.go`)

```go
type TestRequest struct {
    Code         string       `json:"code"`
    Language     string       `json:"language"`
    IOTests      []IOTestDef  `json:"io_tests,omitempty"`
    UnitTestCode string       `json:"unit_test_code,omitempty"` // Phase 3
    TimeoutMs    *int         `json:"timeout_ms,omitempty"`
}

type IOTestDef struct {
    Name           string `json:"name"`
    Input          string `json:"input"`
    ExpectedOutput string `json:"expected_output"`
    MatchType      string `json:"match_type"` // "exact" for now
}

type TestResponse struct {
    Results []TestResult `json:"results"`
    Summary TestSummary  `json:"summary"`
}

type TestResult struct {
    Name     string  `json:"name"`
    Type     string  `json:"type"`   // "io" or "unit"
    Status   string  `json:"status"` // "passed", "failed", "error"
    Input    *string `json:"input,omitempty"`    // I/O only
    Expected *string `json:"expected,omitempty"` // I/O only
    Actual   *string `json:"actual,omitempty"`   // I/O only
    Message  *string `json:"message,omitempty"`  // unit tests: assertion message
    Stderr   *string `json:"stderr,omitempty"`
    TimeMs   int64   `json:"time_ms"`
}

type TestSummary struct {
    Total   int   `json:"total"`
    Passed  int   `json:"passed"`
    Failed  int   `json:"failed"`
    Errors  int   `json:"errors"`
    TimeMs  int64 `json:"time_ms"`
}
```

### I/O Case Definition (stored on problem and student_work)

```go
type IOTestCase struct {
    Name           string  `json:"name"`
    Input          string  `json:"input"`
    ExpectedOutput *string `json:"expected_output,omitempty"` // nil = no validation, just run
    MatchType      string  `json:"match_type,omitempty"`      // "exact" default
    RandomSeed     *int    `json:"random_seed,omitempty"`
    AttachedFiles  []File  `json:"attached_files,omitempty"`
    Order          int     `json:"order"`
}
```

### Frontend types (`frontend/src/types/problem.ts`)

Mirror the Go types. Replace the existing speculative `TestCase`/`TestCaseType` types with IOTestCase and TestResult.

### Database

- `problems.test_cases JSONB` — repurposed for I/O test case definitions (instructor-defined)
- `problems.unit_test_code TEXT` — added in Phase 3
- `student_work.test_cases JSONB` — new column for student-defined I/O cases (Phase 2)

## Phases & Subtasks

### Phase 1: Schema + Executor Foundation

#### 1.1 — Define test data model and shared types

Define the I/O test case schema, shared Go types for test requests/results, and frontend types. Design types to accommodate both I/O and unit tests from the start. Also define student-defined case types.

**Files to modify:**
- `pkg/executorapi/types.go` — add TestRequest, TestResponse, TestResult, TestSummary, IOTestDef
- `go-backend/internal/store/interfaces.go` — add IOTestCase type (DB representation for problem + student_work), update Problem struct docs
- `frontend/src/types/problem.ts` — replace speculative TestCase types with IOTestCase and TestResult types
- `frontend/src/types/api.ts` — update Problem wire type

**Files to read for context:**
- `pkg/executorapi/types.go` — existing executor types (ExecuteRequest, ExecuteResponse)
- `go-backend/internal/store/interfaces.go` — existing Problem, StudentWork structs
- `frontend/src/types/problem.ts` — existing test case types to replace
- `frontend/src/types/api.ts` — existing API Problem type

**Implementation steps:**
1. Add Go types to `pkg/executorapi/types.go`: TestRequest, TestResponse, TestResult, TestSummary, IOTestDef
2. Add IOTestCase type to `go-backend/internal/store/interfaces.go` (matches JSONB schema, includes optional expected_output, random_seed, attached_files)
3. Replace speculative frontend TestCase/TestCaseType/TestConfig types in `problem.ts` with new IOTestCase and TestResult types
4. Update `api.ts` Problem type to reference new IOTestCase type for test_cases field
5. No migration needed yet — existing `test_cases` JSONB column works, just redefining expected schema

**Testing notes:** Type-only changes. Verify frontend builds (`make typecheck-frontend`). If any existing code references old TestCase types (e.g., ProblemDisplay.tsx test case rendering), update or remove.

---

#### 1.2 — Executor POST /test endpoint (I/O tests)

New endpoint on the executor that accepts student code + I/O test definitions, runs all tests in a single sandbox invocation using a generated wrapper script, and returns structured pass/fail results.

**Files to modify:**
- `executor/internal/handler/test.go` — new handler for POST /test
- `executor/internal/handler/test_test.go` — unit tests
- `executor/internal/handler/routes.go` — register /test route
- `executor/internal/sandbox/io_test_runner.py` — Python wrapper script (new, embedded via go:embed)
- `executor/Dockerfile` — install pytest (for Phase 3, but do it now to avoid a future rebuild)

**Files to read for context:**
- `executor/internal/handler/execute.go` — existing /execute handler (follow same patterns: validation, sandbox invocation, response construction)
- `executor/internal/handler/trace.go` — example of wrapper script embedding (tracer pattern)
- `executor/internal/sandbox/sandbox.go` — sandbox runner interface (Runner.Run)
- `executor/internal/tracer/tracer.go` — go:embed pattern for Python scripts
- `pkg/executorapi/types.go` — shared types from 1.1
- `executor/CLAUDE.md` — executor conventions

**Implementation steps:**
1. Create `io_test_runner.py` — Python script that:
   - Receives student code filename + JSON test definitions file path as args
   - For each test: runs student code as subprocess with stdin=test.input, random_seed and attached_files configured, captures stdout/stderr
   - Compares stdout to expected_output (strip trailing whitespace for "exact" match). If expected_output is null/missing, reports status as "passed" (just ran successfully) with actual output.
   - Outputs JSON results array to stdout
   - Handles: timeouts per test, crashes, empty output
2. Embed the script using `go:embed` (follow tracer.go pattern)
3. Create `test.go` handler:
   - Validate TestRequest (code required, at least one of io_tests or unit_test_code)
   - Write student code to temp dir (solution.py or Main.java based on language)
   - Write test definitions as JSON file
   - Write wrapper script to temp dir
   - Run wrapper in sandbox via Runner.Run
   - Parse JSON output from stdout into TestResponse
   - Return response
4. For Java: wrapper compiles student code once (`javac`), then runs `java Main` per test
5. Register `POST /test` route in `routes.go`
6. Unit tests covering: all pass, some fail, student code crashes, timeout, empty test list, no expected output (run-only case), Java compilation failure

**Testing notes:**
- Unit tests mock sandbox runner (same pattern as execute_test.go)
- Integration test: run actual executor with real sandbox if available
- Verify wrapper handles edge cases: empty stdout, very long output, no trailing newline, student code reads past EOF

---

#### 1.3 — Backend test execution API

Backend handler that accepts test execution requests from the frontend, loads problem test definitions, merges with student-defined cases, calls the executor /test endpoint, and returns results.

**Files to modify:**
- `go-backend/internal/handler/test_execution.go` — new handler
- `go-backend/internal/handler/test_execution_test.go` — unit tests
- `go-backend/internal/handler/routes.go` — register routes
- `go-backend/internal/executor/client.go` — add RunTests method to executor client interface

**Files to read for context:**
- `go-backend/internal/handler/student_work.go` — existing Execute handler (follow same auth pattern)
- `go-backend/internal/handler/execute.go` — session-based execution handler
- `go-backend/internal/executor/client.go` — existing executor client (ExecuteCode method)
- `go-backend/internal/store/interfaces.go` — Problem and StudentWork types
- `go-backend/CLAUDE.md` — backend conventions

**Implementation steps:**
1. Add `RunTests(ctx, TestRequest) (TestResponse, error)` to executor client interface and HTTP implementation (calls executor POST /test).
2. Create handler with two endpoints:
   - `POST /api/v1/student-work/{id}/test` — practice mode: loads student work + problem, extracts I/O test cases from problem.test_cases, sends to executor with student's current code, returns TestResponse
   - `POST /api/v1/sessions/{id}/test` — live session mode: similar but loads problem from session snapshot
3. Optional request body: `{ "test_name": "foo" }` to run a single test. If omitted, runs all.
4. Auth: same patterns as existing execute handlers (student can test own work, instructor can test any).
5. Register routes in routes.go.

**Testing notes:**
- Unit tests with mock executor client
- Integration test: test execution with real DB + mock executor
- Contract test: verify request/response shapes match frontend types

---

### Phase 2: I/O Tests End-to-End

#### 2.1 — Instructor I/O case authoring UI

Add a case authoring section to ProblemCreator where instructors define I/O test cases. Each case has: name, input (stdin), expected output (optional), random_seed (optional), attached_files (optional). Cases with expected output are tests; cases without are example inputs for students.

**Files to modify:**
- `frontend/src/app/(app)/instructor/components/ProblemCreator.tsx` — add cases section, remove or repurpose execution settings section
- `frontend/src/app/(app)/instructor/components/IOCaseForm.tsx` — new component for I/O case list editing
- `frontend/src/lib/api/problems.ts` — ensure test_cases sent correctly on create/update

**Files to read for context:**
- `frontend/src/app/(app)/instructor/components/ProblemCreator.tsx` — current form structure, execution settings section
- `frontend/src/types/problem.ts` — IOTestCase type from 1.1
- `frontend/src/lib/api/problems.ts` — existing API client
- `frontend/src/components/ui/` — available UI primitives

**Implementation steps:**
1. Create `IOCaseForm.tsx` component:
   - Renders an ordered list of I/O case definitions
   - Each case: name (text), input/stdin (textarea), expected output (textarea, optional — empty means "no validation"), random_seed (number, optional), attached_files (file name + content pairs, optional)
   - Add/remove/reorder controls
   - Clear visual distinction between cases with and without expected output (e.g., "test case" vs "example input" label)
2. Integrate into ProblemCreator:
   - Replace or evolve the existing "Execution Settings" section into a "Cases" section
   - The old single-stdin execution settings concept is replaced by the cases list. Migration note: if a problem has execution_settings.stdin but no test_cases, could auto-create a single unnamed case from it (but this is a nice-to-have).
   - Wire form state to create/update API calls
3. Ensure test_cases serialized correctly as JSONB array on save.

**Testing notes:**
- Component tests for IOCaseForm (render, add, remove, reorder, optional fields)
- Verify API calls include test_cases payload

---

#### 2.2 — Student cases sidebar + I/O results display

Replace the execution settings panel with a cases sidebar. Students see instructor-defined cases and can add their own. Selecting a case shows its details. Running a case executes code and shows results — pass/fail with diff for cases with expected output, just output for cases without.

**Files to modify:**
- `frontend/src/app/(fullscreen)/student/components/CodeEditor.tsx` — replace Settings icon with Cases icon in activity bar, update output pane to show case results
- `frontend/src/app/(fullscreen)/student/components/CasesPanel.tsx` — new sidebar panel (replaces execution settings panel)
- `frontend/src/app/(fullscreen)/student/components/CaseResultDisplay.tsx` — new component for rendering case results (output view for run-only, diff view for test cases)
- `frontend/src/hooks/useCaseRunner.ts` — new hook managing case execution state
- `frontend/src/lib/api/tests.ts` — new API client for test execution endpoints

**Files to read for context:**
- `frontend/src/app/(fullscreen)/student/components/CodeEditor.tsx` — activity bar pattern, execution settings panel, output pane structure
- `frontend/src/app/(fullscreen)/student/components/DebuggerSidebar.tsx` — sidebar panel pattern to follow
- `frontend/src/app/(fullscreen)/student/components/OutputPanel.tsx` — output display pattern
- `frontend/src/app/(fullscreen)/student/page.tsx` — page-level state management, execution settings state
- `frontend/src/hooks/useApiDebugger.ts` — hook pattern to follow
- `frontend/src/types/problem.ts` — IOTestCase and TestResult types

**Implementation steps:**
1. Create `useCaseRunner` hook:
   - State: `caseResults` (map of case name → result), `isRunning`, `selectedCase`, `error`
   - Methods: `runAllCases(workId)`, `runCase(workId, caseName)` — calls backend test API
   - Manages both instructor cases (from problem) and student cases (from student_work)
2. Create API client `tests.ts`:
   - `runTests(studentWorkId, testName?)` → POST /api/v1/student-work/{id}/test
   - `runSessionTests(sessionId, studentId, testName?)` → POST /api/v1/sessions/{id}/test
3. Create `CasesPanel.tsx` sidebar:
   - Flat list of all cases (instructor + student-defined)
   - Each item: name, source badge (instructor/mine), result badge (pass/fail/not run)
   - "Run All" button at top
   - Individual run button per case
   - "Add Case" button for students to define their own input
   - Selected case shows detail: input fields (read-only for instructor cases, editable for student cases), expected output if defined
4. Create `CaseResultDisplay.tsx` for the output pane:
   - Case without expected output: show actual output (like today's output pane)
   - Case with expected output, passed: green pass indicator + output
   - Case with expected output, failed: input shown + side-by-side or inline diff of expected vs actual
   - Error: error message
   - Summary bar when "Run All": "4/5 cases passed"
5. Integrate into CodeEditor.tsx:
   - Replace Settings icon with Cases icon (or rename — beaker/flask icon)
   - CasesPanel replaces the execution settings sidebar
   - Output pane shows CaseResultDisplay when case results available
   - The existing "Run" button behavior: runs the currently selected case (or runs code with no case if none selected)
   - Mobile: update mobile action bar accordingly
6. Student-defined cases: stored on student_work as JSONB (needs migration to add test_cases column to student_work table).

**Testing notes:**
- Component tests for CasesPanel and CaseResultDisplay
- Hook tests for useCaseRunner with mocked API
- Contract test for test execution endpoints
- Migration test for student_work.test_cases column
- E2E consideration: instructor creates problem with cases → student sees cases → runs them → sees results; student adds own case → runs it

---

### Phase 3: Unit Tests

#### 3.1 — Executor pytest/junit support

Extend the executor /test endpoint to accept unit test code, run it via pytest (Python) or junit (Java) in the sandbox, parse JUnit XML results, and return structured TestResult objects.

**Files to modify:**
- `executor/internal/handler/test.go` — extend to handle unit_test_code field
- `executor/internal/handler/test_test.go` — add unit test cases
- `executor/internal/sandbox/unit_test_runner.py` — new Python wrapper for pytest execution (embedded)
- `executor/Dockerfile` — verify pytest is installed (should be from 1.2)

**Files to read for context:**
- `executor/internal/handler/test.go` — I/O test handler from 1.2
- `executor/internal/sandbox/io_test_runner.py` — wrapper script pattern from 1.2
- `docs/design/PROBLEM_REPOS.md` — JUnit XML format reference
- `executor/CLAUDE.md`

**Implementation steps:**
1. Create `unit_test_runner.py` wrapper:
   - Receives student code + test code as files in sandbox
   - For Python: writes student code as importable module (solution.py), writes test code as test file (test_solution.py), runs `pytest test_solution.py -v --tb=short --junitxml=results.xml`
   - Parses JUnit XML, outputs structured JSON results
   - For Java: compiles student + test code, runs junit
2. Extend test.go handler: if `unit_test_code` is provided, use unit test wrapper
3. Parse JUnit XML → TestResult objects with type="unit", status, message (assertion text), time
4. If both io_tests and unit_test_code provided, run both and merge results into single TestResponse
5. Verify pytest installed in Dockerfile

**Testing notes:**
- Unit tests: mock sandbox, verify JUnit XML parsing
- Integration tests with real sandbox: passing tests, failing assertions, compilation errors, import errors, infinite loops

---

#### 3.2 — Unit test schema, authoring, and results UI

Add unit test code storage to problems, instructor code editor for writing unit tests, and student UI for viewing unit test results. Selecting a unit test case in the sidebar opens the test file as a read-only tab in the code editor and jumps to that test function.

**Files to modify:**
- New migration: add `unit_test_code TEXT` column to problems table
- `go-backend/internal/store/interfaces.go` — add UnitTestCode field to Problem struct
- `go-backend/internal/store/problems.go` — include unit_test_code in CRUD queries
- `go-backend/internal/handler/problems.go` — accept unit_test_code in create/update
- `go-backend/internal/handler/test_execution.go` — send unit_test_code to executor
- `frontend/src/app/(app)/instructor/components/ProblemCreator.tsx` — add unit test editor tab
- `frontend/src/app/(fullscreen)/student/components/CodeEditor.tsx` — add tab support (student code tab + read-only test file tabs)
- `frontend/src/app/(fullscreen)/student/components/CasesPanel.tsx` — when unit test case selected, open test file tab and jump to line
- `frontend/src/app/(fullscreen)/student/components/CaseResultDisplay.tsx` — unit test result rendering (assertion failures, hide stack traces)

**Files to read for context:**
- Existing problem CRUD files (store, handler)
- ProblemCreator.tsx (current form, existing Monaco editor tabs for starter/solution)
- CasesPanel.tsx and CaseResultDisplay.tsx from 2.2
- CodeEditor.tsx tab integration points

**Implementation steps:**
1. Migration: `ALTER TABLE problems ADD COLUMN unit_test_code TEXT`
2. Update Go types: add `UnitTestCode *string` to Problem, CreateProblemParams, UpdateProblemParams
3. Update store queries to include unit_test_code
4. Update handler to accept/return unit_test_code
5. Update test_execution handler: include unit_test_code in TestRequest to executor
6. Instructor UI: add "Unit Tests" tab alongside "Starter Code" / "Solution" in ProblemCreator with Monaco editor, language-aware (pytest for Python, junit for Java)
7. Student editor tabs:
   - Refactor CodeEditor to support multiple tabs: "My Code" (editable, always present) + read-only tabs for test files
   - When unit test code exists on the problem, it's available as a read-only tab
   - Selecting a unit test case in CasesPanel opens/focuses the test file tab and scrolls to the relevant test function
8. Unit test results in CaseResultDisplay: show test name + assertion failure message on failure, hide internal pytest stack traces. Show pass/fail status same as I/O cases.
9. Unit test cases appear in CasesPanel sidebar alongside I/O cases — same flat list, different icon/badge to distinguish type. Unit test case names extracted from test file (parse function names starting with `test_`).

**Testing notes:**
- Migration test: verify column added
- Store integration tests: CRUD with unit_test_code
- Handler unit tests: create/update with unit_test_code
- Frontend component tests: unit test editor renders, tab switching works, test results display correctly for unit type
- Contract tests: verify API shapes

---

### Phase 4: Trace Debugging for Tests

#### 4.1 — Test trace debugging

Add "Debug" button on failed cases. For I/O cases, trace student code with the case's stdin/random_seed (existing tracer works). For unit tests, backend wraps test function + student code together and passes to tracer so student can step through the test calling their code.

**Files to modify:**
- `frontend/src/app/(fullscreen)/student/components/CaseResultDisplay.tsx` — add Debug button per failed case
- `frontend/src/app/(fullscreen)/student/components/CasesPanel.tsx` — wire debug action to existing debugger
- `frontend/src/hooks/useCaseRunner.ts` — add debugCase method
- `go-backend/internal/handler/test_execution.go` — add trace endpoint for test cases (or extend existing trace handler)

**Files to read for context:**
- `frontend/src/hooks/useApiDebugger.ts` — existing debugger hook
- `frontend/src/app/(fullscreen)/student/components/DebuggerSidebar.tsx` — debugger UI
- `go-backend/internal/handler/session_trace.go` — existing trace handler
- `executor/internal/handler/trace.go` — executor trace endpoint
- `executor/internal/tracer/script.py` — Python tracer internals

**Implementation steps:**
1. I/O case debugging: when user clicks "Debug" on a failed I/O case, call existing trace endpoint with the student's code and the case's stdin + random_seed. This already works.
2. Unit test debugging: backend generates a wrapper that inlines the student's code and the specific test function, passes to tracer. The tracer captures execution through both test and student code. Frontend shows the trace.
3. Add `debugCase(caseName)` to useCaseRunner hook that triggers the debugger.
4. When debug trace completes, switch to debugger view (existing DebuggerSidebar + DebuggerPanel).

**Testing notes:**
- Verify I/O case debugging works with existing tracer (mostly integration)
- Verify unit test wrapper generates valid traceable code
- Frontend tests: Debug button appears on failed cases, clicking triggers trace

---

### Phase 5: Public/Hidden Test Visibility

#### 5.1 — Test visibility model

Add visibility flag to cases/tests. Instructors mark them as public (student sees definition + full results) or hidden (student sees only aggregate pass/fail count). Instructors always see everything.

**Files to modify:**
- New migration: add `hidden_unit_test_code TEXT` column, add `visible` to IOTestCase schema convention
- `go-backend/internal/store/interfaces.go` — IOTestCase type gets Visible field
- `go-backend/internal/handler/test_execution.go` — filter results based on visibility + user role
- `go-backend/internal/handler/problems.go` — strip hidden test details when serving to students
- `frontend/src/app/(app)/instructor/components/IOCaseForm.tsx` — visibility toggle per case
- `frontend/src/app/(app)/instructor/components/ProblemCreator.tsx` — hidden unit test editor tab
- `frontend/src/app/(fullscreen)/student/components/CasesPanel.tsx` — show/hide based on visibility
- `frontend/src/app/(fullscreen)/student/components/CaseResultDisplay.tsx` — aggregate display for hidden

**Files to read for context:**
- docs/design/PROBLEM_REPOS.md — Phase 2 visibility model (visible vs .overlay/)
- Existing handler auth patterns (role-based response filtering)

**Implementation steps:**
1. I/O cases: add `visible` boolean field (default true) to IOTestCase schema. Instructors toggle per case.
2. Unit tests: split into `unit_test_code` (public, student can see) and `hidden_unit_test_code` (hidden). Two separate editor tabs for instructor.
3. Backend: when serving problem to student role, strip hidden I/O case details (keep count only) and exclude hidden unit test code entirely.
4. Backend: test execution always runs all tests (visible + hidden), but marks results with visibility. Frontend filters display.
5. Student UI: hidden test results show as "Hidden tests: 3/5 passed" without names or details.
6. Instructor UI: always sees everything, visibility toggles on I/O cases, separate editor for hidden unit tests.

**Testing notes:**
- Integration tests: student vs instructor see different test data on same problem
- Handler tests: visibility filtering by role
- Frontend tests: aggregate display for hidden tests

---

## Dependency Graph

```
1.1 (types)
├── 1.2 (executor /test) ─── depends on 1.1
│   ├── 1.3 (backend API) ─── depends on 1.2
│   │   └── 2.2 (student cases UI) ─── depends on 1.3, 2.1
│   └── 3.1 (executor pytest) ─── depends on 1.2
└── 2.1 (instructor authoring) ─── depends on 1.1, parallel with 1.2/1.3

3.2 (unit test schema+UI) ─── depends on 3.1, 2.2
4.1 (tracing) ─── depends on 2.2, 3.2
5.1 (visibility) ─── depends on 2.2, 3.2
```

2.1 and 1.2 can run in parallel (instructor authoring only needs types, not executor).

## Out of Scope

- Assignment entity (grouping, deadlines) — future epic
- Submission model — future epic
- AI-assisted test generation — future (PLAT-qli.5/6 exist)
- Grading/scoring — future epic
- Large (repo-backed) problems — future epic
