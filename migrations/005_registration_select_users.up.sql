-- Migration: 005_registration_select_users.up.sql
-- Created: 2026-02-10
--
-- Adds a SELECT RLS policy on users for registration context.
--
-- Without this, INSERT ... RETURNING in registration context fails because
-- PostgreSQL requires SELECT visibility on the newly-inserted row for the
-- RETURNING clause. The registration INSERT policy (004) allows the INSERT,
-- but the existing users_select policy has no condition for registration
-- context, causing the RETURNING to be denied.
--
-- This affected the bootstrap endpoint (POST /auth/bootstrap) which creates
-- a system-admin user via CreateUser (INSERT ... RETURNING).

CREATE POLICY "users_registration_select" ON users
  FOR SELECT USING (is_registration_context());
