-- Migration: 018_problem_language.down.sql
-- Reverses 018_problem_language.up.sql

ALTER TABLE problems DROP COLUMN language;
