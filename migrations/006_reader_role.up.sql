-- Add read-only privileges for the 'reader' database user.
-- Used for production debugging via scripts/db-proxy.sh.
-- The Cloud SQL user is created by Terraform; this migration grants privileges.

GRANT CONNECT ON DATABASE eval TO reader;
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO reader;

-- Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO reader;
