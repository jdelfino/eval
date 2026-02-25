-- Migration: 016_public_rls.up.sql
-- Created: 2026-02-25
--
-- Adds RLS policies for the 'public' context. Public routes (e.g. /public/problems/:id)
-- need database read access without an authenticated user. Instead of using the 'reader'
-- role (which bypasses RLS entirely and grants unrestricted SELECT on all tables), we
-- set app.role = 'public' and grant only the specific SELECT operations needed by
-- public-facing handlers.
--
-- Tables affected: problems, classes

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

-- Check if current session is a public context
CREATE FUNCTION is_public_context() RETURNS boolean AS $$
  SELECT current_setting('app.role', true) = 'public';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION is_public_context IS 'Returns true if session is in public context (app.role = public)';

-- ============================================================================
-- PUBLIC RLS POLICIES
-- ============================================================================

-- problems: SELECT (needed for public problem pages)
CREATE POLICY "problems_public_select" ON problems
  FOR SELECT USING (is_public_context());

-- classes: SELECT (needed for LEFT JOIN to get class_name)
CREATE POLICY "classes_public_select" ON classes
  FOR SELECT USING (is_public_context());
