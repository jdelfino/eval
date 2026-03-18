// Integration tests for migration 020: consolidate execution_settings into test_cases.
//
// These tests insert pre-migration data at schema version 19 (execution_settings
// column exists), run the migration, and verify the backfill SQL transformed the
// data correctly. Every assertion exercises the actual migration SQL rather than
// simulated post-migration data.
//
// Run with:
//
//	DATABASE_URL="postgresql://eval:eval_local_password@localhost:5432/eval?sslmode=disable" \
//	  go test -v -race -count=1 ./internal/store/... -run TestIntegration_Migration020

package store

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// setupMigration020 creates a temp DB at v19, inserts a namespace and instructor
// user, then returns the db and the IDs needed by tests.
func setupMigration020(t *testing.T) (db *testutil.MigrationTestDB, nsID, authorID, studentID, classID, sectionID string) {
	t.Helper()
	db = testutil.SetupMigrationTestDB(t, 19)

	nsID = "ns-020-" + uuid.New().String()[:8]
	db.CreateNamespace(t, nsID, "Migration 020 Test NS")

	authorID = uuid.New().String()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, $2, 'instructor', $3)`,
		authorID, fmt.Sprintf("author-%s@test.com", authorID[:8]), nsID)

	studentID = uuid.New().String()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, $2, 'student', $3)`,
		studentID, fmt.Sprintf("student-%s@test.com", studentID[:8]), nsID)

	classID = uuid.New().String()
	db.Exec(t, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, nsID, authorID)

	sectionID = uuid.New().String()
	db.Exec(t, `INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, nsID, classID, "TST-"+uuid.New().String()[:6])

	return db, nsID, authorID, studentID, classID, sectionID
}

// TestIntegration_Migration020_Backfill inserts pre-migration fixture rows at v19,
// runs migration 020, and verifies the backfill SQL transformed them correctly.
func TestIntegration_Migration020_Backfill(t *testing.T) {
	db, nsID, authorID, studentID, _, sectionID := setupMigration020(t)

	// -------------------------------------------------------------------------
	// Insert pre-migration fixture rows at v19
	// -------------------------------------------------------------------------

	// Problem 1: execution_settings with stdin and random_seed.
	prob1 := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
		VALUES ($1, $2, 'Prob stdin+seed', $3, '{"stdin":"hello world","random_seed":42}')`,
		prob1, nsID, authorID)

	// Problem 2: execution_settings with empty stdin and attached_files.
	prob2 := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
		VALUES ($1, $2, 'Prob attached_files', $3, '{"stdin":"","attached_files":[{"name":"data.csv","content":"a,b"}]}')`,
		prob2, nsID, authorID)

	// Problem 3: execution_settings = '{}' (empty object — no meaningful data).
	prob3 := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
		VALUES ($1, $2, 'Prob empty settings', $3, '{}')`,
		prob3, nsID, authorID)

	// Problem 4: execution_settings = NULL.
	prob4 := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
		VALUES ($1, $2, 'Prob null settings', $3, NULL)`,
		prob4, nsID, authorID)

	// Problem 5: no execution_settings column mentioned (uses DB default NULL).
	prob5 := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, 'Prob no settings', $3)`,
		prob5, nsID, authorID)

	// Student work with execution_settings = {stdin: "student input"}.
	sw1 := uuid.New().String()
	db.Exec(t, `INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, execution_settings)
		VALUES ($1, $2, $3, $4, $5, '', '{"stdin":"student input"}')`,
		sw1, nsID, studentID, prob1, sectionID)

	// Session with featured_execution_settings.
	sess1 := uuid.New().String()
	db.Exec(t, `INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id, featured_execution_settings)
		VALUES ($1, $2, $3, 'Test Section', '{"id":"test","title":"test"}', $4, '[{"name":"Case 1"}]')`,
		sess1, nsID, sectionID, authorID)

	// -------------------------------------------------------------------------
	// Run migration 020
	// -------------------------------------------------------------------------
	db.MigrateTo(t, 20)

	// -------------------------------------------------------------------------
	// Assert backfill results
	// -------------------------------------------------------------------------

	// Problem 1: stdin + random_seed → test case with input="hello world", random_seed=42.
	t.Run("problem with stdin and random_seed", func(t *testing.T) {
		var raw []byte
		db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, prob1).Scan(&raw) //nolint:errcheck
		var cases []map[string]interface{}
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("want 1 test case, got %d: %s", len(cases), raw)
		}
		tc := cases[0]
		if tc["name"] != "Default" {
			t.Errorf("name: want %q got %v", "Default", tc["name"])
		}
		if tc["input"] != "hello world" {
			t.Errorf("input: want %q got %v", "hello world", tc["input"])
		}
		if tc["match_type"] != "exact" {
			t.Errorf("match_type: want %q got %v", "exact", tc["match_type"])
		}
		// random_seed 42 is stored as a JSON number; json.Unmarshal gives float64.
		if seed, ok := tc["random_seed"].(float64); !ok || seed != 42 {
			t.Errorf("random_seed: want 42 got %v", tc["random_seed"])
		}
	})

	// Problem 2: attached_files present, stdin="" → test case preserves attached_files.
	t.Run("problem with attached_files", func(t *testing.T) {
		var raw []byte
		db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, prob2).Scan(&raw) //nolint:errcheck
		var cases []map[string]interface{}
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("want 1 test case, got %d: %s", len(cases), raw)
		}
		tc := cases[0]
		if tc["name"] != "Default" {
			t.Errorf("name: want %q got %v", "Default", tc["name"])
		}
		if tc["input"] != "" {
			t.Errorf("input: want %q got %v", "", tc["input"])
		}
		files, ok := tc["attached_files"].([]interface{})
		if !ok || len(files) != 1 {
			t.Fatalf("attached_files: want 1 file, got %v", tc["attached_files"])
		}
		fileMap, ok := files[0].(map[string]interface{})
		if !ok {
			t.Fatalf("attached_files[0]: want map, got %T", files[0])
		}
		if fileMap["name"] != "data.csv" {
			t.Errorf("attached_files[0].name: want %q got %v", "data.csv", fileMap["name"])
		}
	})

	// Problem 3: empty object → empty test_cases array.
	t.Run("problem with empty execution_settings gets empty test_cases", func(t *testing.T) {
		assertEmptyTestCases(t, db, "problems", "id", prob3)
	})

	// Problem 4: NULL execution_settings → empty test_cases array.
	t.Run("problem with null execution_settings gets empty test_cases", func(t *testing.T) {
		assertEmptyTestCases(t, db, "problems", "id", prob4)
	})

	// Problem 5: no execution_settings → empty test_cases array.
	t.Run("problem with no execution_settings gets empty test_cases", func(t *testing.T) {
		assertEmptyTestCases(t, db, "problems", "id", prob5)
	})

	// Student work: stdin backfill.
	t.Run("student_work with stdin", func(t *testing.T) {
		var raw []byte
		db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, sw1).Scan(&raw) //nolint:errcheck
		var cases []map[string]interface{}
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("want 1 test case, got %d: %s", len(cases), raw)
		}
		if cases[0]["input"] != "student input" {
			t.Errorf("input: want %q got %v", "student input", cases[0]["input"])
		}
	})

	// Session: featured_execution_settings renamed to featured_test_cases.
	t.Run("session featured_execution_settings renamed to featured_test_cases", func(t *testing.T) {
		var raw []byte
		db.QueryRow(t, `SELECT featured_test_cases FROM sessions WHERE id = $1`, sess1).Scan(&raw) //nolint:errcheck
		if len(raw) == 0 {
			t.Fatal("featured_test_cases is null/empty after migration")
		}
		// Old column must no longer exist.
		var colExists bool
		if err := db.QueryRow(t, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'sessions' AND column_name = 'featured_execution_settings'
			)`).Scan(&colExists); err != nil {
			t.Fatalf("check column: %v", err)
		}
		if colExists {
			t.Error("sessions.featured_execution_settings should have been renamed")
		}
	})

	// Schema: execution_settings columns must be gone.
	t.Run("problems.execution_settings column removed", func(t *testing.T) {
		assertColumnAbsent(t, db, "problems", "execution_settings")
	})

	t.Run("student_work.execution_settings column removed", func(t *testing.T) {
		assertColumnAbsent(t, db, "student_work", "execution_settings")
	})

	// Schema: test_cases must be NOT NULL.
	t.Run("problems.test_cases is NOT NULL", func(t *testing.T) {
		assertColumnNotNull(t, db, "problems", "test_cases")
	})

	t.Run("student_work.test_cases is NOT NULL", func(t *testing.T) {
		assertColumnNotNull(t, db, "student_work", "test_cases")
	})
}

// TestIntegration_Migration020_DownMigration verifies the down migration restores
// the pre-020 schema: execution_settings columns come back, featured_execution_settings
// is restored, and test_cases loses its NOT NULL constraint.
func TestIntegration_Migration020_DownMigration(t *testing.T) {
	db, nsID, authorID, _, _, _ := setupMigration020(t)

	// Insert a problem with execution_settings at v19.
	probID := uuid.New().String()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, execution_settings)
		VALUES ($1, $2, 'Down test problem', $3, '{"stdin":"rollback input","random_seed":7}')`,
		probID, nsID, authorID)

	// Run up, then down.
	db.MigrateTo(t, 20)
	db.MigrateTo(t, 19)

	// execution_settings column must exist again.
	t.Run("problems.execution_settings restored", func(t *testing.T) {
		assertColumnPresent(t, db, "problems", "execution_settings")
	})

	t.Run("student_work.execution_settings restored", func(t *testing.T) {
		assertColumnPresent(t, db, "student_work", "execution_settings")
	})

	// sessions.featured_execution_settings must exist again.
	t.Run("sessions.featured_execution_settings restored", func(t *testing.T) {
		assertColumnPresent(t, db, "sessions", "featured_execution_settings")
	})

	// featured_test_cases must be gone.
	t.Run("sessions.featured_test_cases removed on down", func(t *testing.T) {
		assertColumnAbsent(t, db, "sessions", "featured_test_cases")
	})

	// The problem whose first test case was named "Default" should have
	// execution_settings reconstructed from the test case.
	t.Run("problems.execution_settings reconstructed from Default test case", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT execution_settings FROM problems WHERE id = $1`, probID).Scan(&raw); err != nil {
			t.Fatalf("query execution_settings: %v", err)
		}
		var es map[string]interface{}
		if err := json.Unmarshal(raw, &es); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if es["stdin"] != "rollback input" {
			t.Errorf("stdin: want %q got %v", "rollback input", es["stdin"])
		}
		if seed, ok := es["random_seed"].(float64); !ok || seed != 7 {
			t.Errorf("random_seed: want 7 got %v", es["random_seed"])
		}
	})
}

// -------------------------------------------------------------------------
// Assertion helpers
// -------------------------------------------------------------------------

// assertEmptyTestCases verifies that a row in table has an empty test_cases array.
func assertEmptyTestCases(t *testing.T, db *testutil.MigrationTestDB, table, pkCol, id string) {
	t.Helper()
	var raw []byte
	if err := db.QueryRow(t, fmt.Sprintf(`SELECT test_cases FROM %s WHERE %s = $1`, table, pkCol), id).Scan(&raw); err != nil {
		t.Fatalf("query test_cases: %v", err)
	}
	var cases []map[string]interface{}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(cases) != 0 {
		t.Fatalf("want empty test_cases array, got %d cases: %s", len(cases), raw)
	}
}

// assertColumnAbsent fails if the column exists in the given table.
func assertColumnAbsent(t *testing.T, db *testutil.MigrationTestDB, table, column string) {
	t.Helper()
	var exists bool
	if err := db.QueryRow(t, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = $1 AND column_name = $2
		)`, table, column).Scan(&exists); err != nil {
		t.Fatalf("check column presence: %v", err)
	}
	if exists {
		t.Errorf("%s.%s should not exist", table, column)
	}
}

// assertColumnPresent fails if the column does not exist in the given table.
func assertColumnPresent(t *testing.T, db *testutil.MigrationTestDB, table, column string) {
	t.Helper()
	var exists bool
	if err := db.QueryRow(t, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = $1 AND column_name = $2
		)`, table, column).Scan(&exists); err != nil {
		t.Fatalf("check column presence: %v", err)
	}
	if !exists {
		t.Errorf("%s.%s should exist", table, column)
	}
}

// assertColumnNotNull fails if the column is nullable.
func assertColumnNotNull(t *testing.T, db *testutil.MigrationTestDB, table, column string) {
	t.Helper()
	var isNullable string
	if err := db.QueryRow(t, `
		SELECT is_nullable FROM information_schema.columns
		WHERE table_name = $1 AND column_name = $2`, table, column).Scan(&isNullable); err != nil {
		t.Fatalf("check nullable: %v", err)
	}
	if isNullable != "NO" {
		t.Errorf("%s.%s should be NOT NULL, got is_nullable=%q", table, column, isNullable)
	}
}
