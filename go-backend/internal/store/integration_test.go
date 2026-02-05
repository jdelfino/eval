// Package store provides integration tests for RLS policy enforcement.
//
// These tests require a running PostgreSQL database with the schema applied.
// They are skipped gracefully if DATABASE_URL is not set.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./...
package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/db"
)

// testDB holds the test database connection pool and a random namespace for isolation.
type testDB struct {
	pool *pgxpool.Pool
	nsID string // random namespace scoped to this test run
}

// setupTestDB creates a connection pool for integration tests and provisions
// a random namespace (ns-<uuid>) so that concurrent test runs do not interfere
// with each other. Cleanup deletes only this namespace; ON DELETE CASCADE
// removes all child rows automatically.
// Returns nil if DATABASE_URL is not set (tests should skip).
func setupTestDB(t *testing.T) *testDB {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("failed to create pool: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("failed to ping database: %v", err)
	}

	// Ensure eval_app role exists for RLS testing.
	if err := ensureAppRole(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("failed to ensure eval_app role: %v", err)
	}

	nsID := "ns-" + uuid.New().String()
	_, err = pool.Exec(ctx,
		`INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`,
		nsID, "Test NS "+nsID)
	if err != nil {
		pool.Close()
		t.Fatalf("failed to create test namespace: %v", err)
	}

	tdb := &testDB{pool: pool, nsID: nsID}
	t.Cleanup(func() {
		tdb.cleanup(context.Background(), t)
		tdb.close()
	})
	return tdb
}

// ensureAppRole creates the eval_app role if it doesn't exist.
// This role is used for RLS testing because superusers bypass RLS policies.
func ensureAppRole(ctx context.Context, pool *pgxpool.Pool) error {
	// Create role if it doesn't exist
	_, err := pool.Exec(ctx, `
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'eval_app') THEN
				CREATE ROLE eval_app WITH LOGIN PASSWORD 'eval_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
			END IF;
		END $$
	`)
	if err != nil {
		return fmt.Errorf("create role: %w", err)
	}

	// Grant privileges on the database
	_, err = pool.Exec(ctx, "GRANT CONNECT ON DATABASE eval TO eval_app")
	if err != nil {
		return fmt.Errorf("grant connect: %w", err)
	}

	_, err = pool.Exec(ctx, "GRANT USAGE ON SCHEMA public TO eval_app")
	if err != nil {
		return fmt.Errorf("grant usage: %w", err)
	}

	_, err = pool.Exec(ctx, "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eval_app")
	if err != nil {
		return fmt.Errorf("grant table privileges: %w", err)
	}

	_, err = pool.Exec(ctx, "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO eval_app")
	if err != nil {
		return fmt.Errorf("grant sequence privileges: %w", err)
	}

	_, err = pool.Exec(ctx, "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO eval_app")
	if err != nil {
		return fmt.Errorf("grant function privileges: %w", err)
	}

	return nil
}

// close releases the test database connection pool.
func (tdb *testDB) close() {
	if tdb != nil && tdb.pool != nil {
		tdb.pool.Close()
	}
}

// setRLSContext sets the PostgreSQL session variables for RLS.
// It also sets the role to 'eval_app' so that RLS policies are enforced
// (superusers bypass RLS).
func (tdb *testDB) setRLSContext(ctx context.Context, conn *pgxpool.Conn, user *auth.User) error {
	// First, set the role to eval_app so RLS policies are enforced.
	// Superusers (like 'eval') bypass RLS, so we need to switch to
	// a non-superuser role for RLS to work.
	_, err := conn.Exec(ctx, "SET ROLE eval_app")
	if err != nil {
		return fmt.Errorf("set role to eval_app: %w", err)
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.user_id', $1, false)", user.ID.String())
	if err != nil {
		return fmt.Errorf("set user_id: %w", err)
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.namespace_id', $1, false)", user.NamespaceID)
	if err != nil {
		return fmt.Errorf("set namespace_id: %w", err)
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.role', $1, false)", string(user.Role))
	if err != nil {
		return fmt.Errorf("set role: %w", err)
	}

	return nil
}

// setRegistrationRLSContext sets the role to eval_app and sets app.role to 'registration'.
// This mirrors what RegistrationStoreMiddleware does in production.
func (tdb *testDB) setRegistrationRLSContext(ctx context.Context, conn *pgxpool.Conn) error {
	_, err := conn.Exec(ctx, "SET ROLE eval_app")
	if err != nil {
		return fmt.Errorf("set role to eval_app: %w", err)
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.role', 'registration', false)")
	if err != nil {
		return fmt.Errorf("set app.role: %w", err)
	}

	return nil
}

// cleanup removes test data by deleting the test namespace.
// ON DELETE CASCADE removes all child rows automatically.
// System-admin users (no namespace) are cleaned up by ID.
func (tdb *testDB) cleanup(ctx context.Context, t *testing.T) {
	t.Helper()
	_, err := tdb.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", tdb.nsID)
	if err != nil {
		t.Logf("warning: failed to delete namespace %s: %v", tdb.nsID, err)
	}
}

// testNamespace represents a namespace for testing.
type testNamespace struct {
	ID          string
	DisplayName string
}

// testUser represents a user for testing.
type testUser struct {
	ID          uuid.UUID
	Email       string
	Role        auth.Role
	NamespaceID string
}

// createNamespace creates a test namespace directly (bypassing RLS).
func (tdb *testDB) createNamespace(ctx context.Context, ns testNamespace) error {
	_, err := tdb.pool.Exec(ctx, `
		INSERT INTO namespaces (id, display_name, active)
		VALUES ($1, $2, true)
	`, ns.ID, ns.DisplayName)
	return err
}

// createUser creates a test user directly (bypassing RLS).
func (tdb *testDB) createUser(ctx context.Context, user testUser) error {
	var namespaceID *string
	if user.NamespaceID != "" {
		namespaceID = &user.NamespaceID
	}

	_, err := tdb.pool.Exec(ctx, `
		INSERT INTO users (id, email, role, namespace_id)
		VALUES ($1, $2, $3, $4)
	`, user.ID, user.Email, string(user.Role), namespaceID)
	return err
}

// queryUsersAsUser queries users using RLS with the given user's context.
func (tdb *testDB) queryUsersAsUser(ctx context.Context, user *auth.User) ([]uuid.UUID, error) {
	conn, err := tdb.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	if err := tdb.setRLSContext(ctx, conn, user); err != nil {
		return nil, fmt.Errorf("set RLS context: %w", err)
	}

	rows, err := conn.Query(ctx, "SELECT id FROM users")
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan user id: %w", err)
		}
		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// queryNamespacesAsUser queries namespaces using RLS with the given user's context.
func (tdb *testDB) queryNamespacesAsUser(ctx context.Context, user *auth.User) ([]string, error) {
	conn, err := tdb.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	if err := tdb.setRLSContext(ctx, conn, user); err != nil {
		return nil, fmt.Errorf("set RLS context: %w", err)
	}

	rows, err := conn.Query(ctx, "SELECT id FROM namespaces")
	if err != nil {
		return nil, fmt.Errorf("query namespaces: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan namespace id: %w", err)
		}
		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// =============================================================================
// RLS Policy Tests
// =============================================================================

func TestRLSPolicies_NamespaceIsolation(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	// tdb.nsID is namespace A; create a second namespace for isolation test
	nsBID := "ns-" + uuid.New().String()
	nsB := testNamespace{ID: nsBID, DisplayName: "Test Namespace B"}
	if err := tdb.createNamespace(ctx, nsB); err != nil {
		t.Fatalf("create namespace B: %v", err)
	}
	t.Cleanup(func() {
		_, _ = tdb.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsBID)
	})

	// Create users in each namespace
	userA := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("user-a-%s@test.com", tdb.nsID),
		Role:        auth.RoleStudent,
		NamespaceID: tdb.nsID,
	}
	userB := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("user-b-%s@test.com", nsBID),
		Role:        auth.RoleStudent,
		NamespaceID: nsBID,
	}

	if err := tdb.createUser(ctx, userA); err != nil {
		t.Fatalf("create user A: %v", err)
	}
	if err := tdb.createUser(ctx, userB); err != nil {
		t.Fatalf("create user B: %v", err)
	}

	t.Run("user in namespace A cannot see namespace B users", func(t *testing.T) {
		authUserA := &auth.User{
			ID:          userA.ID,
			Email:       userA.Email,
			NamespaceID: userA.NamespaceID,
			Role:        auth.RoleStudent,
		}

		visibleUsers, err := tdb.queryUsersAsUser(ctx, authUserA)
		if err != nil {
			t.Fatalf("query users as A: %v", err)
		}

		// User A should see only themselves (same namespace)
		for _, uid := range visibleUsers {
			if uid == userB.ID {
				t.Error("user A should not see user B from different namespace")
			}
		}

		// User A should see their own user
		found := false
		for _, uid := range visibleUsers {
			if uid == userA.ID {
				found = true
				break
			}
		}
		if !found {
			t.Error("user A should see their own user record")
		}
	})

	t.Run("user in namespace A can only see namespace A", func(t *testing.T) {
		authUserA := &auth.User{
			ID:          userA.ID,
			Email:       userA.Email,
			NamespaceID: userA.NamespaceID,
			Role:        auth.RoleStudent,
		}

		visibleNamespaces, err := tdb.queryNamespacesAsUser(ctx, authUserA)
		if err != nil {
			t.Fatalf("query namespaces as A: %v", err)
		}

		// User A should see only their own namespace
		if len(visibleNamespaces) != 1 {
			t.Errorf("expected 1 namespace, got %d: %v", len(visibleNamespaces), visibleNamespaces)
		}
		if len(visibleNamespaces) > 0 && visibleNamespaces[0] != tdb.nsID {
			t.Errorf("expected namespace %s, got %s", tdb.nsID, visibleNamespaces[0])
		}
	})
}

func TestRLSPolicies_SystemAdminSeesAll(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	// tdb.nsID is namespace A; create a second namespace
	nsBID := "ns-" + uuid.New().String()
	nsB := testNamespace{ID: nsBID, DisplayName: "Namespace B"}
	if err := tdb.createNamespace(ctx, nsB); err != nil {
		t.Fatalf("create namespace B: %v", err)
	}
	t.Cleanup(func() {
		_, _ = tdb.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsBID)
	})

	// Create system-admin (no namespace) with run-specific email
	sysAdmin := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("sysadmin-%s@test.com", uuid.New().String()[:8]),
		Role:        auth.RoleSystemAdmin,
		NamespaceID: "", // system-admin has no namespace
	}
	t.Cleanup(func() {
		_, _ = tdb.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", sysAdmin.ID)
	})

	// Create users in namespaces
	userA := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("user-a-%s@test.com", tdb.nsID),
		Role:        auth.RoleStudent,
		NamespaceID: tdb.nsID,
	}
	userB := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("user-b-%s@test.com", nsBID),
		Role:        auth.RoleStudent,
		NamespaceID: nsBID,
	}

	if err := tdb.createUser(ctx, sysAdmin); err != nil {
		t.Fatalf("create system admin: %v", err)
	}
	if err := tdb.createUser(ctx, userA); err != nil {
		t.Fatalf("create user A: %v", err)
	}
	if err := tdb.createUser(ctx, userB); err != nil {
		t.Fatalf("create user B: %v", err)
	}

	t.Run("system-admin sees all namespaces", func(t *testing.T) {
		authSysAdmin := &auth.User{
			ID:          sysAdmin.ID,
			Email:       sysAdmin.Email,
			NamespaceID: "", // empty for system-admin
			Role:        auth.RoleSystemAdmin,
		}

		visibleNamespaces, err := tdb.queryNamespacesAsUser(ctx, authSysAdmin)
		if err != nil {
			t.Fatalf("query namespaces as sysadmin: %v", err)
		}

		if len(visibleNamespaces) < 2 {
			t.Errorf("system-admin should see all namespaces, got %d: %v", len(visibleNamespaces), visibleNamespaces)
		}

		foundA, foundB := false, false
		for _, nsID := range visibleNamespaces {
			if nsID == tdb.nsID {
				foundA = true
			}
			if nsID == nsBID {
				foundB = true
			}
		}
		if !foundA {
			t.Error("system-admin should see namespace A")
		}
		if !foundB {
			t.Error("system-admin should see namespace B")
		}
	})

	t.Run("system-admin sees all users", func(t *testing.T) {
		authSysAdmin := &auth.User{
			ID:          sysAdmin.ID,
			Email:       sysAdmin.Email,
			NamespaceID: "",
			Role:        auth.RoleSystemAdmin,
		}

		visibleUsers, err := tdb.queryUsersAsUser(ctx, authSysAdmin)
		if err != nil {
			t.Fatalf("query users as sysadmin: %v", err)
		}

		if len(visibleUsers) < 3 {
			t.Errorf("system-admin should see all users, got %d", len(visibleUsers))
		}

		foundAdmin, foundA, foundB := false, false, false
		for _, uid := range visibleUsers {
			if uid == sysAdmin.ID {
				foundAdmin = true
			}
			if uid == userA.ID {
				foundA = true
			}
			if uid == userB.ID {
				foundB = true
			}
		}
		if !foundAdmin {
			t.Error("system-admin should see their own record")
		}
		if !foundA {
			t.Error("system-admin should see user A")
		}
		if !foundB {
			t.Error("system-admin should see user B")
		}
	})
}

func TestRLSPolicies_RoleBasedAccess(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	// Create users with different roles in the test namespace
	instructor := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("instructor-%s@test.com", tdb.nsID),
		Role:        auth.RoleInstructor,
		NamespaceID: tdb.nsID,
	}
	student := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("student-%s@test.com", tdb.nsID),
		Role:        auth.RoleStudent,
		NamespaceID: tdb.nsID,
	}
	nsAdmin := testUser{
		ID:          uuid.New(),
		Email:       fmt.Sprintf("ns-admin-%s@test.com", tdb.nsID),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: tdb.nsID,
	}

	if err := tdb.createUser(ctx, instructor); err != nil {
		t.Fatalf("create instructor: %v", err)
	}
	if err := tdb.createUser(ctx, student); err != nil {
		t.Fatalf("create student: %v", err)
	}
	if err := tdb.createUser(ctx, nsAdmin); err != nil {
		t.Fatalf("create ns-admin: %v", err)
	}

	t.Run("student can see users in same namespace", func(t *testing.T) {
		authStudent := &auth.User{
			ID:          student.ID,
			Email:       student.Email,
			NamespaceID: student.NamespaceID,
			Role:        auth.RoleStudent,
		}

		visibleUsers, err := tdb.queryUsersAsUser(ctx, authStudent)
		if err != nil {
			t.Fatalf("query users as student: %v", err)
		}

		// Student should see all users in their namespace
		if len(visibleUsers) < 3 {
			t.Errorf("student should see all namespace users, got %d", len(visibleUsers))
		}
	})

	t.Run("namespace-admin sees namespace users", func(t *testing.T) {
		authNSAdmin := &auth.User{
			ID:          nsAdmin.ID,
			Email:       nsAdmin.Email,
			NamespaceID: nsAdmin.NamespaceID,
			Role:        auth.RoleNamespaceAdmin,
		}

		visibleUsers, err := tdb.queryUsersAsUser(ctx, authNSAdmin)
		if err != nil {
			t.Fatalf("query users as ns-admin: %v", err)
		}

		if len(visibleUsers) < 3 {
			t.Errorf("ns-admin should see all namespace users, got %d", len(visibleUsers))
		}
	})
}

// =============================================================================
// Transaction Behavior Tests
// =============================================================================

func TestTransaction_RollbackOnError(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	userID := uuid.New()
	intentionalErr := errors.New("intentional error for rollback test")

	// Attempt to create user in a transaction that will fail
	err := func() error {
		tx, err := tdb.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx: %w", err)
		}
		defer func() {
			_ = tx.Rollback(ctx)
		}()

		_, err = tx.Exec(ctx, `
			INSERT INTO users (id, email, role, namespace_id)
			VALUES ($1, $2, $3, $4)
		`, userID, fmt.Sprintf("rollback-%s@test.com", tdb.nsID), "student", tdb.nsID)
		if err != nil {
			return fmt.Errorf("insert user: %w", err)
		}

		// Return error to trigger rollback (don't commit)
		return intentionalErr
	}()

	if !errors.Is(err, intentionalErr) {
		t.Fatalf("expected intentional error, got: %v", err)
	}

	// Verify user was NOT created (rollback worked)
	var count int
	err = tdb.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID).Scan(&count)
	if err != nil {
		t.Fatalf("query user count: %v", err)
	}

	if count != 0 {
		t.Error("user should not exist after transaction rollback")
	}
}

func TestTransaction_CommitOnSuccess(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	userID := uuid.New()

	// Create user in a transaction that commits
	err := func() error {
		tx, err := tdb.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx: %w", err)
		}
		defer func() {
			_ = tx.Rollback(ctx) // no-op if committed
		}()

		_, err = tx.Exec(ctx, `
			INSERT INTO users (id, email, role, namespace_id)
			VALUES ($1, $2, $3, $4)
		`, userID, fmt.Sprintf("commit-%s@test.com", tdb.nsID), "student", tdb.nsID)
		if err != nil {
			return fmt.Errorf("insert user: %w", err)
		}

		return tx.Commit(ctx)
	}()

	if err != nil {
		t.Fatalf("transaction failed: %v", err)
	}

	// Verify user WAS created (commit worked)
	var count int
	err = tdb.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID).Scan(&count)
	if err != nil {
		t.Fatalf("query user count: %v", err)
	}

	if count != 1 {
		t.Error("user should exist after transaction commit")
	}
}

func TestTransaction_Savepoint(t *testing.T) {
	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()

	userID1 := uuid.New()
	userID2 := uuid.New()

	// Test savepoint behavior
	err := func() error {
		tx, err := tdb.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx: %w", err)
		}
		defer func() {
			_ = tx.Rollback(ctx)
		}()

		// Insert first user
		_, err = tx.Exec(ctx, `
			INSERT INTO users (id, email, role, namespace_id)
			VALUES ($1, $2, $3, $4)
		`, userID1, fmt.Sprintf("savepoint-user1-%s@test.com", tdb.nsID), "student", tdb.nsID)
		if err != nil {
			return fmt.Errorf("insert user 1: %w", err)
		}

		// Create savepoint (nested transaction in pgx)
		nested, err := tx.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin nested tx: %w", err)
		}

		// Insert second user in nested transaction
		_, err = nested.Exec(ctx, `
			INSERT INTO users (id, email, role, namespace_id)
			VALUES ($1, $2, $3, $4)
		`, userID2, fmt.Sprintf("savepoint-user2-%s@test.com", tdb.nsID), "student", tdb.nsID)
		if err != nil {
			return fmt.Errorf("insert user 2: %w", err)
		}

		// Rollback nested transaction (savepoint)
		if err := nested.Rollback(ctx); err != nil {
			return fmt.Errorf("rollback nested: %w", err)
		}

		// Commit outer transaction
		return tx.Commit(ctx)
	}()

	if err != nil {
		t.Fatalf("transaction failed: %v", err)
	}

	// User 1 should exist (outer transaction committed)
	var count1 int
	err = tdb.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID1).Scan(&count1)
	if err != nil {
		t.Fatalf("query user 1 count: %v", err)
	}
	if count1 != 1 {
		t.Error("user 1 should exist (outer tx committed)")
	}

	// User 2 should NOT exist (nested transaction rolled back)
	var count2 int
	err = tdb.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID2).Scan(&count2)
	if err != nil {
		t.Fatalf("query user 2 count: %v", err)
	}
	if count2 != 0 {
		t.Error("user 2 should not exist (nested tx rolled back)")
	}
}

// =============================================================================
// Connection Pool Tests
// =============================================================================

// parsePortFromURL extracts the port from a URL, defaulting to 5432.
func parsePortFromURL(parsedURL *url.URL) int {
	if parsedURL.Port() == "" {
		return 5432
	}
	port, err := strconv.Atoi(parsedURL.Port())
	if err != nil {
		return 5432
	}
	return port
}

func TestPool_HealthCheck(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	// Parse DATABASE_URL to get pool config
	parsedURL, err := url.Parse(dbURL)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	password, _ := parsedURL.User.Password()
	port := parsePortFromURL(parsedURL)

	cfg := db.PoolConfig{
		Host:            parsedURL.Hostname(),
		Port:            port,
		Database:        parsedURL.Path[1:], // Remove leading /
		User:            parsedURL.User.Username(),
		Password:        password,
		MaxConns:        5,
		MinConns:        1,
		MaxConnLifetime: 30 * time.Minute,
		MaxConnIdleTime: 5 * time.Minute,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	defer pool.Close()

	t.Run("health check returns healthy", func(t *testing.T) {
		status := pool.Health(ctx)
		if !status.Healthy {
			t.Errorf("pool should be healthy, got message: %s", status.Message)
		}
		if status.Message != "OK" {
			t.Errorf("expected message 'OK', got: %s", status.Message)
		}
	})

	t.Run("pool stats are valid", func(t *testing.T) {
		status := pool.Health(ctx)

		// Total connections should be at least MinConns
		if status.TotalConns < 1 {
			t.Errorf("expected at least 1 total connection, got %d", status.TotalConns)
		}

		// Acquired connections should be non-negative
		if status.AcquireConns < 0 {
			t.Errorf("acquired connections should be non-negative, got %d", status.AcquireConns)
		}
	})
}

func TestPool_ConnectionReuse(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	// Parse DATABASE_URL
	parsedURL, err := url.Parse(dbURL)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	password, _ := parsedURL.User.Password()
	port := parsePortFromURL(parsedURL)

	cfg := db.PoolConfig{
		Host:     parsedURL.Hostname(),
		Port:     port,
		Database: parsedURL.Path[1:],
		User:     parsedURL.User.Username(),
		Password: password,
		MaxConns: 2,
		MinConns: 1,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	defer pool.Close()

	// Acquire and release connections multiple times
	for i := 0; i < 5; i++ {
		conn, err := pool.PgxPool().Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection %d: %v", i, err)
		}

		// Execute a simple query
		var result int
		err = conn.QueryRow(ctx, "SELECT 1").Scan(&result)
		if err != nil {
			conn.Release()
			t.Fatalf("query %d: %v", i, err)
		}
		if result != 1 {
			conn.Release()
			t.Fatalf("expected 1, got %d", result)
		}

		conn.Release()
	}

	// Verify pool stats
	status := pool.Health(ctx)
	if !status.Healthy {
		t.Errorf("pool should still be healthy after reuse: %s", status.Message)
	}

	// Total connections should not exceed MaxConns
	if status.TotalConns > 2 {
		t.Errorf("total connections (%d) should not exceed MaxConns (2)", status.TotalConns)
	}
}

// =============================================================================
// Integration with db.WithTx
// =============================================================================

func TestWithTx_Integration(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	// Parse DATABASE_URL
	parsedURL, err := url.Parse(dbURL)
	if err != nil {
		t.Fatalf("parse DATABASE_URL: %v", err)
	}

	password, _ := parsedURL.User.Password()
	port := parsePortFromURL(parsedURL)

	cfg := db.PoolConfig{
		Host:     parsedURL.Hostname(),
		Port:     port,
		Database: parsedURL.Path[1:],
		User:     parsedURL.User.Username(),
		Password: password,
		MaxConns: 5,
		MinConns: 1,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	defer pool.Close()

	// Create a random namespace for this test run
	withtxNS := "ns-withtx-" + uuid.New().String()
	_, err = pool.PgxPool().Exec(ctx, `
		INSERT INTO namespaces (id, display_name, active)
		VALUES ($1, $2, true)
	`, withtxNS, "WithTx Test Namespace")
	if err != nil {
		t.Fatalf("create namespace: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.PgxPool().Exec(context.Background(), "DELETE FROM namespaces WHERE id = $1", withtxNS)
	})

	userID := uuid.New()

	t.Run("WithTx commits on success", func(t *testing.T) {
		err := pool.WithTx(ctx, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
				INSERT INTO users (id, email, role, namespace_id)
				VALUES ($1, $2, $3, $4)
			`, userID, fmt.Sprintf("withtx-success-%s@test.com", withtxNS), "student", withtxNS)
			return err
		})

		if err != nil {
			t.Fatalf("WithTx failed: %v", err)
		}

		// Verify user exists
		var count int
		err = pool.PgxPool().QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID).Scan(&count)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Error("user should exist after WithTx success")
		}
	})

	t.Run("WithTx rolls back on error", func(t *testing.T) {
		rollbackUserID := uuid.New()
		intentionalErr := errors.New("intentional rollback")

		err := pool.WithTx(ctx, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
				INSERT INTO users (id, email, role, namespace_id)
				VALUES ($1, $2, $3, $4)
			`, rollbackUserID, fmt.Sprintf("withtx-rollback-%s@test.com", withtxNS), "student", withtxNS)
			if err != nil {
				return err
			}
			return intentionalErr
		})

		if !errors.Is(err, intentionalErr) {
			t.Fatalf("expected intentional error, got: %v", err)
		}

		// Verify user does NOT exist
		var count int
		err = pool.PgxPool().QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", rollbackUserID).Scan(&count)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 0 {
			t.Error("user should not exist after WithTx rollback")
		}
	})
}

// =============================================================================
// Registration RLS Policy Tests
// =============================================================================

func TestRLSPolicies_RegistrationContext(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	tdb := setupTestDB(t)
	if tdb == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	defer tdb.close()

	ctx := context.Background()
	tdb.cleanup(ctx, t)

	// --- Seed test data as superuser (bypasses RLS) ---
	nsID := "reg-test-ns"
	_, err := tdb.pool.Exec(ctx, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Registration Test NS', true)`, nsID)
	if err != nil {
		t.Fatalf("create namespace: %v", err)
	}

	inactiveNsID := "reg-test-ns-inactive"
	_, err = tdb.pool.Exec(ctx, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Inactive NS', false)`, inactiveNsID)
	if err != nil {
		t.Fatalf("create inactive namespace: %v", err)
	}

	// Create an instructor (needed as created_by / FK references)
	instructorID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'instructor@test.com', 'instructor', $2)`, instructorID, nsID)
	if err != nil {
		t.Fatalf("create instructor: %v", err)
	}

	// Create a class
	classID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`, classID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	// Create active and inactive sections
	activeSectionID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO sections (id, namespace_id, class_id, name, join_code, active) VALUES ($1, $2, $3, 'Active Section', 'ABC-123', true)`, activeSectionID, nsID, classID)
	if err != nil {
		t.Fatalf("create active section: %v", err)
	}

	inactiveSectionID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO sections (id, namespace_id, class_id, name, join_code, active) VALUES ($1, $2, $3, 'Inactive Section', 'XYZ-789', false)`, inactiveSectionID, nsID, classID)
	if err != nil {
		t.Fatalf("create inactive section: %v", err)
	}

	// Create invitations: pending, consumed, expired, revoked
	pendingInvID := uuid.New()
	consumedInvID := uuid.New()
	expiredInvID := uuid.New()
	revokedInvID := uuid.New()

	_, err = tdb.pool.Exec(ctx, `INSERT INTO invitations (id, email, target_role, namespace_id, created_by, expires_at) VALUES ($1, 'pending@test.com', 'instructor', $2, $3, now() + interval '7 days')`, pendingInvID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create pending invitation: %v", err)
	}

	_, err = tdb.pool.Exec(ctx, `INSERT INTO invitations (id, email, target_role, namespace_id, created_by, expires_at, consumed_at) VALUES ($1, 'consumed@test.com', 'instructor', $2, $3, now() + interval '7 days', now())`, consumedInvID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create consumed invitation: %v", err)
	}

	_, err = tdb.pool.Exec(ctx, `INSERT INTO invitations (id, email, target_role, namespace_id, created_by, expires_at) VALUES ($1, 'expired@test.com', 'instructor', $2, $3, now() - interval '1 day')`, expiredInvID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create expired invitation: %v", err)
	}

	_, err = tdb.pool.Exec(ctx, `INSERT INTO invitations (id, email, target_role, namespace_id, created_by, expires_at, revoked_at) VALUES ($1, 'revoked@test.com', 'instructor', $2, $3, now() + interval '7 days', now())`, revokedInvID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create revoked invitation: %v", err)
	}

	// A separate pending invitation that will be consumed in the UPDATE test
	consumeTestInvID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO invitations (id, email, target_role, namespace_id, created_by, expires_at) VALUES ($1, 'consume-test@test.com', 'instructor', $2, $3, now() + interval '7 days')`, consumeTestInvID, nsID, instructorID)
	if err != nil {
		t.Fatalf("create consume-test invitation: %v", err)
	}

	// Users for membership tests
	memberUserID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'member-test@test.com', 'student', $2)`, memberUserID, nsID)
	if err != nil {
		t.Fatalf("create member-test user: %v", err)
	}

	instrMemberID := uuid.New()
	_, err = tdb.pool.Exec(ctx, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'instr-member@test.com', 'instructor', $2)`, instrMemberID, nsID)
	if err != nil {
		t.Fatalf("create instr-member user: %v", err)
	}

	// A problem (for testing that registration context cannot see it)
	_, err = tdb.pool.Exec(ctx, `INSERT INTO problems (namespace_id, title, author_id) VALUES ($1, 'Test Problem', $2)`, nsID, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	// --- Tests using registration context ---

	t.Run("can SELECT non-expired non-revoked invitations", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		rows, err := conn.Query(ctx, "SELECT id FROM invitations")
		if err != nil {
			t.Fatalf("query invitations: %v", err)
		}
		defer rows.Close()

		visible := make(map[uuid.UUID]bool)
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				t.Fatalf("scan: %v", err)
			}
			visible[id] = true
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("rows error: %v", err)
		}

		// Should see: pending, consumed (not expired/revoked), consume-test
		// Should NOT see: expired, revoked
		if !visible[pendingInvID] {
			t.Error("should see pending invitation")
		}
		if !visible[consumedInvID] {
			t.Error("should see consumed (but valid) invitation")
		}
		if !visible[consumeTestInvID] {
			t.Error("should see consume-test invitation")
		}
		if visible[expiredInvID] {
			t.Error("should NOT see expired invitation")
		}
		if visible[revokedInvID] {
			t.Error("should NOT see revoked invitation")
		}
	})

	t.Run("can UPDATE (consume) pending invitation", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		// Should be able to set consumed_at on a pending invitation
		tag, err := conn.Exec(ctx, `UPDATE invitations SET consumed_at = now() WHERE id = $1`, consumeTestInvID)
		if err != nil {
			t.Fatalf("update invitation: %v", err)
		}
		if tag.RowsAffected() != 1 {
			t.Errorf("expected 1 row affected, got %d", tag.RowsAffected())
		}
	})

	t.Run("cannot UPDATE already-consumed invitation", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		// Already-consumed invitation should not be visible to UPDATE
		tag, err := conn.Exec(ctx, `UPDATE invitations SET consumed_at = now() WHERE id = $1`, consumedInvID)
		if err != nil {
			t.Fatalf("update consumed invitation: %v", err)
		}
		if tag.RowsAffected() != 0 {
			t.Error("should not be able to update already-consumed invitation")
		}
	})

	t.Run("can SELECT active sections only", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		rows, err := conn.Query(ctx, "SELECT id FROM sections")
		if err != nil {
			t.Fatalf("query sections: %v", err)
		}
		defer rows.Close()

		var ids []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				t.Fatalf("scan: %v", err)
			}
			ids = append(ids, id)
		}

		if len(ids) != 1 {
			t.Fatalf("expected 1 visible section (active), got %d", len(ids))
		}
		if ids[0] != activeSectionID {
			t.Errorf("expected active section %s, got %s", activeSectionID, ids[0])
		}
	})

	t.Run("can SELECT classes", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		var count int
		err = conn.QueryRow(ctx, "SELECT COUNT(*) FROM classes").Scan(&count)
		if err != nil {
			t.Fatalf("query classes: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 class visible, got %d", count)
		}
	})

	t.Run("can SELECT active namespaces only", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		rows, err := conn.Query(ctx, "SELECT id FROM namespaces")
		if err != nil {
			t.Fatalf("query namespaces: %v", err)
		}
		defer rows.Close()

		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				t.Fatalf("scan: %v", err)
			}
			ids = append(ids, id)
		}

		// Should see the active namespace but NOT the inactive one
		foundActive, foundInactive := false, false
		for _, id := range ids {
			if id == nsID {
				foundActive = true
			}
			if id == inactiveNsID {
				foundInactive = true
			}
		}
		if !foundActive {
			t.Error("registration context should see active namespace")
		}
		if foundInactive {
			t.Error("registration context should NOT see inactive namespace")
		}
	})

	t.Run("can INSERT users", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		newUserID := uuid.New()
		_, err = conn.Exec(ctx, `INSERT INTO users (id, external_id, email, role, namespace_id) VALUES ($1, $2, 'newstudent@test.com', 'student', $3)`, newUserID, "ext-"+newUserID.String()[:8], nsID)
		if err != nil {
			t.Fatalf("insert user: %v", err)
		}

		// Verify user was created (check as superuser)
		var count int
		err = tdb.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", newUserID).Scan(&count)
		if err != nil {
			t.Fatalf("verify user: %v", err)
		}
		if count != 1 {
			t.Error("user should have been created")
		}
	})

	t.Run("can INSERT student membership only", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		// Should be able to insert student membership
		_, err = conn.Exec(ctx, `INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'student')`, memberUserID, activeSectionID)
		if err != nil {
			t.Fatalf("insert student membership: %v", err)
		}
	})

	t.Run("cannot INSERT instructor membership", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		// Should NOT be able to insert instructor membership
		_, err = conn.Exec(ctx, `INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`, instrMemberID, activeSectionID)
		if err == nil {
			t.Error("should not be able to insert instructor membership in registration context")
		}
	})

	t.Run("cannot SELECT users", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		// Registration context should not be able to see existing users
		var count int
		err = conn.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
		if err != nil {
			t.Fatalf("query users: %v", err)
		}
		if count != 0 {
			t.Errorf("registration context should not see any users, got %d", count)
		}
	})

	t.Run("cannot DELETE invitations", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		tag, err := conn.Exec(ctx, `DELETE FROM invitations WHERE id = $1`, pendingInvID)
		if err != nil {
			t.Fatalf("delete invitation: %v", err)
		}
		if tag.RowsAffected() != 0 {
			t.Error("registration context should not be able to delete invitations")
		}
	})

	t.Run("cannot SELECT problems", func(t *testing.T) {
		conn, err := tdb.pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire: %v", err)
		}
		defer conn.Release()

		if err := tdb.setRegistrationRLSContext(ctx, conn); err != nil {
			t.Fatalf("set registration context: %v", err)
		}

		var count int
		err = conn.QueryRow(ctx, "SELECT COUNT(*) FROM problems").Scan(&count)
		if err != nil {
			t.Fatalf("query problems: %v", err)
		}
		if count != 0 {
			t.Errorf("registration context should not see any problems, got %d", count)
		}
	})
}
