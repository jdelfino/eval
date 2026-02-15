-- Add read-only privileges for the 'reader' database user.
-- Used for production debugging via scripts/db-proxy.sh.
-- The Cloud SQL user is created by Terraform; this migration grants privileges.
-- In CI/test environments the role may not exist, so create it conditionally.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'reader') THEN
    CREATE ROLE reader LOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO reader', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO reader;

-- Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO reader;
