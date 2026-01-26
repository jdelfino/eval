-- Seed data for local development
-- Idempotent: use INSERT ... ON CONFLICT DO NOTHING

-- Test namespace
INSERT INTO namespaces (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test University', 'test-u')
ON CONFLICT DO NOTHING;

-- Test user (matches cognito-local user)
INSERT INTO users (id, email, namespace_id, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'test@example.com',
        '00000000-0000-0000-0000-000000000001', 'instructor')
ON CONFLICT DO NOTHING;

-- Sample class
INSERT INTO classes (id, namespace_id, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000001',
        'CS101 Introduction to Programming',
        '00000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
