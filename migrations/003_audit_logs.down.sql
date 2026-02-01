-- Rollback migration: 003_audit_logs.down.sql
-- Drops the audit_logs table.

DROP TABLE IF EXISTS audit_logs CASCADE;
