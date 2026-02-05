-- Migration: 004_registration_rls.up.sql
-- Created: 2026-02-05
--
-- Adds RLS policies for the 'registration' context. Registration routes
-- (/auth/accept-invite, /auth/register-student) need database access before
-- a user record exists. Instead of bypassing RLS entirely, we set
-- app.role = 'registration' and grant only the minimum operations needed.
--
-- Tables affected: invitations, sections, classes, users, section_memberships, namespaces

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

-- Check if current session is a registration context
CREATE FUNCTION is_registration_context() RETURNS boolean AS $$
  SELECT current_setting('app.role', true) = 'registration';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION is_registration_context IS 'Returns true if session is in registration context (app.role = registration)';

-- ============================================================================
-- REGISTRATION RLS POLICIES
-- ============================================================================

-- invitations: SELECT pending only (needed to validate invitation tokens)
CREATE POLICY "invitations_registration_select" ON invitations
  FOR SELECT USING (
    is_registration_context()
    AND consumed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  );

-- invitations: UPDATE pending → consumed (needed to consume invitations)
CREATE POLICY "invitations_registration_update" ON invitations
  FOR UPDATE USING (
    is_registration_context()
    AND consumed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  );

-- sections: SELECT active only (needed to validate join codes)
CREATE POLICY "sections_registration_select" ON sections
  FOR SELECT USING (
    is_registration_context()
    AND active = true
  );

-- classes: SELECT (needed to return class info for join code validation)
CREATE POLICY "classes_registration_select" ON classes
  FOR SELECT USING (is_registration_context());

-- users: INSERT only (needed to create new user records)
CREATE POLICY "users_registration_insert" ON users
  FOR INSERT WITH CHECK (is_registration_context());

-- section_memberships: INSERT student role only (needed to enroll students)
CREATE POLICY "memberships_registration_insert" ON section_memberships
  FOR INSERT WITH CHECK (
    is_registration_context()
    AND role = 'student'
  );

-- namespaces: SELECT active only (needed for FK validation during user creation)
CREATE POLICY "namespaces_registration_select" ON namespaces
  FOR SELECT USING (
    is_registration_context()
    AND active = true
  );
