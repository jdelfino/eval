-- Migration: 009_memberships_registration_select.up.sql
--
-- Adds a SELECT RLS policy on section_memberships for registration context.
--
-- Without this, INSERT ... RETURNING in registration context fails because
-- PostgreSQL checks SELECT policies before returning rows. The registration
-- INSERT policy (004) allows the INSERT, but without a matching SELECT policy
-- the RETURNING clause returns zero rows, which pgx treats as an error.
--
-- This mirrors migration 005 which added the same fix for the users table.

CREATE POLICY "memberships_registration_select" ON section_memberships
  FOR SELECT USING (is_registration_context());
