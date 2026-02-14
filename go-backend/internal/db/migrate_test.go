package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestRunMigrations_EmptyPath(t *testing.T) {
	// Empty migrationsPath should skip migrations and return nil.
	err := RunMigrations("", "pgx5://user:pass@localhost:5432/testdb")
	if err != nil {
		t.Errorf("RunMigrations() with empty path returned error: %v", err)
	}
}

func TestRunMigrations_InvalidPath(t *testing.T) {
	// A non-existent migrations path should return an error.
	err := RunMigrations("/nonexistent/path/to/migrations", "pgx5://user:pass@localhost:5432/testdb")
	if err == nil {
		t.Error("RunMigrations() with invalid path should return error, got nil")
	}
}

func TestMigrateDatabaseURL(t *testing.T) {
	t.Run("from DATABASE_URL with postgresql scheme", func(t *testing.T) {
		got := MigrateDatabaseURL("postgresql://user:pass@host:5432/db?sslmode=prefer", PoolConfig{})
		want := "pgx5://user:pass@host:5432/db?sslmode=prefer"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})

	t.Run("from DATABASE_URL with postgres scheme", func(t *testing.T) {
		got := MigrateDatabaseURL("postgres://user:p%40ss@host:5432/db", PoolConfig{})
		want := "pgx5://user:p%40ss@host:5432/db"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})

	t.Run("from PoolConfig when DATABASE_URL empty", func(t *testing.T) {
		cfg := PoolConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "testdb",
			User:     "testuser",
			Password: "testpass",
		}
		got := MigrateDatabaseURL("", cfg)
		want := "pgx5://testuser:testpass@localhost:5432/testdb"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})

	t.Run("from PoolConfig with special chars in password", func(t *testing.T) {
		cfg := PoolConfig{
			Host:     "db.example.com",
			Port:     5433,
			Database: "proddb",
			User:     "admin",
			Password: "p@ss:word/special",
		}
		got := MigrateDatabaseURL("", cfg)
		want := "pgx5://admin:p%40ss%3Aword%2Fspecial@db.example.com:5433/proddb"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})

	t.Run("from PoolConfig with special chars in user", func(t *testing.T) {
		cfg := PoolConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "mydb",
			User:     "user@domain",
			Password: "simple",
		}
		got := MigrateDatabaseURL("", cfg)
		want := "pgx5://user%40domain:simple@localhost:5432/mydb"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})

	t.Run("PoolConfig preferred over DATABASE_URL when both set", func(t *testing.T) {
		cfg := PoolConfig{
			Host:     "10.0.0.1",
			Port:     5432,
			Database: "eval",
			User:     "eval",
			Password: "p#ss?w:rd",
		}
		got := MigrateDatabaseURL("postgresql://eval:p#ss?w:rd@10.0.0.1:5432/eval", cfg)
		want := "pgx5://eval:p%23ss%3Fw%3Ard@10.0.0.1:5432/eval"
		if got != want {
			t.Errorf("MigrateDatabaseURL() = %q, want %q", got, want)
		}
	})
}

// createTestDatabase creates a temporary database for migration testing and
// returns a pgx5:// URL pointing to it. The database is dropped on cleanup.
func createTestDatabase(t *testing.T, baseURL string) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, baseURL)
	if err != nil {
		t.Fatalf("failed to connect to base database: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()

	testDBName := fmt.Sprintf("eval_migrate_test_%d", time.Now().UnixNano())

	if _, err := conn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", testDBName)); err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()

		cleanupConn, err := pgx.Connect(cleanupCtx, baseURL)
		if err != nil {
			t.Logf("warning: failed to connect for cleanup: %v", err)
			return
		}
		defer func() { _ = cleanupConn.Close(cleanupCtx) }()

		// Terminate all connections to the test database before dropping
		if _, err := cleanupConn.Exec(cleanupCtx, fmt.Sprintf(
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%s'", testDBName)); err != nil {
			t.Logf("warning: failed to terminate connections: %v", err)
		}

		if _, err := cleanupConn.Exec(cleanupCtx, fmt.Sprintf("DROP DATABASE IF EXISTS %s", testDBName)); err != nil {
			t.Logf("warning: failed to drop test database %s: %v", testDBName, err)
		}
	})

	// Build a pgx5:// URL for the new database.
	// Parse the base URL, swap the database name.
	cfg, err := pgx.ParseConfig(baseURL)
	if err != nil {
		t.Fatalf("failed to parse base URL: %v", err)
	}

	return MigrateDatabaseURL("", PoolConfig{
		Host:     cfg.Host,
		Port:     int(cfg.Port),
		Database: testDBName,
		User:     cfg.User,
		Password: cfg.Password,
	})
}

func TestRunMigrations_Integration(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	// Find migrations directory. MIGRATIONS_PATH can be set explicitly, or we
	// derive it from this source file's location (go-backend/internal/db/) up
	// to the repo root.
	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		_, thisFile, _, _ := runtime.Caller(0)
		repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
		migrationsPath = filepath.Join(repoRoot, "migrations")
	}

	// Create a fresh test database so migrations start from a clean state.
	pgx5URL := createTestDatabase(t, dbURL)

	// Run migrations for the first time.
	if err := RunMigrations(migrationsPath, pgx5URL); err != nil {
		t.Fatalf("RunMigrations() first run failed: %v", err)
	}

	// Verify schema_migrations table exists by connecting directly.
	// Convert pgx5:// back to postgres:// for pgx connection.
	postgresURL := "postgres" + pgx5URL[len("pgx5"):]
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, postgresURL)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()

	var version int
	var dirty bool
	err = conn.QueryRow(ctx, "SELECT version, dirty FROM schema_migrations LIMIT 1").Scan(&version, &dirty)
	if err != nil {
		t.Fatalf("failed to query schema_migrations: %v", err)
	}
	if version <= 0 {
		t.Errorf("schema_migrations version = %d, want > 0", version)
	}
	if dirty {
		t.Error("schema_migrations dirty = true, want false")
	}

	// Run migrations again to verify idempotency (should return nil, not an error).
	if err := RunMigrations(migrationsPath, pgx5URL); err != nil {
		t.Fatalf("RunMigrations() idempotent run failed: %v", err)
	}
}
