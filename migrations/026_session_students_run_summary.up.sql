-- Migration: 026_session_students_run_summary.up.sql
--
-- Adds session_students.last_run_summary: a nullable JSONB column holding the
-- student's most recent run-all summary under the G4 F8 feature. The student
-- workspace POSTs it to PUT /sessions/{id}/code after a run-all (graded) run;
-- it is persisted here and fanned out on the student_code_updated event and the
-- GET /sessions/{id}/state students payload so the instructor dashboard (roster
-- glyphs, minimap tiles, signals counts) can show pass/fail status.
--
-- Shape: {passed, failed, errors, total, at} where at is an ISO-8601 timestamp.
--
-- CLASSROOM-GRADE CAVEAT: this value is entirely CLIENT-REPORTED. The server does
-- not re-run the student's code or verify the counts; a student could tamper with
-- the reported summary. This is acceptable for the live-classroom dashboard use
-- case (informational glyphs, not grading). Do NOT use it for any authoritative
-- grading decision. NULL = the student has never run-all this session.
--
-- RLS note: no new policies needed.
-- Verification: migration 001 defines the session_students policies (the student
-- INSERT/UPDATE policy is keyed on user_id = app_user_id(), and migration 007
-- adds the instructor/reader SELECT policy). Both are column-agnostic (no WITH
-- CHECK column list and no per-column SELECT restriction), so they already cover
-- the new last_run_summary column. Writes happen via the SetSessionStudentRunSummary
-- store method in the owning student's RLS context, which the existing UPDATE
-- policy permits for that student's own row only.

ALTER TABLE session_students
  ADD COLUMN last_run_summary JSONB;

COMMENT ON COLUMN session_students.last_run_summary IS
  'G4 F8: client-reported run-all summary {passed,failed,errors,total,at}. Classroom-grade — never server-verified; do not use for grading. NULL = never ran.';
