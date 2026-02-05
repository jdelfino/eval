-- Migration: 004_registration_rls.down.sql
-- Removes registration context RLS policies and helper function.

DROP POLICY IF EXISTS "invitations_registration_select" ON invitations;
DROP POLICY IF EXISTS "invitations_registration_update" ON invitations;
DROP POLICY IF EXISTS "sections_registration_select" ON sections;
DROP POLICY IF EXISTS "classes_registration_select" ON classes;
DROP POLICY IF EXISTS "users_registration_insert" ON users;
DROP POLICY IF EXISTS "memberships_registration_insert" ON section_memberships;
DROP POLICY IF EXISTS "namespaces_registration_select" ON namespaces;

DROP FUNCTION IF EXISTS is_registration_context();
