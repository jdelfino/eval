-- Migration: 014_cleanup_session_students_revisions.down.sql
--
-- Rollback: restore old columns and constraints.

-- Revert revisions.student_work_id NOT NULL
ALTER TABLE revisions ALTER COLUMN student_work_id DROP NOT NULL;

-- Revert revisions.session_id nullability
ALTER TABLE revisions ALTER COLUMN session_id SET NOT NULL;

-- Restore session_students.last_update column name
ALTER TABLE session_students RENAME COLUMN joined_at TO last_update;

-- Restore old columns (empty, cannot restore old data)
ALTER TABLE session_students ADD COLUMN execution_settings JSONB;
ALTER TABLE session_students ADD COLUMN code TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN session_students.code IS 'Student code (deprecated, use student_work)';
COMMENT ON COLUMN session_students.execution_settings IS 'Execution settings (deprecated, use student_work)';
