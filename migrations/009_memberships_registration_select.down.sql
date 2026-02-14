-- Rollback: 009_memberships_registration_select

DROP POLICY IF EXISTS "memberships_registration_select" ON section_memberships;
