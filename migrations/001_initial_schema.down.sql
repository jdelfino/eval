-- Rollback migration: 001_initial_schema.down.sql
-- Drops all tables, functions, and triggers created in 001_initial_schema.up.sql

-- ============================================================================
-- DROP TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS set_updated_at_invitations ON invitations;
DROP TRIGGER IF EXISTS set_updated_at_problems ON problems;
DROP TRIGGER IF EXISTS set_updated_at_sections ON sections;
DROP TRIGGER IF EXISTS set_updated_at_classes ON classes;
DROP TRIGGER IF EXISTS set_updated_at_users ON users;
DROP TRIGGER IF EXISTS set_updated_at_namespaces ON namespaces;

-- ============================================================================
-- DROP TRIGGER FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS update_updated_at();

-- ============================================================================
-- DROP TABLES (use CASCADE to handle RLS policies and foreign keys)
-- ============================================================================

DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS session_backend_state CASCADE;
DROP TABLE IF EXISTS revisions CASCADE;
DROP TABLE IF EXISTS session_students CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS problems CASCADE;
DROP TABLE IF EXISTS section_memberships CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS namespaces CASCADE;

-- ============================================================================
-- DROP RLS HELPER FUNCTIONS (use CASCADE to handle any remaining dependencies)
-- ============================================================================

DROP FUNCTION IF EXISTS is_section_instructor(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_section_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_instructor_or_higher() CASCADE;
DROP FUNCTION IF EXISTS has_role(TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_system_admin() CASCADE;
DROP FUNCTION IF EXISTS app_user_role() CASCADE;
DROP FUNCTION IF EXISTS app_namespace_id() CASCADE;
DROP FUNCTION IF EXISTS app_user_id() CASCADE;

-- ============================================================================
-- DROP EXTENSIONS (optional - commented out to avoid breaking other schemas)
-- ============================================================================

-- DROP EXTENSION IF EXISTS pgcrypto;
-- DROP EXTENSION IF EXISTS "uuid-ossp";
