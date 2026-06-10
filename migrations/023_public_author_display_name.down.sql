-- Migration: 023_public_author_display_name.down.sql
-- Drops the SECURITY DEFINER helper function added in the up migration.

DROP FUNCTION IF EXISTS public_author_display_name(uuid);
