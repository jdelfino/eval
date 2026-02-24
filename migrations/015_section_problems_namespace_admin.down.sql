-- Revert: restore all policies to pre-015 state, drop can_manage_section()

-- ============================================================================
-- session_backend_state: restore original
-- ============================================================================

DROP POLICY "session_backend_state_select" ON session_backend_state;
CREATE POLICY "session_backend_state_select" ON session_backend_state
  FOR SELECT USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND is_section_instructor(s.section_id)
    )
  );

-- ============================================================================
-- session_students: restore original
-- ============================================================================

DROP POLICY "session_students_select" ON session_students;
CREATE POLICY "session_students_select" ON session_students
  FOR SELECT USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND (
        s.creator_id = app_user_id()
        OR is_section_member(s.section_id)
        OR is_section_instructor(s.section_id)
      )
    )
  );

DROP POLICY "session_students_update" ON session_students;
CREATE POLICY "session_students_update" ON session_students
  FOR UPDATE USING (
    user_id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND is_section_instructor(s.section_id)
    )
    OR is_system_admin()
  );

DROP POLICY "session_students_delete" ON session_students;
CREATE POLICY "session_students_delete" ON session_students
  FOR DELETE USING (
    user_id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND is_section_instructor(s.section_id)
    )
    OR is_system_admin()
  );

-- ============================================================================
-- student_work: restore original
-- ============================================================================

DROP POLICY "student_work_select" ON student_work;
CREATE POLICY "student_work_select" ON student_work
  FOR SELECT USING (
    is_system_admin()
    OR (user_id = app_user_id() AND namespace_id = app_namespace_id())
    OR is_section_instructor(section_id)
  );

-- ============================================================================
-- section_problems: restore original (migration 013)
-- ============================================================================

DROP POLICY "section_problems_select" ON section_problems;
CREATE POLICY "section_problems_select" ON section_problems
  FOR SELECT USING (
    is_system_admin()
    OR is_section_member(section_id)
  );

DROP POLICY "section_problems_insert" ON section_problems;
CREATE POLICY "section_problems_insert" ON section_problems
  FOR INSERT WITH CHECK (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

DROP POLICY "section_problems_update" ON section_problems;
CREATE POLICY "section_problems_update" ON section_problems
  FOR UPDATE USING (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

DROP POLICY "section_problems_delete" ON section_problems;
CREATE POLICY "section_problems_delete" ON section_problems
  FOR DELETE USING (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

-- ============================================================================
-- section_memberships: restore original
-- ============================================================================

DROP POLICY "memberships_select" ON section_memberships;
CREATE POLICY "memberships_select" ON section_memberships
  FOR SELECT USING (
    is_system_admin()
    OR user_id = app_user_id()
    OR is_section_member(section_id)
    OR is_section_instructor(section_id)
  );

DROP POLICY "memberships_insert" ON section_memberships;
CREATE POLICY "memberships_insert" ON section_memberships
  FOR INSERT WITH CHECK (
    user_id = app_user_id()
    OR is_section_instructor(section_id)
    OR is_system_admin()
  );

DROP POLICY "memberships_update" ON section_memberships;
CREATE POLICY "memberships_update" ON section_memberships
  FOR UPDATE USING (
    is_section_instructor(section_id)
    OR is_system_admin()
  );

DROP POLICY "memberships_delete" ON section_memberships;
CREATE POLICY "memberships_delete" ON section_memberships
  FOR DELETE USING (
    user_id = app_user_id()
    OR is_section_instructor(section_id)
    OR is_system_admin()
  );

-- ============================================================================
-- sessions: restore original
-- ============================================================================

DROP POLICY "sessions_update" ON sessions;
CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE USING (
    creator_id = app_user_id()
    OR is_section_instructor(section_id)
    OR is_system_admin()
  );

DROP POLICY "sessions_delete" ON sessions;
CREATE POLICY "sessions_delete" ON sessions
  FOR DELETE USING (
    creator_id = app_user_id()
    OR is_section_instructor(section_id)
    OR is_system_admin()
  );

-- ============================================================================
-- sections: restore original
-- ============================================================================

DROP POLICY "sections_update" ON sections;
CREATE POLICY "sections_update" ON sections
  FOR UPDATE USING (
    is_system_admin()
    OR (
      namespace_id = app_namespace_id()
      AND is_section_instructor(id)
    )
  );

DROP POLICY "sections_delete" ON sections;
CREATE POLICY "sections_delete" ON sections
  FOR DELETE USING (
    is_system_admin()
    OR (
      namespace_id = app_namespace_id()
      AND is_section_instructor(id)
    )
  );

-- ============================================================================
-- Drop helper function
-- ============================================================================

DROP FUNCTION IF EXISTS can_manage_section(UUID);
