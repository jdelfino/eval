-- Migration: 026_session_students_run_summary.down.sql
--
-- Drops session_students.last_run_summary, reverting the G4 F8 per-student
-- run-summary column.

ALTER TABLE session_students
  DROP COLUMN last_run_summary;
