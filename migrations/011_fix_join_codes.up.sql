-- Migration: 011_fix_join_codes.up.sql
--
-- Regenerate join codes that use the old 9-character format (ABC-123-XYZ)
-- to the new 6-character format (ABC-123).
--
-- Old format: 3 letters + hyphen + 3 digits + hyphen + 3 letters = 11 chars
-- New format: 3 letters + hyphen + 3 digits = 7 chars

UPDATE sections
SET join_code = (
  -- Generate 3 random uppercase letters + hyphen + 3 random digits
  chr(65 + floor(random() * 26)::int) ||
  chr(65 + floor(random() * 26)::int) ||
  chr(65 + floor(random() * 26)::int) ||
  '-' ||
  floor(random() * 10)::int::text ||
  floor(random() * 10)::int::text ||
  floor(random() * 10)::int::text
)
WHERE length(replace(join_code, '-', '')) > 6;
