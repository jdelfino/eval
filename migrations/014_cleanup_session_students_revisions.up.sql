-- Migration: 014_cleanup_session_students_revisions.up.sql
--
-- Final cleanup after student_work migration. Drops old redundant columns
-- and tightens constraints.
--
-- Changes:
-- 1. Drop old columns from session_students (code, execution_settings)
-- 2. Rename session_students.last_update to joined_at (more semantically accurate)
-- 3. Make revisions.session_id nullable (practice revisions have no session)
-- 4. Backfill revisions.student_work_id for existing rows
-- 5. Make revisions.student_work_id NOT NULL after backfill

-- ============================================================================
-- DROP OLD COLUMNS: session_students
-- ============================================================================
-- These columns are no longer used; student_work table holds this data.

ALTER TABLE session_students DROP COLUMN code;
ALTER TABLE session_students DROP COLUMN execution_settings;

-- Rename last_update to joined_at (semantically clearer)
ALTER TABLE session_students RENAME COLUMN last_update TO joined_at;

COMMENT ON COLUMN session_students.joined_at IS 'When student joined the session';

-- ============================================================================
-- REVISIONS: Make session_id nullable
-- ============================================================================
-- Practice revisions have no session; only student_work_id.

ALTER TABLE revisions ALTER COLUMN session_id DROP NOT NULL;

COMMENT ON COLUMN revisions.session_id IS 'Session ID (nullable for practice revisions)';

-- ============================================================================
-- REVISIONS: Backfill student_work_id
-- ============================================================================
-- For existing revisions created during live sessions, populate student_work_id
-- by looking up the session_students.student_work_id.

UPDATE revisions r
SET student_work_id = ss.student_work_id
FROM session_students ss
WHERE r.session_id = ss.session_id
  AND r.user_id = ss.user_id
  AND r.student_work_id IS NULL
  AND ss.student_work_id IS NOT NULL;

-- ============================================================================
-- REVISIONS: Delete orphan revisions that could not be backfilled
-- ============================================================================
-- Orphan revisions have no matching session_students row (e.g., from deleted
-- sessions or the old practice flow). Delete them before applying NOT NULL.

DELETE FROM revisions WHERE student_work_id IS NULL;

-- ============================================================================
-- REVISIONS: Make student_work_id NOT NULL
-- ============================================================================
-- All remaining rows now have student_work_id set (either from backfill or new code).

ALTER TABLE revisions ALTER COLUMN student_work_id SET NOT NULL;

COMMENT ON COLUMN revisions.student_work_id IS 'Student work ID (required)';
