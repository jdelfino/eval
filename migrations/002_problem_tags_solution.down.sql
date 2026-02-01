-- Rollback migration: 002_problem_tags_solution.down.sql
-- Removes tags and solution columns from problems table.

ALTER TABLE problems DROP COLUMN IF EXISTS tags;
ALTER TABLE problems DROP COLUMN IF EXISTS solution;
