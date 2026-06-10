-- Migration: 024_student_work_solved_state.down.sql
--
-- Reverses 024: drops last_run_all_passed and last_run_at from student_work.

ALTER TABLE student_work
  DROP COLUMN IF EXISTS last_run_all_passed,
  DROP COLUMN IF EXISTS last_run_at;
