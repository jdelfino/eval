-- Create the eval_app role for production RLS enforcement.
--
-- PostgreSQL table owners bypass RLS by default. The application connects
-- as the table-owning user, so RLS policies are effectively a no-op unless
-- the middleware drops privileges via SET ROLE to a non-owner role.
--
-- This migration creates eval_app — a non-superuser role with DML privileges
-- on all tables but no ownership. The RLS middleware issues SET ROLE eval_app
-- on every request so that policies are enforced.
--
-- In CI/test environments the role may already exist (created by test setup),
-- so creation is conditional.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eval_app') THEN
    CREATE ROLE eval_app WITH LOGIN PASSWORD 'eval_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Database-level access
GRANT CONNECT ON DATABASE eval TO eval_app;
GRANT USAGE ON SCHEMA public TO eval_app;

-- DML on all existing tables, sequences, and functions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eval_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO eval_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO eval_app;

-- Ensure future objects are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eval_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO eval_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO eval_app;
