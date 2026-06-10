-- Migration: 024_student_work_solved_state.up.sql
--
-- Adds last_run_all_passed and last_run_at columns to student_work to persist
-- per-problem solved state (DEC-1 closure). Written by the /execute handler
-- when student_work_id is provided; exposed on PublishedProblemWithStatus
-- and StudentProgress payloads.
--
-- RLS note: no new policies needed.
-- Verification: migration 013 defines the student_work UPDATE policy as:
--   "Students can UPDATE their own work:
--    (user_id = app_user_id() AND namespace_id = app_namespace_id()) OR is_system_admin()"
-- The /execute handler writes in the caller's RLS context. Only the owning
-- student's row satisfies app_user_id() == user_id, so the update policy
-- correctly covers write access and implicitly blocks writes from other users
-- (their row will not be found / 0 rows affected). This is column-agnostic;
-- the update policy covers all columns including the new ones here.

ALTER TABLE student_work
  ADD COLUMN last_run_all_passed BOOLEAN,
  ADD COLUMN last_run_at TIMESTAMPTZ;

COMMENT ON COLUMN student_work.last_run_all_passed IS
  'True when the most recent graded run included every canonical test case and all passed. NULL = never graded.';

COMMENT ON COLUMN student_work.last_run_at IS
  'Timestamp of the most recent graded run. NULL = never graded.';
