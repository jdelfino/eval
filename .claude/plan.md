# Plan: Auto-publish problem when starting a session

## Problem

When an instructor starts a session from an unpublished problem, students can't join. The `GetOrCreate` handler for student work (`student_work.go:54-73`) validates that the problem is published to the section via `section_problems`. If it isn't, students get a 404 error.

## Solution

Auto-publish the problem to the section when creating a session. Add frontend UX to show this will happen and let the instructor choose whether to show the solution.

## Changes

### 1. Backend: Add idempotent ensure-publish store method

**File:** `go-backend/internal/store/section_problems.go`

Add `EnsureSectionProblem()` method that does `INSERT INTO section_problems ... ON CONFLICT (section_id, problem_id) DO NOTHING`. This only creates the record if it doesn't already exist — it never updates an existing publication's `show_solution`.

**File:** `go-backend/internal/store/interfaces.go`

Add `EnsureSectionProblem` to `SectionProblemRepository` interface.

### 2. Backend: Auto-publish in session creation handler

**File:** `go-backend/internal/handler/sessions.go`

- Add `ShowSolution *bool` field to `createSessionRequest`
- In `Create` handler (after fetching the problem, before creating the session): call `repos.EnsureSectionProblem()` with the section_id, problem_id, creator user_id, and show_solution (default false)

### 3. Frontend: Update `createSession` API to accept `show_solution`

**File:** `frontend/src/lib/api/sessions.ts`

Add optional `showSolution` param to `createSession()`.

### 4. Frontend: Add publish UX to `CreateSessionFromProblemModal`

**File:** `frontend/src/app/(app)/instructor/components/CreateSessionFromProblemModal.tsx`

- When a section is selected, check if problem is published to it (use `listProblemSections(problemId)` which is already available)
- If NOT published: show a "Publish to section" info box with a forced-checked checkbox (disabled) and a "Show solution to students" toggle (defaults off)
- If ALREADY published: show a small note "Already published to this section"
- Pass `showSolution` to `createSession()`

### 5. Frontend: Add publish UX to `StartSessionModal`

**File:** `frontend/src/app/(app)/instructor/components/StartSessionModal.tsx`

- When a problem (not blank) is selected, check if it's published to the section (fetch `listSectionProblems(sectionId)` once on mount, compare against selected problem)
- Same UX as above: forced publish checkbox + show solution toggle
- Pass `showSolution` to `createSession()`

### 6. Tests

- **Backend unit test:** Test that session creation auto-publishes the problem. Test idempotency (creating a session for an already-published problem doesn't error or change show_solution).
- **Frontend unit tests:** Test that modals show publish UX when problem isn't published, and "already published" note when it is.
