-- Migration: 019_student_work_test_cases.up.sql
--
-- Adds test_cases JSONB column to student_work table for student-defined I/O test cases.
-- Instructor-defined test cases already live on problems.test_cases (JSONB).
--
-- The new column stores an array of IOTestCase definitions:
--   [{name, input, expected_output (optional), match_type, random_seed (opt), attached_files (opt), order}]
--
-- RLS note: no new policies needed — the existing student_work RLS policies
-- (select/insert/update/delete) already cover all columns on the table.

ALTER TABLE student_work ADD COLUMN test_cases JSONB;

COMMENT ON COLUMN student_work.test_cases IS 'Student-defined I/O test cases (array of IOTestCase JSONB). NULL when no student cases exist.';
