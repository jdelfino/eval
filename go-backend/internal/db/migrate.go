package db

import (
	"fmt"
	"log/slog"
	"net/url"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // pgx5 driver for golang-migrate
	_ "github.com/golang-migrate/migrate/v4/source/file"     // file source driver for golang-migrate
)

// RunMigrations applies all pending database migrations from migrationsPath.
// If migrationsPath is empty, migrations are skipped.
func RunMigrations(migrationsPath, databaseURL string) error {
	if migrationsPath == "" {
		slog.Info("migrations path not set, skipping migrations")
		return nil
	}

	sourceURL := "file://" + migrationsPath

	m, err := migrate.New(sourceURL, databaseURL)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil {
			slog.Warn("failed to close migration source", "error", srcErr)
		}
		if dbErr != nil {
			slog.Warn("failed to close migration database", "error", dbErr)
		}
	}()

	if err := m.Up(); err != nil {
		if err == migrate.ErrNoChange {
			slog.Info("database schema is up to date")
			return nil
		}
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	slog.Info("database migrations applied successfully")
	return nil
}

// MigrateDatabaseURL returns a pgx5:// URL suitable for golang-migrate.
// It prefers constructing from PoolConfig fields (which are properly
// URL-encoded) over DATABASE_URL (which may contain unescaped special
// characters in the password).
func MigrateDatabaseURL(databaseURL string, cfg PoolConfig) string {
	if cfg.Host != "" {
		u := &url.URL{
			Scheme: "pgx5",
			User:   url.UserPassword(cfg.User, cfg.Password),
			Host:   fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
			Path:   cfg.Database,
		}
		return u.String()
	}
	if databaseURL != "" {
		return toPgx5Scheme(databaseURL)
	}
	return ""
}

// toPgx5Scheme replaces the postgres(ql):// scheme prefix with pgx5://.
func toPgx5Scheme(databaseURL string) string {
	if after, ok := strings.CutPrefix(databaseURL, "postgresql://"); ok {
		return "pgx5://" + after
	}
	if after, ok := strings.CutPrefix(databaseURL, "postgres://"); ok {
		return "pgx5://" + after
	}
	return databaseURL
}
