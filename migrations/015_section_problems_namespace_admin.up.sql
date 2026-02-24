-- Migration: 015_section_problems_namespace_admin.up.sql
--
-- Introduces can_manage_section() helper and updates RLS policies across all
-- tables that use is_section_instructor() to also allow namespace-admins.
--
-- Previously, only section instructors and system-admins could manage section
-- resources (publish problems, update sections, manage sessions, etc.). This
-- caused 500 errors when namespace-admins tried those operations because
-- middleware grants them the permission but RLS blocked the database call.
--
-- can_manage_section(section_id) is now the single source of truth for
-- "can this user manage this section?" — combining system-admin,
-- section-instructor, and namespace-admin checks in one place.

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

CREATE FUNCTION can_manage_section(section_id_param UUID) RETURNS boolean AS $$
  SELECT is_system_admin()
      OR is_section_instructor(section_id_param)
      OR (has_role('namespace-admin') AND EXISTS (
           SELECT 1 FROM sections
           WHERE id = section_id_param
           AND namespace_id = app_namespace_id()
         ));
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION can_manage_section IS 'Returns true if session user is system-admin, section instructor, or namespace-admin for the section''s namespace';

-- ============================================================================
-- sections: UPDATE/DELETE now include namespace-admins
-- ============================================================================

DROP POLICY "sections_update" ON sections;
CREATE POLICY "sections_update" ON sections
  FOR UPDATE USING (can_manage_section(id));

DROP POLICY "sections_delete" ON sections;
CREATE POLICY "sections_delete" ON sections
  FOR DELETE USING (can_manage_section(id));

-- ============================================================================
-- sessions: UPDATE/DELETE now include namespace-admins
-- ============================================================================

DROP POLICY "sessions_update" ON sessions;
CREATE POLICY "sessions_update" ON sessions
  FOR UPDATE USING (
    creator_id = app_user_id()
    OR can_manage_section(section_id)
  );

DROP POLICY "sessions_delete" ON sessions;
CREATE POLICY "sessions_delete" ON sessions
  FOR DELETE USING (
    creator_id = app_user_id()
    OR can_manage_section(section_id)
  );

-- ============================================================================
-- section_memberships: all policies now include namespace-admins
-- ============================================================================

DROP POLICY "memberships_select" ON section_memberships;
CREATE POLICY "memberships_select" ON section_memberships
  FOR SELECT USING (
    user_id = app_user_id()
    OR is_section_member(section_id)
    OR can_manage_section(section_id)
  );

DROP POLICY "memberships_insert" ON section_memberships;
CREATE POLICY "memberships_insert" ON section_memberships
  FOR INSERT WITH CHECK (
    user_id = app_user_id()
    OR can_manage_section(section_id)
  );

DROP POLICY "memberships_update" ON section_memberships;
CREATE POLICY "memberships_update" ON section_memberships
  FOR UPDATE USING (can_manage_section(section_id));

DROP POLICY "memberships_delete" ON section_memberships;
CREATE POLICY "memberships_delete" ON section_memberships
  FOR DELETE USING (
    user_id = app_user_id()
    OR can_manage_section(section_id)
  );

-- ============================================================================
-- section_problems: all policies now use can_manage_section
-- ============================================================================

DROP POLICY "section_problems_select" ON section_problems;
CREATE POLICY "section_problems_select" ON section_problems
  FOR SELECT USING (
    is_section_member(section_id)
    OR can_manage_section(section_id)
  );

DROP POLICY "section_problems_insert" ON section_problems;
CREATE POLICY "section_problems_insert" ON section_problems
  FOR INSERT WITH CHECK (can_manage_section(section_id));

DROP POLICY "section_problems_update" ON section_problems;
CREATE POLICY "section_problems_update" ON section_problems
  FOR UPDATE USING (can_manage_section(section_id));

DROP POLICY "section_problems_delete" ON section_problems;
CREATE POLICY "section_problems_delete" ON section_problems
  FOR DELETE USING (can_manage_section(section_id));

-- ============================================================================
-- student_work: SELECT now includes namespace-admins
-- ============================================================================

DROP POLICY "student_work_select" ON student_work;
CREATE POLICY "student_work_select" ON student_work
  FOR SELECT USING (
    (user_id = app_user_id() AND namespace_id = app_namespace_id())
    OR can_manage_section(section_id)
  );

-- ============================================================================
-- session_students: SELECT/UPDATE/DELETE now include namespace-admins
-- ============================================================================

DROP POLICY "session_students_select" ON session_students;
CREATE POLICY "session_students_select" ON session_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND (
        s.creator_id = app_user_id()
        OR is_section_member(s.section_id)
        OR can_manage_section(s.section_id)
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
      AND can_manage_section(s.section_id)
    )
  );

DROP POLICY "session_students_delete" ON session_students;
CREATE POLICY "session_students_delete" ON session_students
  FOR DELETE USING (
    user_id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND can_manage_section(s.section_id)
    )
  );

-- ============================================================================
-- session_backend_state: SELECT now includes namespace-admins
-- ============================================================================

DROP POLICY "session_backend_state_select" ON session_backend_state;
CREATE POLICY "session_backend_state_select" ON session_backend_state
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND can_manage_section(s.section_id)
    )
  );
