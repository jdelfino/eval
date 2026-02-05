INSERT INTO users (id, external_id, email, role, namespace_id, display_name)
VALUES ('00000000-0000-0000-0000-ffffffffffff', 'contract-admin', 'contract-admin@test.local', 'system-admin', NULL, 'Contract Admin')
ON CONFLICT (id) DO NOTHING;
