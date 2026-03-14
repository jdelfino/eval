-- Migration: 019_student_work_test_cases.down.sql
--
-- Reverses migration 019: removes test_cases column from student_work.

ALTER TABLE student_work DROP COLUMN IF EXISTS test_cases;
