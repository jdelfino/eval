-- Migration: 017_preview_students.up.sql
-- Created: 2026-02-28
--
-- Creates the preview_students table that links instructors to their shadow
-- preview student users. Each instructor has at most one preview student
-- (enforced by PRIMARY KEY on instructor_id), and each preview student user
-- is assigned to at most one instructor (enforced by UNIQUE on student_user_id).
--
-- RLS policies allow:
-- - SELECT: instructor sees their own row; system-admins see all
-- - INSERT: instructors or higher (used by the application when lazily creating
--           a preview student on first use)
-- - DELETE: instructor deletes their own row; system-admins delete any row

-- ============================================================================
-- TABLE
-- ============================================================================

CREATE TABLE preview_students (
  instructor_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE preview_students IS 'Maps each instructor to their shadow preview student user';
COMMENT ON COLUMN preview_students.instructor_id IS 'The instructor who owns this preview student (PK — one per instructor)';
COMMENT ON COLUMN preview_students.student_user_id IS 'The shadow student user used when the instructor previews as a student';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE preview_students ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: instructor sees only their own row; system-admin sees all
CREATE POLICY "preview_students_select" ON preview_students
  FOR SELECT USING (
    is_system_admin() OR instructor_id = app_user_id()
  );

-- Instructors (and admins) can insert — the app creates the preview student
-- lazily on first use
CREATE POLICY "preview_students_insert" ON preview_students
  FOR INSERT WITH CHECK (
    is_instructor_or_higher()
  );

-- Instructor can delete their own row; system-admin can delete any row
CREATE POLICY "preview_students_delete" ON preview_students
  FOR DELETE USING (
    instructor_id = app_user_id() OR is_system_admin()
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, DELETE ON preview_students TO eval_app;
