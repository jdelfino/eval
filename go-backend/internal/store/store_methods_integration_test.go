// Integration tests for store methods added in PR #24.
//
// These tests validate actual Store methods with proper RLS context,
// ensuring that the SQL queries, scanning logic, and RLS policies work
// together as they would in production.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// ensureRolesOnce guards the one-time EnsureAppRole call so that parallel
// tests don't race on PostgreSQL catalog GRANT statements.
var ensureRolesOnce sync.Once

// integrationDB wraps a pool for integration tests and provides helper methods.
// Each instance owns a random namespace for test isolation.
type integrationDB struct {
	pool    *pgxpool.Pool // superuser pool for scaffolding (inserts, cleanup)
	appPool *pgxpool.Pool // non-superuser pool mirroring production
	nsID    string        // random namespace scoped to this test run
}

func setupIntegrationDB(t *testing.T) *integrationDB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
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

	// Ensure eval_app and app roles exist for RLS testing.
	// Guarded by sync.Once because concurrent GRANT statements cause
	// "tuple concurrently updated" errors in PostgreSQL system catalogs.
	var roleErr error
	ensureRolesOnce.Do(func() {
		roleErr = testutil.EnsureAppRole(ctx, pool)
	})
	if roleErr != nil {
		pool.Close()
		t.Fatalf("failed to ensure app roles: %v", roleErr)
	}

	// Create non-superuser pool mirroring production.
	appPool, err := testutil.NewAppPool(ctx, dbURL)
	if err != nil {
		pool.Close()
		t.Fatalf("failed to create app pool: %v", err)
	}

	nsID := "ns-" + uuid.New().String()
	_, err = pool.Exec(ctx,
		`INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`,
		nsID, "Test NS "+nsID)
	if err != nil {
		appPool.Close()
		pool.Close()
		t.Fatalf("failed to create test namespace: %v", err)
	}

	idb := &integrationDB{pool: pool, appPool: appPool, nsID: nsID}
	t.Cleanup(func() {
		idb.cleanup(context.Background(), t)
		idb.close()
	})
	return idb
}


func (db *integrationDB) close() {
	if db != nil {
		if db.appPool != nil {
			db.appPool.Close()
		}
		if db.pool != nil {
			db.pool.Close()
		}
	}
}

// cleanup removes test data by deleting the test namespace.
// ON DELETE CASCADE removes all child rows automatically.
func (db *integrationDB) cleanup(ctx context.Context, t *testing.T) {
	t.Helper()
	_, err := db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", db.nsID)
	if err != nil {
		t.Logf("warning: failed to delete namespace %s: %v", db.nsID, err)
	}
}

// setRLSContext sets the PostgreSQL session variables for RLS.
// It also sets the role to 'eval_app' so that RLS policies are enforced
// (superusers bypass RLS).
func (db *integrationDB) setRLSContext(ctx context.Context, conn *pgxpool.Conn, user *auth.User) error {
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

// storeWithRLS acquires a connection, sets RLS context, and returns a Store.
// The caller must release the connection.
func (db *integrationDB) storeWithRLS(ctx context.Context, t *testing.T, user *auth.User) (*Store, *pgxpool.Conn) {
	t.Helper()
	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}

	// Always release connection on test cleanup to prevent pool.Close() from
	// hanging when a test fails (e.g. via Fatalf) before the caller's manual
	// conn.Release(). pgxpool.Conn.Release is idempotent (no-op after first call).
	t.Cleanup(conn.Release)

	if err := db.setRLSContext(ctx, conn, user); err != nil {
		conn.Release()
		t.Fatalf("set RLS context: %v", err)
	}

	return New(conn), conn
}

// setPublicRLSContext sets the role to eval_app and sets app.role to 'public'.
// This mirrors what PublicStoreMiddleware does in production (migration 016).
func (db *integrationDB) setPublicRLSContext(ctx context.Context, conn *pgxpool.Conn) error {
	_, err := conn.Exec(ctx, "SET ROLE eval_app")
	if err != nil {
		return fmt.Errorf("set role to eval_app: %w", err)
	}

	// Clear stale user-specific variables — pooled connections may retain
	// app.user_id / app.namespace_id from a previous storeWithRLS call,
	// which would widen the public context beyond what migration 016 intends.
	_, err = conn.Exec(ctx, "SELECT set_config('app.user_id', '', false), set_config('app.namespace_id', '', false)")
	if err != nil {
		return fmt.Errorf("clear stale session vars: %w", err)
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.role', $1, false)", "public")
	if err != nil {
		return fmt.Errorf("set app.role: %w", err)
	}

	return nil
}

// storeWithPublicRLS acquires a connection, sets the public RLS context
// (eval_app + app.role=public), and returns a Store. The caller must release
// the connection.
func (db *integrationDB) storeWithPublicRLS(ctx context.Context, t *testing.T) (*Store, *pgxpool.Conn) {
	t.Helper()
	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	t.Cleanup(conn.Release)

	if err := db.setPublicRLSContext(ctx, conn); err != nil {
		conn.Release()
		t.Fatalf("set public RLS context: %v", err)
	}

	return New(conn), conn
}

// execAsSuperuser runs SQL as superuser by resetting the role first.
// This is needed because connections returned to the pool may still have
// SET ROLE eval_app from previous RLS testing.
func (db *integrationDB) execAsSuperuser(ctx context.Context, sql string, args ...interface{}) error {
	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	// Reset to superuser role (the pool's default user)
	_, err = conn.Exec(ctx, "RESET ROLE")
	if err != nil {
		return err
	}

	_, err = conn.Exec(ctx, sql, args...)
	return err
}

// seed helpers

func (db *integrationDB) createNamespace(ctx context.Context, t *testing.T, id, displayName string) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`, id, displayName)
	if err != nil {
		t.Fatalf("create namespace %s: %v", id, err)
	}
}

func (db *integrationDB) createUser(ctx context.Context, t *testing.T, id uuid.UUID, email, role, nsID string) {
	t.Helper()
	var ns *string
	if nsID != "" {
		ns = &nsID
	}
	err := db.execAsSuperuser(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES ($1, $2, $3, $4)`,
		id, email, role, ns)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}
}

func (db *integrationDB) createUserWithDisplayName(ctx context.Context, t *testing.T, id uuid.UUID, email, role, nsID, displayName string) {
	t.Helper()
	var ns *string
	if nsID != "" {
		ns = &nsID
	}
	err := db.execAsSuperuser(ctx,
		`INSERT INTO users (id, email, role, namespace_id, display_name) VALUES ($1, $2, $3, $4, $5)`,
		id, email, role, ns, displayName)
	if err != nil {
		t.Fatalf("create user %s: %v", email, err)
	}
}

func (db *integrationDB) createClass(ctx context.Context, t *testing.T, id uuid.UUID, nsID, name string, createdBy uuid.UUID) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
		id, nsID, name, createdBy)
	if err != nil {
		t.Fatalf("create class %s: %v", name, err)
	}
}

// uniqueJoinCode generates a unique join code using the section ID.
func uniqueJoinCode(sectionID uuid.UUID, prefix string) string {
	return prefix + "-" + sectionID.String()[:8]
}

func (db *integrationDB) createSection(ctx context.Context, t *testing.T, id uuid.UUID, nsID string, classID uuid.UUID, name, joinCodePrefix string) {
	t.Helper()
	// Generate unique join code using section ID to avoid conflicts across test runs
	joinCode := uniqueJoinCode(id, joinCodePrefix)
	err := db.execAsSuperuser(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
		id, nsID, classID, name, joinCode)
	if err != nil {
		t.Fatalf("create section %s: %v", name, err)
	}
}

func (db *integrationDB) createMembership(ctx context.Context, t *testing.T, userID, sectionID uuid.UUID, role string) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, $3)`,
		userID, sectionID, role)
	if err != nil {
		t.Fatalf("create membership user=%s section=%s: %v", userID, sectionID, err)
	}
}

func (db *integrationDB) createStudentWork(ctx context.Context, t *testing.T, id uuid.UUID, nsID string, userID, problemID, sectionID uuid.UUID) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, execution_settings)
		 VALUES ($1, $2, $3, $4, $5, '', '{}')`,
		id, nsID, userID, problemID, sectionID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}
}

func (db *integrationDB) createProblem(ctx context.Context, t *testing.T, id uuid.UUID, nsID, title string, authorID uuid.UUID, classID *uuid.UUID, tags []string) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id, class_id, tags)
		 VALUES ($1, $2, $3, '{}', '{}', $4, $5, $6)`,
		id, nsID, title, authorID, classID, tags)
	if err != nil {
		t.Fatalf("create problem %s: %v", title, err)
	}
}


// =============================================================================
// Test: ListProblemsFiltered - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListProblemsFiltered(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	author2ID := uuid.New()
	db.createUser(ctx, t, author2ID, "author2@test.com", "instructor", nsID)

	p1 := uuid.New()
	p2 := uuid.New()
	p3 := uuid.New()
	db.createProblem(ctx, t, p1, nsID, "Alpha Problem", authorID, &classID, []string{"easy", "arrays"})
	time.Sleep(10 * time.Millisecond)
	db.createProblem(ctx, t, p2, nsID, "Beta Problem", author2ID, nil, []string{"hard", "graphs"})
	time.Sleep(10 * time.Millisecond)
	db.createProblem(ctx, t, p3, nsID, "Charlie Problem", authorID, &classID, []string{"easy", "strings"})

	// Create auth user for RLS context
	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("no filters returns all in namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 3 {
			t.Errorf("expected 3 problems, got %d", len(results))
		}
	})

	t.Run("filter by class_id", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{ClassID: &classID})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 problems in class, got %d", len(results))
		}
	})

	t.Run("filter by author_id", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{AuthorID: &authorID})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 problems by author, got %d", len(results))
		}
	})

	t.Run("filter by tags", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{Tags: []string{"easy"}})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 easy problems, got %d", len(results))
		}
	})

	t.Run("public_only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{PublicOnly: true})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 1 {
			t.Errorf("expected 1 public problem, got %d", len(results))
		}
		if len(results) > 0 && results[0].ID != p2 {
			t.Errorf("expected problem %s, got %s", p2, results[0].ID)
		}
	})

	t.Run("sort by title asc", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{SortBy: "title"})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) >= 2 && results[0].Title > results[1].Title {
			t.Errorf("expected ascending title order, got %s before %s", results[0].Title, results[1].Title)
		}
	})

	t.Run("sort by title desc", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{SortBy: "title", SortOrder: "desc"})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) >= 2 && results[0].Title < results[1].Title {
			t.Errorf("expected descending title order, got %s before %s", results[0].Title, results[1].Title)
		}
	})

	t.Run("combined filters: class + tags", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{ClassID: &classID, Tags: []string{"easy"}})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 problems matching class+tags, got %d", len(results))
		}
	})

	t.Run("invalid sort_by defaults to created_at", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{SortBy: "invalid_column"})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 3 {
			t.Errorf("expected 3 problems, got %d", len(results))
		}
		// Should be in created_at ASC order: p1, p2, p3
		if len(results) == 3 && results[0].ID != p1 {
			t.Errorf("expected first problem %s (oldest), got %s", p1, results[0].ID)
		}
	})

	// include_public: when ClassID is set AND IncludePublic=true, returns both
	// class-specific problems AND classless (public) problems.
	t.Run("include_public with class_id returns class + public problems", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{ClassID: &classID, IncludePublic: true})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		// p1 and p3 are in classID, p2 has class_id=nil (public)
		if len(results) != 3 {
			t.Errorf("expected 3 problems (class + public), got %d", len(results))
		}
		ids := make(map[uuid.UUID]bool)
		for _, r := range results {
			ids[r.ID] = true
		}
		if !ids[p1] {
			t.Errorf("expected p1 (%s) in results", p1)
		}
		if !ids[p2] {
			t.Errorf("expected p2 (%s) in results (public problem)", p2)
		}
		if !ids[p3] {
			t.Errorf("expected p3 (%s) in results", p3)
		}
	})

	// include_public without class_id: behaves like no class filter, returning all problems
	t.Run("include_public without class_id returns all problems", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblemsFiltered(ctx, ProblemFilters{IncludePublic: true})
		if err != nil {
			t.Fatalf("ListProblemsFiltered: %v", err)
		}
		if len(results) != 3 {
			t.Errorf("expected 3 problems, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: ListUsers - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListUsers(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "NS B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	u1 := uuid.New()
	u2 := uuid.New()
	u3 := uuid.New()
	db.createUser(ctx, t, u1, "student1@test.com", "student", nsA)
	db.createUser(ctx, t, u2, "instructor1@test.com", "instructor", nsA)
	db.createUser(ctx, t, u3, "student2@test.com", "student", nsB)

	// Auth user in namespace A
	authUser := &auth.User{
		ID:          u1,
		Email:       "student1@test.com",
		NamespaceID: nsA,
		Role:        auth.RoleStudent,
	}

	t.Run("user sees only own namespace users", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListUsers(ctx, UserFilters{})
		if err != nil {
			t.Fatalf("ListUsers: %v", err)
		}
		// Should see only users in namespace A (2 users: u1 and u2)
		if len(results) != 2 {
			t.Errorf("expected 2 users in nsA, got %d", len(results))
		}
		// Verify none of the results are from namespace B
		for _, u := range results {
			if u.NamespaceID != nil && *u.NamespaceID == nsB {
				t.Errorf("user in namespace A should not see namespace B users")
			}
		}
	})

	t.Run("filter by role", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		role := "student"
		results, err := s.ListUsers(ctx, UserFilters{Role: &role})
		if err != nil {
			t.Fatalf("ListUsers: %v", err)
		}
		// In namespace A, there's only 1 student (u1)
		if len(results) != 1 {
			t.Errorf("expected 1 student in nsA, got %d", len(results))
		}
		if len(results) == 1 && results[0].ID != u1 {
			t.Errorf("expected user %s, got %s", u1, results[0].ID)
		}
	})
}

// =============================================================================
// Test: Cross-namespace isolation - user in ns-A cannot see ns-B data
// =============================================================================

func TestIntegration_CrossNamespaceIsolation(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "Namespace B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	// Create users in each namespace
	userA := uuid.New()
	userB := uuid.New()
	db.createUser(ctx, t, userA, "userA@test.com", "instructor", nsA)
	db.createUser(ctx, t, userB, "userB@test.com", "instructor", nsB)

	// Create problems in each namespace
	problemA := uuid.New()
	problemB := uuid.New()
	db.createProblem(ctx, t, problemA, nsA, "Problem in A", userA, nil, nil)
	db.createProblem(ctx, t, problemB, nsB, "Problem in B", userB, nil, nil)

	// Create classes in each namespace
	classA := uuid.New()
	classB := uuid.New()
	db.createClass(ctx, t, classA, nsA, "Class in A", userA)
	db.createClass(ctx, t, classB, nsB, "Class in B", userB)

	// Auth user in namespace A
	authUserA := &auth.User{
		ID:          userA,
		Email:       "userA@test.com",
		NamespaceID: nsA,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListProblems does not return namespace B problems", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		results, err := s.ListProblems(ctx, nil)
		if err != nil {
			t.Fatalf("ListProblems: %v", err)
		}

		for _, p := range results {
			if p.ID == problemB {
				t.Errorf("user in namespace A should not see problem from namespace B")
			}
			if p.NamespaceID == nsB {
				t.Errorf("user in namespace A should not see any problems from namespace B")
			}
		}

		// Should see the problem in namespace A
		found := false
		for _, p := range results {
			if p.ID == problemA {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("user should see problem in their own namespace")
		}
	})

	t.Run("ListClasses does not return namespace B classes", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		results, err := s.ListClasses(ctx)
		if err != nil {
			t.Fatalf("ListClasses: %v", err)
		}

		for _, c := range results {
			if c.ID == classB {
				t.Errorf("user in namespace A should not see class from namespace B")
			}
			if c.NamespaceID == nsB {
				t.Errorf("user in namespace A should not see any classes from namespace B")
			}
		}

		found := false
		for _, c := range results {
			if c.ID == classA {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("user should see class in their own namespace")
		}
	})

	t.Run("GetProblem returns not found for namespace B problem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.GetProblem(ctx, problemB)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound when accessing namespace B problem, got: %v", err)
		}
	})

	t.Run("GetClass returns not found for namespace B class", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.GetClass(ctx, classB)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound when accessing namespace B class, got: %v", err)
		}
	})

	t.Run("ListNamespaces only shows own namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		results, err := s.ListNamespaces(ctx)
		if err != nil {
			t.Fatalf("ListNamespaces: %v", err)
		}

		if len(results) != 1 {
			t.Errorf("expected 1 namespace, got %d", len(results))
		}
		if len(results) > 0 && results[0].ID != nsA {
			t.Errorf("expected namespace %s, got %s", nsA, results[0].ID)
		}
	})
}

// =============================================================================
// Test: Namespace Isolation - User in ns-A cannot SELECT users from ns-B
// =============================================================================

func TestIntegration_NamespaceIsolation_UserVisibility(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "Namespace B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	// Create users in each namespace
	userA := uuid.New()
	userB := uuid.New()
	db.createUser(ctx, t, userA, "userA@test.com", "instructor", nsA)
	db.createUser(ctx, t, userB, "userB@test.com", "instructor", nsB)

	authUserA := &auth.User{
		ID:          userA,
		Email:       "userA@test.com",
		NamespaceID: nsA,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListUsers does not return users from other namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		results, err := s.ListUsers(ctx, UserFilters{})
		if err != nil {
			t.Fatalf("ListUsers: %v", err)
		}

		// Should only see users in namespace A
		for _, u := range results {
			if u.ID == userB {
				t.Errorf("user in namespace A should not see user from namespace B")
			}
			if u.NamespaceID != nil && *u.NamespaceID == nsB {
				t.Errorf("user in namespace A should not see any users from namespace B")
			}
		}

		// Should see at least the user in namespace A
		found := false
		for _, u := range results {
			if u.ID == userA {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("user should see themselves in their own namespace")
		}
	})

	t.Run("GetUser returns not found for user in other namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.GetUserByID(ctx, userB)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound when accessing user in namespace B, got: %v", err)
		}
	})

	t.Run("GetUserByEmail returns not found for user in other namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.GetUserByEmail(ctx, "userB@test.com")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound when accessing user by email in namespace B, got: %v", err)
		}
	})
}

// =============================================================================
// Test: Namespace Isolation - Instructor in ns-A cannot INSERT class in ns-B
// =============================================================================

func TestIntegration_NamespaceIsolation_CreateClass(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "Namespace B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	// Create instructor in namespace A
	instructorA := uuid.New()
	db.createUser(ctx, t, instructorA, "instructorA@test.com", "instructor", nsA)

	authUserA := &auth.User{
		ID:          instructorA,
		Email:       "instructorA@test.com",
		NamespaceID: nsA,
		Role:        auth.RoleInstructor,
	}

	t.Run("instructor in ns-A can create class in ns-A", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		class, err := s.CreateClass(ctx, CreateClassParams{
			NamespaceID: nsA,
			Name:        "CS101 in A",
			CreatedBy:   instructorA,
		})
		if err != nil {
			t.Fatalf("CreateClass in own namespace should succeed: %v", err)
		}
		if class.NamespaceID != nsA {
			t.Errorf("class should be in namespace A, got %s", class.NamespaceID)
		}
	})

	t.Run("instructor in ns-A cannot create class in ns-B", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.CreateClass(ctx, CreateClassParams{
			NamespaceID: nsB, // Trying to create in different namespace
			Name:        "Unauthorized Class",
			CreatedBy:   instructorA,
		})
		if err == nil {
			t.Fatalf("CreateClass in another namespace should fail (RLS violation)")
		}
		// RLS INSERT policy violation typically results in a permission error
		// The exact error depends on PostgreSQL RLS policy behavior
		t.Logf("Got expected error when creating class in wrong namespace: %v", err)
	})
}

// =============================================================================
// Test: Namespace Isolation - User in ns-A cannot see sessions from ns-B
// =============================================================================

func TestIntegration_NamespaceIsolation_Sessions(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "Namespace B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	// Create users in each namespace
	instructorA := uuid.New()
	instructorB := uuid.New()
	db.createUser(ctx, t, instructorA, "instructorA@test.com", "instructor", nsA)
	db.createUser(ctx, t, instructorB, "instructorB@test.com", "instructor", nsB)

	// Create classes and sections in each namespace
	classA := uuid.New()
	classB := uuid.New()
	db.createClass(ctx, t, classA, nsA, "Class A", instructorA)
	db.createClass(ctx, t, classB, nsB, "Class B", instructorB)

	sectionA := uuid.New()
	sectionB := uuid.New()
	db.createSection(ctx, t, sectionA, nsA, classA, "Section A", "CODE-A")
	db.createSection(ctx, t, sectionB, nsB, classB, "Section B", "CODE-B")

	db.createMembership(ctx, t, instructorA, sectionA, "instructor")
	db.createMembership(ctx, t, instructorB, sectionB, "instructor")

	// Create sessions in each namespace
	sessionA := uuid.New()
	sessionB := uuid.New()
	db.createSession(ctx, t, sessionA, nsA, sectionA, "Section A", instructorA)
	db.createSession(ctx, t, sessionB, nsB, sectionB, "Section B", instructorB)

	authUserA := &auth.User{
		ID:          instructorA,
		Email:       "instructorA@test.com",
		NamespaceID: nsA,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListSessions does not return sessions from other namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		results, err := s.ListSessions(ctx, SessionFilters{})
		if err != nil {
			t.Fatalf("ListSessions: %v", err)
		}

		// Should not see sessions from namespace B
		for _, sess := range results {
			if sess.ID == sessionB {
				t.Errorf("user in namespace A should not see session from namespace B")
			}
			if sess.NamespaceID == nsB {
				t.Errorf("user in namespace A should not see any sessions from namespace B")
			}
		}

		// Should see the session in namespace A
		found := false
		for _, sess := range results {
			if sess.ID == sessionA {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("user should see session in their own namespace")
		}
	})

	t.Run("GetSession returns not found for session in other namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		_, err := s.GetSession(ctx, sessionB)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound when accessing session in namespace B, got: %v", err)
		}
	})
}

// =============================================================================
// Test: System Admin CAN see all namespaces
// =============================================================================

func TestIntegration_SystemAdminCanSeeAllNamespaces(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsA := db.nsID
	nsB := "ns-" + uuid.New().String()
	db.createNamespace(ctx, t, nsB, "Namespace B")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", nsB)
	})

	// Create users in each namespace
	userA := uuid.New()
	userB := uuid.New()
	db.createUser(ctx, t, userA, "userA@test.com", "instructor", nsA)
	db.createUser(ctx, t, userB, "userB@test.com", "instructor", nsB)

	// Create a system admin (no namespace)
	adminID := uuid.New()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create system admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authAdmin := &auth.User{
		ID:          adminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	t.Run("system admin can see all namespaces", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authAdmin)
		defer conn.Release()

		results, err := s.ListNamespaces(ctx)
		if err != nil {
			t.Fatalf("ListNamespaces: %v", err)
		}

		// Should see at least nsA and nsB (may see others from other tests)
		foundA := false
		foundB := false
		for _, ns := range results {
			if ns.ID == nsA {
				foundA = true
			}
			if ns.ID == nsB {
				foundB = true
			}
		}
		if !foundA {
			t.Errorf("system admin should see namespace A (%s)", nsA)
		}
		if !foundB {
			t.Errorf("system admin should see namespace B (%s)", nsB)
		}
	})

	t.Run("system admin can see users from any namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authAdmin)
		defer conn.Release()

		// System admin should be able to get users from both namespaces
		user, err := s.GetUserByID(ctx, userA)
		if err != nil {
			t.Errorf("system admin should be able to get user from namespace A: %v", err)
		} else if user.ID != userA {
			t.Errorf("expected user %s, got %s", userA, user.ID)
		}

		user, err = s.GetUserByID(ctx, userB)
		if err != nil {
			t.Errorf("system admin should be able to get user from namespace B: %v", err)
		} else if user.ID != userB {
			t.Errorf("expected user %s, got %s", userB, user.ID)
		}
	})

	// Create problems in each namespace for testing
	problemA := uuid.New()
	problemB := uuid.New()
	db.createProblem(ctx, t, problemA, nsA, "Problem A", userA, nil, nil)
	db.createProblem(ctx, t, problemB, nsB, "Problem B", userB, nil, nil)

	t.Run("system admin can see problems from any namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authAdmin)
		defer conn.Release()

		// System admin should be able to get problems from both namespaces
		problem, err := s.GetProblem(ctx, problemA)
		if err != nil {
			t.Errorf("system admin should be able to get problem from namespace A: %v", err)
		} else if problem.ID != problemA {
			t.Errorf("expected problem %s, got %s", problemA, problem.ID)
		}

		problem, err = s.GetProblem(ctx, problemB)
		if err != nil {
			t.Errorf("system admin should be able to get problem from namespace B: %v", err)
		} else if problem.ID != problemB {
			t.Errorf("expected problem %s, got %s", problemB, problem.ID)
		}
	})

	// Create classes in each namespace for testing
	classA := uuid.New()
	classB := uuid.New()
	db.createClass(ctx, t, classA, nsA, "Class A", userA)
	db.createClass(ctx, t, classB, nsB, "Class B", userB)

	t.Run("system admin can see classes from any namespace", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authAdmin)
		defer conn.Release()

		// System admin should be able to get classes from both namespaces
		class, err := s.GetClass(ctx, classA)
		if err != nil {
			t.Errorf("system admin should be able to get class from namespace A: %v", err)
		} else if class.ID != classA {
			t.Errorf("expected class %s, got %s", classA, class.ID)
		}

		class, err = s.GetClass(ctx, classB)
		if err != nil {
			t.Errorf("system admin should be able to get class from namespace B: %v", err)
		} else if class.ID != classB {
			t.Errorf("expected class %s, got %s", classB, class.ID)
		}
	})
}

// =============================================================================
// Test: DeleteMembershipIfNotLast - calls actual Store method
// =============================================================================

func TestIntegration_DeleteMembershipIfNotLast(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructor1 := uuid.New()
	instructor2 := uuid.New()
	student1 := uuid.New()
	db.createUser(ctx, t, instructor1, "inst1@test.com", "instructor", nsID)
	db.createUser(ctx, t, instructor2, "inst2@test.com", "instructor", nsID)
	db.createUser(ctx, t, student1, "stu1@test.com", "student", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", instructor1)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN123")

	db.createMembership(ctx, t, instructor1, sectionID, "instructor")
	db.createMembership(ctx, t, instructor2, sectionID, "instructor")
	db.createMembership(ctx, t, student1, sectionID, "student")

	// Auth user for RLS context
	authUser := &auth.User{
		ID:          instructor1,
		Email:       "inst1@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("can remove one of two instructors", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteMembershipIfNotLast(ctx, sectionID, instructor2, "instructor")
		if err != nil {
			t.Fatalf("expected success, got: %v", err)
		}

		// Verify deleted using superuser connection
		var count int
		err = db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM section_memberships WHERE section_id = $1 AND user_id = $2",
			sectionID, instructor2).Scan(&count)
		if err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("instructor2 membership should be deleted")
		}
	})

	t.Run("cannot remove last instructor", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteMembershipIfNotLast(ctx, sectionID, instructor1, "instructor")
		if !errors.Is(err, ErrLastMember) {
			t.Errorf("expected ErrLastMember, got: %v", err)
		}
	})

	t.Run("cannot remove last student", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteMembershipIfNotLast(ctx, sectionID, student1, "student")
		if !errors.Is(err, ErrLastMember) {
			t.Errorf("expected ErrLastMember, got: %v", err)
		}
	})

	t.Run("nonexistent membership returns ErrNotFound", func(t *testing.T) {
		// Add a second student so the count check passes
		student2 := uuid.New()
		db.createUser(ctx, t, student2, "stu2@test.com", "student", nsID)
		db.createMembership(ctx, t, student2, sectionID, "student")

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		nonexistent := uuid.New()
		db.createUser(ctx, t, nonexistent, "ghost@test.com", "student", nsID)
		err := s.DeleteMembershipIfNotLast(ctx, sectionID, nonexistent, "student")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: GetUserByEmail - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetUserByEmail(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	userID := uuid.New()
	testEmail := fmt.Sprintf("findme-%s@test.com", nsID)
	db.createUser(ctx, t, userID, testEmail, "student", nsID)

	authUser := &auth.User{
		ID:          userID,
		Email:       testEmail,
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		u, err := s.GetUserByEmail(ctx, testEmail)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.ID != userID {
			t.Errorf("expected id %s, got %s", userID, u.ID)
		}
		if u.Email != testEmail {
			t.Errorf("expected email %s, got %s", testEmail, u.Email)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetUserByEmail(ctx, "nonexistent-"+nsID+"@test.com")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: UpdateUserAdmin - calls actual Store method with RLS
// =============================================================================

func TestIntegration_UpdateUserAdmin(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	userID := uuid.New()
	db.createUser(ctx, t, userID, "admin-target@test.com", "student", nsID)

	// RLS policy: only system-admin can update other users
	adminID := uuid.New()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authUser := &auth.User{
		ID:          adminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	t.Run("partial update email only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newEmail := "updated@test.com"
		u, err := s.UpdateUserAdmin(ctx, userID, UpdateUserAdminParams{Email: &newEmail})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.Email != newEmail {
			t.Errorf("expected email %s, got %s", newEmail, u.Email)
		}
		if u.Role != "student" {
			t.Errorf("role should be unchanged, got %s", u.Role)
		}
	})

	t.Run("partial update role only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newRole := "instructor"
		u, err := s.UpdateUserAdmin(ctx, userID, UpdateUserAdminParams{Role: &newRole})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.Role != newRole {
			t.Errorf("expected role %s, got %s", newRole, u.Role)
		}
		if u.Email != "updated@test.com" {
			t.Errorf("email should be unchanged, got %s", u.Email)
		}
	})

	t.Run("update all fields", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		email := "fully-updated@test.com"
		display := "Full Update"
		role := "namespace-admin"
		u, err := s.UpdateUserAdmin(ctx, userID, UpdateUserAdminParams{
			Email: &email, DisplayName: &display, Role: &role, NamespaceID: &nsID,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.Email != email || u.Role != role {
			t.Errorf("expected email=%s role=%s, got email=%s role=%s", email, role, u.Email, u.Role)
		}
		if u.DisplayName == nil || *u.DisplayName != display {
			t.Errorf("expected display_name=%s, got %v", display, u.DisplayName)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		email := "nope@test.com"
		_, err := s.UpdateUserAdmin(ctx, uuid.New(), UpdateUserAdminParams{Email: &email})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: DeleteUser - calls actual Store method with RLS
// =============================================================================

func TestIntegration_DeleteUser(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	userID := uuid.New()
	db.createUser(ctx, t, userID, "todelete@test.com", "student", nsID)

	// RLS policy: only system-admin can delete users
	adminID := uuid.New()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin-del@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authUser := &auth.User{
		ID:          adminID,
		Email:       "sysadmin-del@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	t.Run("delete existing user", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		if err := s.DeleteUser(ctx, userID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify using superuser connection
		var count int
		err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", userID).Scan(&count)
		if err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("user should be deleted")
		}
	})

	t.Run("delete nonexistent user", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteUser(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: CountUsersByRole - calls actual Store method with RLS
// =============================================================================

func TestIntegration_CountUsersByRole(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	u1 := uuid.New()
	u2 := uuid.New()
	u3 := uuid.New()
	db.createUser(ctx, t, u1, "s1@test.com", "student", nsID)
	db.createUser(ctx, t, u2, "s2@test.com", "student", nsID)
	db.createUser(ctx, t, u3, "i1@test.com", "instructor", nsID)

	authUser := &auth.User{
		ID:          u3,
		Email:       "i1@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("counts are correct", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		counts, err := s.CountUsersByRole(ctx, nsID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if counts["student"] != 2 {
			t.Errorf("expected 2 students, got %d", counts["student"])
		}
		if counts["instructor"] != 1 {
			t.Errorf("expected 1 instructor, got %d", counts["instructor"])
		}
	})

	t.Run("empty namespace", func(t *testing.T) {
		emptyNS := "ns-empty-" + uuid.New().String()
		db.createNamespace(ctx, t, emptyNS, "Empty")
		t.Cleanup(func() {
			_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", emptyNS)
		})

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		counts, err := s.CountUsersByRole(ctx, emptyNS)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(counts) != 0 {
			t.Errorf("expected empty map, got %v", counts)
		}
	})
}

// =============================================================================
// Test: ListClassInstructorNames - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListClassInstructorNames(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	inst1 := uuid.New()
	inst2 := uuid.New()
	student := uuid.New()
	db.createUserWithDisplayName(ctx, t, inst1, "inst1@test.com", "instructor", nsID, "Dr. Smith")
	db.createUser(ctx, t, inst2, "inst2@test.com", "instructor", nsID) // no display name, should use email
	db.createUser(ctx, t, student, "stu@test.com", "student", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", inst1)
	sec1 := uuid.New()
	sec2 := uuid.New()
	db.createSection(ctx, t, sec1, nsID, classID, "Section 1", "JOIN1")
	db.createSection(ctx, t, sec2, nsID, classID, "Section 2", "JOIN2")

	db.createMembership(ctx, t, inst1, sec1, "instructor")
	db.createMembership(ctx, t, inst2, sec2, "instructor")
	db.createMembership(ctx, t, inst1, sec2, "instructor") // inst1 in both sections
	db.createMembership(ctx, t, student, sec1, "student")

	authUser := &auth.User{
		ID:          inst1,
		Email:       "inst1@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("returns instructor id-name map", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		names, err := s.ListClassInstructorNames(ctx, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(names) != 2 {
			t.Fatalf("expected 2 instructor names, got %d: %v", len(names), names)
		}
		if names[inst1.String()] != "Dr. Smith" {
			t.Errorf("expected inst1 name 'Dr. Smith', got %q", names[inst1.String()])
		}
		if names[inst2.String()] != "inst2@test.com" {
			t.Errorf("expected inst2 name 'inst2@test.com', got %q", names[inst2.String()])
		}
	})

	t.Run("empty class", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		names, err := s.ListClassInstructorNames(ctx, uuid.New())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(names) != 0 {
			t.Errorf("expected no names, got %v", names)
		}
	})
}

// =============================================================================
// Test: ListMySections - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListMySections(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	userID := uuid.New()
	otherUser := uuid.New()
	db.createUser(ctx, t, userID, "me@test.com", "student", nsID)
	db.createUser(ctx, t, otherUser, "other@test.com", "student", nsID)

	class1 := uuid.New()
	class2 := uuid.New()
	db.createClass(ctx, t, class1, nsID, "CS101", userID)
	db.createClass(ctx, t, class2, nsID, "CS201", userID)

	sec1 := uuid.New()
	sec2 := uuid.New()
	sec3 := uuid.New()
	db.createSection(ctx, t, sec1, nsID, class1, "CS101-A", "CODE1")
	db.createSection(ctx, t, sec2, nsID, class2, "CS201-A", "CODE2")
	db.createSection(ctx, t, sec3, nsID, class1, "CS101-B", "CODE3")

	db.createMembership(ctx, t, userID, sec1, "student")
	db.createMembership(ctx, t, userID, sec2, "student")
	db.createMembership(ctx, t, otherUser, sec3, "student") // other user, not me

	authUser := &auth.User{
		ID:          userID,
		Email:       "me@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("returns my sections with class names", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListMySections(ctx, userID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("expected 2 sections, got %d", len(results))
		}
		if results[0].ClassName != "CS101" {
			t.Errorf("expected class name CS101, got %s", results[0].ClassName)
		}
		if results[1].ClassName != "CS201" {
			t.Errorf("expected class name CS201, got %s", results[1].ClassName)
		}
	})

	t.Run("user with no sections", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListMySections(ctx, uuid.New())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 sections, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: UpdateSectionJoinCode - calls actual Store method with RLS
// =============================================================================

func TestIntegration_UpdateSectionJoinCode(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "inst@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", instructorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "OLD_CODE")
	// RLS requires instructor to be a section instructor to update sections
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")

	authUser := &auth.User{
		ID:          instructorID,
		Email:       "inst@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("updates join code", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newCode := "NEW_CODE-" + uuid.New().String()[:8]
		sec, err := s.UpdateSectionJoinCode(ctx, sectionID, newCode)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.JoinCode != newCode {
			t.Errorf("expected join_code %s, got %s", newCode, sec.JoinCode)
		}
		if sec.ID != sectionID {
			t.Errorf("expected section %s, got %s", sectionID, sec.ID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.UpdateSectionJoinCode(ctx, uuid.New(), "WHATEVER-"+uuid.New().String()[:8])
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListMembersByRole - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListMembersByRole(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	inst := uuid.New()
	stu1 := uuid.New()
	stu2 := uuid.New()
	db.createUser(ctx, t, inst, "inst@test.com", "instructor", nsID)
	db.createUser(ctx, t, stu1, "stu1@test.com", "student", nsID)
	db.createUser(ctx, t, stu2, "stu2@test.com", "student", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", inst)
	secID := uuid.New()
	db.createSection(ctx, t, secID, nsID, classID, "Section A", "CODE1")

	db.createMembership(ctx, t, inst, secID, "instructor")
	db.createMembership(ctx, t, stu1, secID, "student")
	db.createMembership(ctx, t, stu2, secID, "student")

	authUser := &auth.User{
		ID:          inst,
		Email:       "inst@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("students only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		members, err := s.ListMembersByRole(ctx, secID, "student")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(members) != 2 {
			t.Errorf("expected 2 students, got %d", len(members))
		}
		for _, m := range members {
			if m.Role != "student" {
				t.Errorf("expected role student, got %s", m.Role)
			}
		}
	})

	t.Run("instructors only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		members, err := s.ListMembersByRole(ctx, secID, "instructor")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(members) != 1 {
			t.Errorf("expected 1 instructor, got %d", len(members))
		}
	})

	t.Run("empty section", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		members, err := s.ListMembersByRole(ctx, uuid.New(), "student")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(members) != 0 {
			t.Errorf("expected 0 members, got %d", len(members))
		}
	})
}

// =============================================================================
// UpsertUser Tests - calls actual Store method (superuser, no RLS needed)
// =============================================================================

func TestIntegration_UpsertUser_Insert(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	db.cleanup(ctx, t)

	s := New(db.pool)

	user, err := s.UpsertUser(ctx, CreateUserParams{
		ExternalID: "firebase-uid-bootstrap",
		Email:      "admin@example.com",
		Role:       "system-admin",
	})
	if err != nil {
		t.Fatalf("UpsertUser insert: %v", err)
	}

	if user.Email != "admin@example.com" {
		t.Errorf("email = %q, want %q", user.Email, "admin@example.com")
	}
	if user.Role != "system-admin" {
		t.Errorf("role = %q, want %q", user.Role, "system-admin")
	}
	if user.NamespaceID != nil {
		t.Errorf("namespace_id = %v, want nil", user.NamespaceID)
	}
	if user.ExternalID == nil || *user.ExternalID != "firebase-uid-bootstrap" {
		t.Errorf("external_id = %v, want %q", user.ExternalID, "firebase-uid-bootstrap")
	}
}

func TestIntegration_UpsertUser_Update(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	db.cleanup(ctx, t)

	s := New(db.pool)

	// Insert first as system-admin (no namespace required)
	original, err := s.UpsertUser(ctx, CreateUserParams{
		ExternalID: "firebase-uid-upsert",
		Email:      "old@example.com",
		Role:       "system-admin",
	})
	if err != nil {
		t.Fatalf("UpsertUser first call: %v", err)
	}

	// Upsert with same external_id, different email
	updated, err := s.UpsertUser(ctx, CreateUserParams{
		ExternalID: "firebase-uid-upsert",
		Email:      "new@example.com",
		Role:       "system-admin",
	})
	if err != nil {
		t.Fatalf("UpsertUser second call: %v", err)
	}

	// Same row (same ID)
	if updated.ID != original.ID {
		t.Errorf("expected same ID %s, got %s", original.ID, updated.ID)
	}
	// Fields updated
	if updated.Email != "new@example.com" {
		t.Errorf("email = %q, want %q", updated.Email, "new@example.com")
	}
	if updated.Role != "system-admin" {
		t.Errorf("role = %q, want %q", updated.Role, "system-admin")
	}
	// updated_at should be >= original
	if updated.UpdatedAt.Before(original.CreatedAt) {
		t.Error("updated_at should be >= created_at")
	}

	// Verify only one row exists
	var count int
	err = db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE external_id = $1", "firebase-uid-upsert").Scan(&count)
	if err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 row, got %d", count)
	}
}

// =============================================================================
// Test: ListMyClasses - scoped to classes user created or is co-instructor on
// =============================================================================

func TestIntegration_ListMyClasses(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	// Create two instructors in the same namespace
	instA := uuid.New()
	instB := uuid.New()
	db.createUser(ctx, t, instA, "instA@test.com", "instructor", nsID)
	db.createUser(ctx, t, instB, "instB@test.com", "instructor", nsID)

	// Instructor A creates classA, instructor B creates classB
	classA := uuid.New()
	classB := uuid.New()
	db.createClass(ctx, t, classA, nsID, "Class A", instA)
	db.createClass(ctx, t, classB, nsID, "Class B", instB)

	// Each class gets a section
	secA := uuid.New()
	secB := uuid.New()
	db.createSection(ctx, t, secA, nsID, classA, "Section A", "CODEA")
	db.createSection(ctx, t, secB, nsID, classB, "Section B", "CODEB")

	// Each instructor is a member of their own section
	db.createMembership(ctx, t, instA, secA, "instructor")
	db.createMembership(ctx, t, instB, secB, "instructor")

	// Add instructor A as co-instructor on instructor B's section
	db.createMembership(ctx, t, instA, secB, "instructor")

	authUserA := &auth.User{
		ID:          instA,
		Email:       "instA@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	authUserB := &auth.User{
		ID:          instB,
		Email:       "instB@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("instructor A sees both classes (created one + co-instructor on other)", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		classes, err := s.ListMyClasses(ctx, instA)
		if err != nil {
			t.Fatalf("ListMyClasses: %v", err)
		}
		if len(classes) != 2 {
			t.Fatalf("expected 2 classes, got %d", len(classes))
		}
		ids := map[uuid.UUID]bool{}
		for _, c := range classes {
			ids[c.ID] = true
		}
		if !ids[classA] {
			t.Errorf("expected classA %s in results", classA)
		}
		if !ids[classB] {
			t.Errorf("expected classB %s in results", classB)
		}
	})

	t.Run("instructor B sees only own class", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUserB)
		defer conn.Release()

		classes, err := s.ListMyClasses(ctx, instB)
		if err != nil {
			t.Fatalf("ListMyClasses: %v", err)
		}
		if len(classes) != 1 {
			t.Fatalf("expected 1 class, got %d", len(classes))
		}
		if classes[0].ID != classB {
			t.Errorf("expected classB %s, got %s", classB, classes[0].ID)
		}
	})

	t.Run("user with no classes gets empty result", func(t *testing.T) {
		otherUser := uuid.New()
		db.createUser(ctx, t, otherUser, "other@test.com", "instructor", nsID)
		authOther := &auth.User{
			ID:          otherUser,
			Email:       "other@test.com",
			NamespaceID: nsID,
			Role:        auth.RoleInstructor,
		}

		s, conn := db.storeWithRLS(ctx, t, authOther)
		defer conn.Release()

		classes, err := s.ListMyClasses(ctx, otherUser)
		if err != nil {
			t.Fatalf("ListMyClasses: %v", err)
		}
		if len(classes) != 0 {
			t.Errorf("expected 0 classes, got %d", len(classes))
		}
	})

	t.Run("no duplicates when creator is also instructor member", func(t *testing.T) {
		// instA created classA AND is a member of secA as instructor
		// should still only see classA once (plus classB)
		s, conn := db.storeWithRLS(ctx, t, authUserA)
		defer conn.Release()

		classes, err := s.ListMyClasses(ctx, instA)
		if err != nil {
			t.Fatalf("ListMyClasses: %v", err)
		}
		// Count occurrences of classA
		count := 0
		for _, c := range classes {
			if c.ID == classA {
				count++
			}
		}
		if count != 1 {
			t.Errorf("classA should appear exactly once, got %d", count)
		}
	})
}

// Ensure json import is used (for Problem.TestCases scanning).
var _ = json.RawMessage{}
var _ = pgx.ErrNoRows
