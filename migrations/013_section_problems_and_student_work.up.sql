-- Migration: 013_section_problems_and_student_work.up.sql
--
-- Adds section_problems and student_work tables to support per-section problem
-- assignments and persistent student work across sessions.
--
-- Changes:
-- 1. Create section_problems table (tracks which problems are assigned to which sections)
-- 2. Create student_work table (persistent student code, replaces ephemeral session_students)
-- 3. Add student_work_id column to session_students (links session state to persistent work)
-- 4. Add student_work_id column to revisions (links revision history to persistent work)
-- 5. Clean up fake practice sessions (completed sessions with < 1 second duration)
--
-- Note: This migration does NOT drop old columns or make revisions.session_id nullable.
-- Those changes happen in a cleanup migration after all Go code is updated.

-- ============================================================================
-- CLEANUP: Remove fake practice sessions
-- ============================================================================
-- These are practice sessions that were completed in less than 1 second,
-- which are artifacts from testing/development.

DELETE FROM sessions WHERE status = 'completed' AND ended_at - created_at < interval '1 second';

-- ============================================================================
-- TABLE: section_problems
-- ============================================================================
-- Tracks which problems are assigned/published to which sections.
-- Replaces the practice session pattern with proper per-section assignments.

CREATE TABLE section_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  published_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_solution BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(section_id, problem_id)
);

COMMENT ON TABLE section_problems IS 'Problems assigned/published to sections';
COMMENT ON COLUMN section_problems.show_solution IS 'Whether solution is visible to students';

CREATE INDEX idx_section_problems_section ON section_problems(section_id);
CREATE INDEX idx_section_problems_problem ON section_problems(problem_id);

-- ============================================================================
-- TABLE: student_work
-- ============================================================================
-- Persistent student work for each (student, problem, section) combination.
-- Replaces the ephemeral session_students table for long-term code storage.

CREATE TABLE student_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  execution_settings JSONB,  -- Student-specific execution settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_update TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, problem_id, section_id)
);

COMMENT ON TABLE student_work IS 'Persistent student work per (student, problem, section)';
COMMENT ON COLUMN student_work.execution_settings IS 'Student-specific execution settings (stdin, etc.)';

CREATE INDEX idx_student_work_user_problem_section ON student_work(user_id, problem_id, section_id);
CREATE INDEX idx_student_work_section ON student_work(section_id);
CREATE INDEX idx_student_work_problem ON student_work(problem_id);

-- ============================================================================
-- ADD COLUMNS: session_students.student_work_id
-- ============================================================================
-- Links session state to persistent student work.
-- Nullable because existing rows won't have it (old Go code doesn't set it).

ALTER TABLE session_students ADD COLUMN student_work_id UUID REFERENCES student_work(id) ON DELETE SET NULL;

CREATE INDEX idx_session_students_work ON session_students(student_work_id);

COMMENT ON COLUMN session_students.student_work_id IS 'Links session state to persistent student work';

-- ============================================================================
-- ADD COLUMNS: revisions.student_work_id
-- ============================================================================
-- Links revision history to persistent student work.
-- Nullable because:
-- 1. Existing revision rows won't have it (old Go code doesn't set it)
-- 2. Old Go code still requires session_id (will be made nullable in cleanup migration)

ALTER TABLE revisions ADD COLUMN student_work_id UUID REFERENCES student_work(id) ON DELETE CASCADE;

CREATE INDEX idx_revisions_student_work ON revisions(student_work_id);

COMMENT ON COLUMN revisions.student_work_id IS 'Links revision to persistent student work';

-- ============================================================================
-- RLS: Enable for new tables
-- ============================================================================

ALTER TABLE section_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_work ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: section_problems
-- ============================================================================

-- Section members can SELECT
CREATE POLICY "section_problems_select" ON section_problems
  FOR SELECT USING (
    is_system_admin()
    OR is_section_member(section_id)
  );

-- Section instructors can INSERT
CREATE POLICY "section_problems_insert" ON section_problems
  FOR INSERT WITH CHECK (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

-- Section instructors can UPDATE
CREATE POLICY "section_problems_update" ON section_problems
  FOR UPDATE USING (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

-- Section instructors can DELETE
CREATE POLICY "section_problems_delete" ON section_problems
  FOR DELETE USING (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

-- Reader role can SELECT (bypass RLS for read-only access)
CREATE POLICY reader_select ON section_problems FOR SELECT TO reader USING (true);

-- ============================================================================
-- RLS POLICIES: student_work
-- ============================================================================

-- Students can SELECT their own work; section instructors can SELECT all work in their sections
CREATE POLICY "student_work_select" ON student_work
  FOR SELECT USING (
    is_system_admin()
    OR (user_id = app_user_id() AND namespace_id = app_namespace_id())
    OR is_section_instructor(section_id)
  );

-- Students can INSERT their own work
CREATE POLICY "student_work_insert" ON student_work
  FOR INSERT WITH CHECK (
    (user_id = app_user_id() AND namespace_id = app_namespace_id())
    OR is_system_admin()
  );

-- Students can UPDATE their own work
CREATE POLICY "student_work_update" ON student_work
  FOR UPDATE USING (
    (user_id = app_user_id() AND namespace_id = app_namespace_id())
    OR is_system_admin()
  );

-- Only system admin can DELETE student work
CREATE POLICY "student_work_delete" ON student_work
  FOR DELETE USING (is_system_admin());

-- Reader role can SELECT (bypass RLS for read-only access)
CREATE POLICY reader_select ON student_work FOR SELECT TO reader USING (true);
