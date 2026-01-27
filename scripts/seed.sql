-- Seed data for eval local development
-- Idempotent: use INSERT ... ON CONFLICT DO NOTHING
--
-- Provides a minimal set of test data for development:
-- - 1 namespace ("Test School")
-- - 4 users (1 system-admin, 1 instructor, 2 students)
-- - 1 class, 1 section with memberships
-- - 2 problems
-- - 1 active session with 2 students

-- ============================================================================
-- NAMESPACES
-- ============================================================================

INSERT INTO namespaces (id, display_name, active, created_by)
VALUES
  ('test-school', 'Test School', true, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- USERS
-- ============================================================================

-- System admin (no namespace)
INSERT INTO users (id, external_id, email, role, namespace_id, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'test-admin-001', 'admin@test.local', 'system-admin', NULL, 'System Admin')
ON CONFLICT (id) DO NOTHING;

-- Instructor (in test-school namespace)
INSERT INTO users (id, external_id, email, role, namespace_id, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'test-instructor-001', 'instructor@test.local', 'instructor', 'test-school', 'Test Instructor')
ON CONFLICT (id) DO NOTHING;

-- Student 1 (in test-school namespace)
INSERT INTO users (id, external_id, email, role, namespace_id, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000003', 'test-student-001', 'student1@test.local', 'student', 'test-school', 'Alice Student')
ON CONFLICT (id) DO NOTHING;

-- Student 2 (in test-school namespace)
INSERT INTO users (id, external_id, email, role, namespace_id, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000004', 'test-student-002', 'student2@test.local', 'student', 'test-school', 'Bob Student')
ON CONFLICT (id) DO NOTHING;

-- Update namespace created_by now that we have an admin user
UPDATE namespaces SET created_by = '00000000-0000-0000-0000-000000000001' WHERE id = 'test-school';

-- ============================================================================
-- CLASSES
-- ============================================================================

INSERT INTO classes (id, namespace_id, name, description, created_by)
VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    'test-school',
    'CS 101 - Introduction to Programming',
    'Learn the basics of Python programming',
    '00000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTIONS
-- ============================================================================

INSERT INTO sections (id, namespace_id, class_id, name, semester, join_code, active)
VALUES
  (
    '00000000-0000-0000-0000-000000000201',
    'test-school',
    '00000000-0000-0000-0000-000000000101',
    'Section A',
    'Spring 2026',
    'ABC-123-XYZ',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION MEMBERSHIPS
-- ============================================================================

INSERT INTO section_memberships (id, user_id, section_id, role)
VALUES
  -- Instructor is a member
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000201', 'instructor'),
  -- Students enrolled
  ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000201', 'student'),
  ('00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000201', 'student')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PROBLEMS
-- ============================================================================

INSERT INTO problems (id, namespace_id, title, description, starter_code, author_id, class_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    'test-school',
    'Hello World',
    E'# Hello World\n\nWrite a program that prints "Hello, World!" to the console.\n\n## Instructions\n\n1. Use the `print()` function\n2. Make sure to spell it exactly right\n\n## Example Output\n\n```\nHello, World!\n```',
    E'# Write your code below\nprint("Hello, World!")',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000101'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO problems (id, namespace_id, title, description, starter_code, author_id, class_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000302',
    'test-school',
    'Sum Two Numbers',
    E'# Sum Two Numbers\n\nWrite a program that reads two numbers from input and prints their sum.\n\n## Instructions\n\n1. Use `input()` to read two numbers\n2. Convert them to integers using `int()`\n3. Print the sum\n\n## Example\n\nInput:\n```\n5\n3\n```\n\nOutput:\n```\n8\n```',
    E'# Read two numbers and print their sum\na = int(input())\nb = int(input())\nprint(a + b)',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000101'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SESSIONS
-- ============================================================================

INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000401',
    'test-school',
    '00000000-0000-0000-0000-000000000201',
    'Section A',
    '{
      "id": "00000000-0000-0000-0000-000000000301",
      "namespaceId": "test-school",
      "title": "Hello World",
      "description": "# Hello World\n\nWrite a program that prints \"Hello, World!\" to the console.",
      "starterCode": "# Write your code below\nprint(\"Hello, World!\")",
      "authorId": "00000000-0000-0000-0000-000000000002",
      "createdAt": "2026-01-27T00:00:00Z",
      "updatedAt": "2026-01-27T00:00:00Z"
    }',
    '00000000-0000-0000-0000-000000000002',
    'active'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SESSION STUDENTS
-- ============================================================================

INSERT INTO session_students (id, session_id, user_id, name, code)
VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000003',
    'Alice Student',
    'print("Hello, World!")'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO session_students (id, session_id, user_id, name, code)
VALUES
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000004',
    'Bob Student',
    '# Still working on it...'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TEST CREDENTIALS SUMMARY
-- ============================================================================
--
-- Email                    | External ID           | Role
-- -------------------------+-----------------------+---------------
-- admin@test.local         | test-admin-001        | system-admin
-- instructor@test.local    | test-instructor-001   | instructor
-- student1@test.local      | test-student-001      | student
-- student2@test.local      | test-student-002      | student
--
-- Join Code: ABC-123-XYZ (for Section A of CS 101)
-- ============================================================================
