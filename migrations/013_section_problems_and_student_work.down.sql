-- Migration: 013_section_problems_and_student_work.down.sql
--
-- Reverses the section_problems and student_work migration.
-- Drops new columns and tables in reverse order.

-- Drop indexes and columns from existing tables first
DROP INDEX IF EXISTS idx_revisions_student_work;
ALTER TABLE revisions DROP COLUMN IF EXISTS student_work_id;

DROP INDEX IF EXISTS idx_session_students_work;
ALTER TABLE session_students DROP COLUMN IF EXISTS student_work_id;

-- Drop new tables (in reverse order of creation)
DROP TABLE IF EXISTS student_work;
DROP TABLE IF EXISTS section_problems;

-- Note: We do NOT restore fake practice sessions that were deleted.
-- Those were test artifacts and should not be restored.
