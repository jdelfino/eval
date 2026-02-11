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

func TestMigrationDatabaseURL(t *testing.T) {
	tests := []struct {
		name string
		cfg  PoolConfig
		want string
	}{
		{
			name: "basic config",
			cfg: PoolConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				User:     "testuser",
				Password: "testpass",
			},
			want: "pgx5://testuser:testpass@localhost:5432/testdb?sslmode=disable",
		},
		{
			name: "special chars in password",
			cfg: PoolConfig{
				Host:     "db.example.com",
				Port:     5433,
				Database: "proddb",
				User:     "admin",
				Password: "p@ss:word/special",
			},
			want: "pgx5://admin:p%40ss%3Aword%2Fspecial@db.example.com:5433/proddb?sslmode=disable",
		},
		{
			name: "special chars in user",
			cfg: PoolConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "mydb",
				User:     "user@domain",
				Password: "simple",
			},
			want: "pgx5://user%40domain:simple@localhost:5432/mydb?sslmode=disable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MigrationDatabaseURL(tt.cfg)
			if got != tt.want {
				t.Errorf("MigrationDatabaseURL() = %q, want %q", got, tt.want)
			}
		})
	}
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
	defer conn.Close(ctx)

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
		defer cleanupConn.Close(cleanupCtx)

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

	return MigrationDatabaseURL(PoolConfig{
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
	defer conn.Close(ctx)

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
