-- Migration: 025_section_current_session.down.sql
--
-- Reverses 025: drops the current_session_id pointer column from sections.

ALTER TABLE sections
  DROP COLUMN IF EXISTS current_session_id;
