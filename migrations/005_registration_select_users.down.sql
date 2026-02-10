-- Migration: 005_registration_select_users.down.sql
DROP POLICY IF EXISTS "users_registration_select" ON users;
