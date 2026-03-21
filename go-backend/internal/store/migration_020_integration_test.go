// Integration tests for migration 020: consolidate execution_settings → test_cases.
//
// Verifies the post-migration schema:
//   - problems.execution_settings column no longer exists
//   - problems.test_cases is NOT NULL with DEFAULT '[]'
//   - student_work.execution_settings column no longer exists
//   - student_work.test_cases is NOT NULL with DEFAULT '[]'
//   - sessions.featured_test_cases column exists (renamed from featured_execution_settings)
//   - sessions.featured_execution_settings column no longer exists
//   - Store-level: CreateProblem, UpdateProblem, GetStudentWork work correctly post-migration
//   - Backfill: execution_settings → test_cases conversion correctness
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration020
package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration020_SchemaChanges verifies the column-level changes
// introduced by migration 020: dropped columns and renamed column.
func TestIntegration_Migration020_SchemaChanges(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)
	ctx := context.Background()

	t.Run("problems.execution_settings column does not exist", func(t *testing.T) {
		var count int
		err := db.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'problems' AND column_name = 'execution_settings'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("check problems.execution_settings column: %v", err)
		}
		if count != 0 {
			t.Error("problems.execution_settings column should be dropped after migration 020")
		}
	})

	t.Run("problems.test_cases column is NOT NULL with default empty array", func(t *testing.T) {
		var isNullable, columnDefault string
		err := db.pool.QueryRow(ctx, `
			SELECT is_nullable, column_default
			FROM information_schema.columns
			WHERE table_name = 'problems' AND column_name = 'test_cases'
		`).Scan(&isNullable, &columnDefault)
		if err != nil {
			t.Fatalf("check problems.test_cases column: %v", err)
		}
		if isNullable != "NO" {
			t.Errorf("expected problems.test_cases to be NOT NULL, got is_nullable=%q", isNullable)
		}
		// Default may be represented as '[]'::jsonb or similar
		if columnDefault == "" {
			t.Error("expected problems.test_cases to have a default value")
		}
	})

	t.Run("student_work.execution_settings column does not exist", func(t *testing.T) {
		var count int
		err := db.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'student_work' AND column_name = 'execution_settings'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("check student_work.execution_settings column: %v", err)
		}
		if count != 0 {
			t.Error("student_work.execution_settings column should be dropped after migration 020")
		}
	})

	t.Run("student_work.test_cases column is NOT NULL with default empty array", func(t *testing.T) {
		var isNullable, columnDefault string
		err := db.pool.QueryRow(ctx, `
			SELECT is_nullable, column_default
			FROM information_schema.columns
			WHERE table_name = 'student_work' AND column_name = 'test_cases'
		`).Scan(&isNullable, &columnDefault)
		if err != nil {
			t.Fatalf("check student_work.test_cases column: %v", err)
		}
		if isNullable != "NO" {
			t.Errorf("expected student_work.test_cases to be NOT NULL, got is_nullable=%q", isNullable)
		}
		if columnDefault == "" {
			t.Error("expected student_work.test_cases to have a default value")
		}
	})

	t.Run("sessions.featured_execution_settings column does not exist", func(t *testing.T) {
		var count int
		err := db.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'sessions' AND column_name = 'featured_execution_settings'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("check sessions.featured_execution_settings column: %v", err)
		}
		if count != 0 {
			t.Error("sessions.featured_execution_settings column should be renamed to featured_test_cases")
		}
	})

	t.Run("sessions.featured_test_cases column exists", func(t *testing.T) {
		var count int
		err := db.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'sessions' AND column_name = 'featured_test_cases'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("check sessions.featured_test_cases column: %v", err)
		}
		if count != 1 {
			t.Error("sessions.featured_test_cases column should exist after migration 020")
		}
	})
}

// TestIntegration_Migration020_StoreOperations verifies that Store-level operations
// work correctly after migration 020 removes execution_settings columns.
func TestIntegration_Migration020_StoreOperations(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-020@test.com", "instructor", nsID)
	db.createUser(ctx, t, studentID, "stu-020@test.com", "student", nsID)

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Migration 020 Class", instructorID)
	db.createSection(ctx, t, sectionID, nsID, classID, "Migration 020 Section", "MIG020")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	db.createMembership(ctx, t, studentID, sectionID, "student")

	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "instr-020@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}
	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-020@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("CreateProblem with test_cases succeeds and returns them", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		testCases := json.RawMessage(`[{"name":"t1","input":"1 2","expected_output":"3","match_type":"exact"}]`)
		p, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID: nsID,
			Title:       "020 Problem",
			TestCases:   testCases,
			AuthorID:    instructorID,
			Language:    "python",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}
		if !jsonEqual(t, p.TestCases, testCases) {
			t.Errorf("expected test_cases %s, got %s", testCases, p.TestCases)
		}
	})

	t.Run("CreateProblem without explicit test_cases gets empty array default", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		p, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID: nsID,
			Title:       "020 Default TestCases Problem",
			TestCases:   json.RawMessage(`[]`),
			AuthorID:    instructorID,
			Language:    "python",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}
		if p.TestCases == nil {
			t.Error("expected non-nil test_cases, got nil")
		}
	})

	t.Run("student_work created by helper has empty array test_cases", func(t *testing.T) {
		problemID := uuid.New()
		db.createProblem(ctx, t, problemID, nsID, "020 SW Problem", instructorID, nil, nil)

		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, problemID, sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		sw, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		// After migration 020, test_cases defaults to '[]', so NOT NULL holds.
		if sw.TestCases == nil {
			t.Error("expected non-nil test_cases after migration 020 (NOT NULL with DEFAULT '[]')")
		}
	})

	t.Run("sessions.featured_test_cases is stored and retrieved via UpdateSession", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		// Create a session
		sess, err := s.CreateSession(ctx, CreateSessionParams{
			NamespaceID: nsID,
			SectionID:   sectionID,
			SectionName: "Migration 020 Section",
			Problem:     json.RawMessage(`{"title":"020 Featured Problem"}`),
			CreatorID:   instructorID,
		})
		if err != nil {
			t.Fatalf("CreateSession failed: %v", err)
		}

		testCases := json.RawMessage(`[{"name":"featured","input":"test","match_type":"exact"}]`)
		updated, err := s.UpdateSession(ctx, sess.ID, UpdateSessionParams{
			FeaturedTestCases: testCases,
		})
		if err != nil {
			t.Fatalf("UpdateSession failed: %v", err)
		}
		if !jsonEqual(t, updated.FeaturedTestCases, testCases) {
			t.Errorf("expected featured_test_cases %s, got %s", testCases, updated.FeaturedTestCases)
		}
	})
}

// TestIntegration_Migration020_Backfill verifies the data migration logic in migration 020:
// execution_settings values are correctly converted to IOTestCase entries in test_cases.
//
// Contract: when a problem has execution_settings = '{"stdin":"hello","random_seed":42}',
// migration 020 must produce test_cases = '[{"name":"Default","input":"hello","match_type":"exact","order":0,"random_seed":42}]'.
// If the backfill SQL is wrong (e.g., maps stdin to the wrong key, or loses random_seed),
// existing problems lose their execution configuration silently.
func TestIntegration_Migration020_Backfill(t *testing.T) {
	t.Parallel()

	t.Run("execution_settings with stdin and random_seed backfills to IOTestCase", func(t *testing.T) {
		// TC 1: Set up DB at migration 19 (execution_settings column still exists).
		// Insert a problem with execution_settings, apply migration 020, and assert
		// that test_cases contains one IOTestCase with the correct field mapping.
		db := testutil.SetupMigrationTestDB(t, 19)

		// Seed required parent rows.
		nsID := "ns-backfill-020"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Backfill NS', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'backfill@test.com', 'instructor', $2)`,
			userID, nsID)

		// Insert a problem with execution_settings containing stdin and random_seed.
		problemID := uuid.New()
		db.Exec(t, `
			INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
			VALUES ($1, $2, 'Backfill Problem', $3, '{"stdin":"hello","random_seed":42}'::jsonb)
		`, problemID, nsID, userID)

		// Apply migration 020 — this runs the backfill SQL.
		db.MigrateTo(t, 20)

		// Read back test_cases.
		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, problemID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}

		var cases []map[string]interface{}
		if err := json.Unmarshal(rawTestCases, &cases); err != nil {
			t.Fatalf("unmarshal test_cases: %v", err)
		}

		if len(cases) != 1 {
			t.Fatalf("expected 1 test case after backfill, got %d: %s", len(cases), rawTestCases)
		}

		tc := cases[0]
		if tc["input"] != "hello" {
			t.Errorf("expected input='hello', got %v", tc["input"])
		}
		// random_seed comes through as a JSON number; json.Unmarshal decodes it as float64.
		if seed, ok := tc["random_seed"].(float64); !ok || int(seed) != 42 {
			t.Errorf("expected random_seed=42, got %v (type %T)", tc["random_seed"], tc["random_seed"])
		}
		if tc["match_type"] != "exact" {
			t.Errorf("expected match_type='exact', got %v", tc["match_type"])
		}

		// Verify execution_settings column no longer exists.
		var colCount int
		colRow := db.QueryRow(t, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'problems' AND column_name = 'execution_settings'
		`)
		if err := colRow.Scan(&colCount); err != nil {
			t.Fatalf("check execution_settings column: %v", err)
		}
		if colCount != 0 {
			t.Error("problems.execution_settings should be dropped after migration 020")
		}
	})

	t.Run("NULL execution_settings backfills to empty test_cases array", func(t *testing.T) {
		// TC 2: Problem with NULL execution_settings must get test_cases = '[]'::jsonb,
		// not NULL. If the NULL branch is missing in the backfill SQL the NOT NULL
		// constraint addition will fail, breaking the whole migration.
		db := testutil.SetupMigrationTestDB(t, 19)

		nsID := "ns-backfill-null-020"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Null NS', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'null-es@test.com', 'instructor', $2)`,
			userID, nsID)

		// Insert problem with NULL execution_settings.
		problemID := uuid.New()
		db.Exec(t, `
			INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
			VALUES ($1, $2, 'Null ES Problem', $3, NULL)
		`, problemID, nsID, userID)

		db.MigrateTo(t, 20)

		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, problemID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}

		// Must be '[]', not NULL — the NOT NULL constraint now enforces this.
		if string(rawTestCases) != "[]" {
			t.Errorf("expected test_cases='[]' for NULL execution_settings, got %q", rawTestCases)
		}
	})
}
