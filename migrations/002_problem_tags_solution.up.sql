-- Migration: 002_problem_tags_solution.up.sql
-- Adds tags and solution columns to the problems table.

ALTER TABLE problems ADD COLUMN tags TEXT[];
ALTER TABLE problems ADD COLUMN solution TEXT;

COMMENT ON COLUMN problems.tags IS 'Array of tag strings for categorizing problems';
COMMENT ON COLUMN problems.solution IS 'Reference solution code for the problem';
