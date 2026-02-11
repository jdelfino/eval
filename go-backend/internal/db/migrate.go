package db

import (
	"fmt"
	"log/slog"
	"net/url"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // pgx5 driver for golang-migrate
	_ "github.com/golang-migrate/migrate/v4/source/file"     // file source driver for golang-migrate
)

// RunMigrations applies all pending database migrations from migrationsPath.
// If migrationsPath is empty, migrations are skipped (used in local dev where
// docker-compose handles schema setup).
func RunMigrations(migrationsPath, databaseURL string) error {
	if migrationsPath == "" {
		slog.Info("migrations path is empty, skipping migrations")
		return nil
	}

	sourceURL := "file://" + migrationsPath

	m, err := migrate.New(sourceURL, databaseURL)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil {
		if err == migrate.ErrNoChange {
			slog.Info("database schema is up to date, no migrations to apply")
			return nil
		}
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	slog.Info("database migrations applied successfully")
	return nil
}

// MigrationDatabaseURL constructs a pgx5:// URL suitable for golang-migrate
// from a PoolConfig. User and password are percent-encoded using url.URL so
// that special characters (@, :, /, etc.) are properly escaped in the userinfo
// component.
func MigrationDatabaseURL(cfg PoolConfig) string {
	u := &url.URL{
		Scheme:   "pgx5",
		User:     url.UserPassword(cfg.User, cfg.Password),
		Host:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Path:     cfg.Database,
		RawQuery: "sslmode=disable",
	}
	return u.String()
}
