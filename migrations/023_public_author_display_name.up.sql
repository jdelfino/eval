-- Migration: 023_public_author_display_name.up.sql
-- Created: 2026-06-10
--
-- Creates a SECURITY DEFINER helper function that returns a problem author's
-- display_name for use in the public RLS context.
--
-- Privacy rationale: the public endpoint runs under app.role='public', which
-- has SELECT policies only on `problems` and `classes` (migration 016). A
-- JOIN against `users` returns zero rows under this context. This SECURITY
-- DEFINER function provides a deliberately narrow bypass: it exposes ONLY
-- users.display_name (NULL if unset) and nothing else from the users table.
-- Email, role, namespace_id, and all other columns are never touched.
--
-- The function is STABLE (same inputs → same output within a transaction) and
-- SECURITY DEFINER so it executes as its definer (superuser / migration role)
-- rather than the calling session's reduced-privilege role.

CREATE OR REPLACE FUNCTION public_author_display_name(author_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT display_name FROM users WHERE id = author_id;
$$;

COMMENT ON FUNCTION public_author_display_name(uuid) IS
  'Returns the display_name of the user identified by author_id, or NULL if '
  'the user has no display_name set. SECURITY DEFINER bypass is deliberately '
  'narrow: exposes display_name only — never email or any other users column.';
