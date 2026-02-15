// Package testutil provides shared helpers for integration tests.
package testutil

import (
	"context"
	"fmt"
	"net/url"

	"github.com/jackc/pgx/v5/pgxpool"
)

const appTestPassword = "app_test_password"

// EnsureAppRole creates the eval_app and app roles if they don't exist,
// grants DML privileges, and grants eval_app TO app. This mirrors the
// production setup where the app user needs GRANT eval_app TO app to
// use SET ROLE eval_app in the RLS middleware.
func EnsureAppRole(ctx context.Context, pool *pgxpool.Pool) error {
	// Create eval_app role (used by SET ROLE in RLS middleware).
	if _, err := pool.Exec(ctx, `
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eval_app') THEN
				CREATE ROLE eval_app WITH LOGIN PASSWORD 'eval_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
			END IF;
		END $$
	`); err != nil {
		return fmt.Errorf("create eval_app role: %w", err)
	}

	// Create app role (mirrors the production database user).
	if _, err := pool.Exec(ctx, fmt.Sprintf(`
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
				CREATE ROLE app WITH LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEDB NOCREATEROLE;
			END IF;
		END $$
	`, appTestPassword)); err != nil {
		return fmt.Errorf("create app role: %w", err)
	}

	// Grant privileges to eval_app.
	for _, stmt := range []string{
		"GRANT CONNECT ON DATABASE eval TO eval_app",
		"GRANT USAGE ON SCHEMA public TO eval_app",
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eval_app",
		"GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO eval_app",
		"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO eval_app",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}

	// Grant privileges to app (needed after RESET ROLE returns to app).
	for _, stmt := range []string{
		"GRANT CONNECT ON DATABASE eval TO app",
		"GRANT USAGE ON SCHEMA public TO app",
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app",
		"GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app",
		"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}

	// Allow app to SET ROLE eval_app — this is the grant that caused the
	// production outage when missing from migration 008.
	if _, err := pool.Exec(ctx, "GRANT eval_app TO app"); err != nil {
		return fmt.Errorf("grant eval_app to app: %w", err)
	}

	return nil
}

// NewAppPool creates a connection pool using the non-superuser app role.
// It derives the connection URL from the given superuser DATABASE_URL by
// replacing the username and password.
func NewAppPool(ctx context.Context, superuserURL string) (*pgxpool.Pool, error) {
	parsed, err := url.Parse(superuserURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	parsed.User = url.UserPassword("app", appTestPassword)
	pool, err := pgxpool.New(ctx, parsed.String())
	if err != nil {
		return nil, fmt.Errorf("create app pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping app pool: %w", err)
	}

	return pool, nil
}
