-- Revoke read-only privileges from the 'reader' database user.
-- Drop the role only if it was created by the up migration (no password = not Terraform-managed).

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON SEQUENCES FROM reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM reader;
REVOKE SELECT ON ALL SEQUENCES IN SCHEMA public FROM reader;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM reader;
REVOKE USAGE ON SCHEMA public FROM reader;
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM reader', current_database());
END
$$;
