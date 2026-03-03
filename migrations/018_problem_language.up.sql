-- Migration: 018_problem_language.up.sql
-- Created: 2026-03-03
--
-- Adds a language field to the problems table to support multiple programming
-- languages (initially Python and Java). Existing rows default to 'python'
-- to preserve backward compatibility.

ALTER TABLE problems ADD COLUMN language TEXT NOT NULL DEFAULT 'python' CHECK (language IN ('python', 'java'));

COMMENT ON COLUMN problems.language IS 'Programming language for this problem (e.g. python, java)';
