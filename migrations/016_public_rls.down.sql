-- Migration: 016_public_rls.down.sql
-- Reverses 016_public_rls.up.sql

DROP POLICY IF EXISTS "problems_public_select" ON problems;
DROP POLICY IF EXISTS "classes_public_select" ON classes;
DROP FUNCTION IF EXISTS is_public_context();
