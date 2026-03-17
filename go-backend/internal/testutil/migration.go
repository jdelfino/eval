package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // pgx5 driver
	_ "github.com/golang-migrate/migrate/v4/source/file"     // file source driver
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MigrationTestDB holds a connection pool to a temporary database that has
// been migrated to a specific version. Use SetupMigrationTestDB to create
// one and MigrateTo to advance or roll back to another version.
type MigrationTestDB struct {
	Pool       *pgxpool.Pool
	tempDBName string
	tempDBURL  string // pgx5:// URL for golang-migrate
	pgURL      string // postgres:// URL for pgxpool
}

// SetupMigrationTestDB creates a temporary Postgres database, migrates it to
// the given version, and registers a cleanup function that drops the database
// when the test ends.
//
// The DATABASE_URL environment variable must be set to a superuser connection
// string; the test is skipped when it is absent.
func SetupMigrationTestDB(t *testing.T, version uint) *MigrationTestDB {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping migration integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Connect to the existing database (superuser) to create the temp DB.
	superConn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("SetupMigrationTestDB: connect to superuser DB: %v", err)
	}

	tempDBName := fmt.Sprintf("test_migrate_%d", time.Now().UnixNano())

	if _, err := superConn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", tempDBName)); err != nil {
		_ = superConn.Close(ctx)
		t.Fatalf("SetupMigrationTestDB: CREATE DATABASE %s: %v", tempDBName, err)
	}

	// Build temp DB URLs by replacing the database name.
	pgx5URL, pgPoolURL, err := buildTempDBURLs(dbURL, tempDBName)
	if err != nil {
		_ = superConn.Close(ctx)
		t.Fatalf("SetupMigrationTestDB: build temp DB URLs: %v", err)
	}

	// Connect to the temp DB.
	tempPool, err := pgxpool.New(ctx, pgPoolURL)
	if err != nil {
		_ = superConn.Close(ctx)
		t.Fatalf("SetupMigrationTestDB: connect to temp DB: %v", err)
	}
	if err := tempPool.Ping(ctx); err != nil {
		tempPool.Close()
		_ = superConn.Close(ctx)
		t.Fatalf("SetupMigrationTestDB: ping temp DB: %v", err)
	}

	db := &MigrationTestDB{
		Pool:       tempPool,
		tempDBName: tempDBName,
		tempDBURL:  pgx5URL,
		pgURL:      dbURL,
	}

	// Register cleanup: close temp pool, terminate connections, drop temp DB.
	t.Cleanup(func() {
		db.Pool.Close()

		cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanCancel()

		cleanConn, err := pgx.Connect(cleanCtx, dbURL)
		if err != nil {
			t.Logf("SetupMigrationTestDB cleanup: connect for DROP: %v", err)
			return
		}
		defer func() { _ = cleanConn.Close(cleanCtx) }()

		// Terminate active connections so DROP DATABASE succeeds.
		_, _ = cleanConn.Exec(cleanCtx, fmt.Sprintf(
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%s'",
			tempDBName))

		if _, err := cleanConn.Exec(cleanCtx, fmt.Sprintf("DROP DATABASE IF EXISTS %s", tempDBName)); err != nil {
			t.Logf("SetupMigrationTestDB cleanup: DROP DATABASE %s: %v", tempDBName, err)
		}
	})

	// Run migrations to the requested version.
	if err := migrateToVersion(migrationsPath(), pgx5URL, version); err != nil {
		t.Fatalf("SetupMigrationTestDB: migrate to version %d: %v", version, err)
	}

	return db
}

// MigrateTo migrates the temporary database to the given version. golang-migrate
// automatically chooses up or down based on the current version.
func (db *MigrationTestDB) MigrateTo(t *testing.T, version uint) {
	t.Helper()
	if err := migrateToVersion(migrationsPath(), db.tempDBURL, version); err != nil {
		t.Fatalf("MigrateTo(%d): %v", version, err)
	}
}

// Exec executes a SQL statement against the temp DB and fails the test on error.
func (db *MigrationTestDB) Exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := db.Pool.Exec(ctx, sql, args...); err != nil {
		t.Fatalf("Exec(%q): %v", sql, err)
	}
}

// QueryRow executes a query and returns the single row result.
func (db *MigrationTestDB) QueryRow(t *testing.T, sql string, args ...any) pgx.Row {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return db.Pool.QueryRow(ctx, sql, args...)
}

// CreateNamespace inserts a namespace row as a seed fixture.
func (db *MigrationTestDB) CreateNamespace(t *testing.T, id, displayName string) {
	t.Helper()
	db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`,
		id, displayName)
}

// migrationsPath returns the absolute path to the repo-level migrations directory.
// It uses runtime.Caller(0) so the path is relative to this source file, not
// the working directory at test runtime.
func migrationsPath() string {
	_, thisFile, _, _ := runtime.Caller(0)
	// thisFile = .../go-backend/internal/testutil/migration.go
	// go up 3 levels: testutil -> internal -> go-backend -> repo root
	repoRoot := filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
	return filepath.Join(repoRoot, "migrations")
}

// migrateToVersion creates a golang-migrate instance and migrates to version.
func migrateToVersion(migrationsDir, pgx5URL string, version uint) error {
	sourceURL := "file://" + migrationsDir

	m, err := migrate.New(sourceURL, pgx5URL)
	if err != nil {
		return fmt.Errorf("create migrate instance: %w", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil || dbErr != nil {
			// Non-fatal: log via error return is not possible here;
			// callers see the migration error if any.
			_ = srcErr
			_ = dbErr
		}
	}()

	if err := m.Migrate(version); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate to version %d: %w", version, err)
	}
	return nil
}

// buildTempDBURLs returns a pgx5:// URL (for golang-migrate) and a postgres://
// URL (for pgxpool) both pointing to tempDBName, derived from baseURL.
func buildTempDBURLs(baseURL, tempDBName string) (pgx5URL, pgPoolURL string, err error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", "", fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	// Replace the database name (path component).
	newURL := *parsed
	newURL.Path = "/" + tempDBName

	// pgxpool needs a postgres:// or postgresql:// scheme.
	pgPoolURL = newURL.String()

	// golang-migrate needs a pgx5:// scheme.
	pgx5URL = toPgx5Scheme(pgPoolURL)

	return pgx5URL, pgPoolURL, nil
}

// toPgx5Scheme replaces postgres(ql):// with pgx5://.
func toPgx5Scheme(databaseURL string) string {
	if after, ok := strings.CutPrefix(databaseURL, "postgresql://"); ok {
		return "pgx5://" + after
	}
	if after, ok := strings.CutPrefix(databaseURL, "postgres://"); ok {
		return "pgx5://" + after
	}
	return databaseURL
}
