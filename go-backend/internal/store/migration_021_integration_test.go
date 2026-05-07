// Integration tests for migration 021: backfill kind='io' into IOTestCase JSONB arrays.
//
// Verifies:
//   - problems.test_cases JSONB array elements gain kind='io' after up migration
//   - student_work.test_cases JSONB array elements gain kind='io' after up migration
//   - down migration strips kind from all elements
//   - elements already lacking kind get it added
//   - empty arrays are unaffected
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration021
package store

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration021_Backfill verifies that migration 021 adds kind='io' to all
// existing JSONB test_case array elements in both problems and student_work.
//
// Contract: every legacy IOTestCase row (without kind) must gain "kind":"io" after up.
// Catches: missing array element traversal in the JSONB UPDATE.
func TestIntegration_Migration021_Backfill(t *testing.T) {
	t.Parallel()

	t.Run("problems.test_cases elements get kind=io", func(t *testing.T) {
		db := testutil.SetupMigrationTestDB(t, 20)

		nsID := "ns-mig021-prob"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig021 NS Prob', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021p@test.com', 'instructor', $2)`,
			userID, nsID)

		// Insert a problem with two test_cases lacking kind.
		problemID := uuid.New()
		db.Exec(t, `
			INSERT INTO problems (id, namespace_id, title, author_id, test_cases)
			VALUES ($1, $2, 'Mig021 Problem', $3,
			  '[{"name":"t1","input":"a","match_type":"exact","order":0},{"name":"t2","input":"b","match_type":"normalized","order":1}]'::jsonb)
		`, problemID, nsID, userID)

		// Apply migration 021.
		db.MigrateTo(t, 21)

		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, problemID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}

		var cases []map[string]interface{}
		if err := json.Unmarshal(rawTestCases, &cases); err != nil {
			t.Fatalf("unmarshal test_cases: %v", err)
		}

		if len(cases) != 2 {
			t.Fatalf("expected 2 test cases, got %d: %s", len(cases), rawTestCases)
		}
		for i, tc := range cases {
			if tc["kind"] != "io" {
				t.Errorf("cases[%d].kind: got %v, want 'io'", i, tc["kind"])
			}
		}
	})

	t.Run("student_work.test_cases elements get kind=io", func(t *testing.T) {
		db := testutil.SetupMigrationTestDB(t, 20)

		nsID := "ns-mig021-sw"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig021 NS SW', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021sw@test.com', 'instructor', $2)`,
			userID, nsID)
		studentID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021stu@test.com', 'student', $2)`,
			studentID, nsID)

		classID := uuid.New()
		db.Exec(t, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Class021', $3)`,
			classID, nsID, userID)
		sectionID := uuid.New()
		db.Exec(t, `INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Sec021', 'join021')`,
			sectionID, nsID, classID)
		problemID := uuid.New()
		db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'Prob021', $3, '[]'::jsonb)`,
			problemID, nsID, userID)
		workID := uuid.New()
		db.Exec(t, `
			INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
			VALUES ($1, $2, $3, $4, $5, '', '[{"name":"sw-case","input":"stdin","match_type":"exact","order":0}]'::jsonb)
		`, workID, nsID, studentID, problemID, sectionID)

		db.MigrateTo(t, 21)

		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, workID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}

		var cases []map[string]interface{}
		if err := json.Unmarshal(rawTestCases, &cases); err != nil {
			t.Fatalf("unmarshal test_cases: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("expected 1 test case, got %d: %s", len(cases), rawTestCases)
		}
		if cases[0]["kind"] != "io" {
			t.Errorf("cases[0].kind: got %v, want 'io'", cases[0]["kind"])
		}
	})

	t.Run("empty test_cases arrays are unaffected", func(t *testing.T) {
		db := testutil.SetupMigrationTestDB(t, 20)

		nsID := "ns-mig021-empty"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig021 Empty NS', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021empty@test.com', 'instructor', $2)`,
			userID, nsID)
		problemID := uuid.New()
		db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'Empty Prob', $3, '[]'::jsonb)`,
			problemID, nsID, userID)

		db.MigrateTo(t, 21)

		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, problemID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}
		if string(rawTestCases) != "[]" {
			t.Errorf("expected '[]' for empty test_cases, got %q", rawTestCases)
		}
	})
}

// TestIntegration_Migration021_Down verifies that the down migration strips kind from
// all JSONB array elements.
//
// Contract: down.sql is the inverse of up.sql — it removes kind from all elements.
// Catches: incomplete down migration that would block re-running up in CI.
func TestIntegration_Migration021_Down(t *testing.T) {
	t.Parallel()

	t.Run("down migration strips kind from problems.test_cases", func(t *testing.T) {
		db := testutil.SetupMigrationTestDB(t, 21)

		nsID := "ns-mig021-down"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig021 Down NS', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021down@test.com', 'instructor', $2)`,
			userID, nsID)
		problemID := uuid.New()
		// Insert with kind already set (as migration 021 up would produce).
		db.Exec(t, `
			INSERT INTO problems (id, namespace_id, title, author_id, test_cases)
			VALUES ($1, $2, 'Down Problem', $3, '[{"kind":"io","name":"t1","input":"a","match_type":"exact","order":0}]'::jsonb)
		`, problemID, nsID, userID)

		// Roll back to migration 20.
		db.MigrateTo(t, 20)

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
			t.Fatalf("expected 1 test case, got %d", len(cases))
		}
		if _, hasKind := cases[0]["kind"]; hasKind {
			t.Errorf("expected kind to be stripped by down migration, but got kind=%v", cases[0]["kind"])
		}
	})

	t.Run("down migration strips kind from student_work.test_cases", func(t *testing.T) {
		db := testutil.SetupMigrationTestDB(t, 21)

		nsID := "ns-mig021-down-sw"
		db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig021 Down SW NS', true)`, nsID)
		userID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021dwni@test.com', 'instructor', $2)`,
			userID, nsID)
		studentID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig021dwns@test.com', 'student', $2)`,
			studentID, nsID)

		classID := uuid.New()
		db.Exec(t, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Class021Down', $3)`,
			classID, nsID, userID)
		sectionID := uuid.New()
		db.Exec(t, `INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Sec021Down', 'join021d')`,
			sectionID, nsID, classID)
		problemID := uuid.New()
		db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'Prob021Down', $3, '[]'::jsonb)`,
			problemID, nsID, userID)
		workID := uuid.New()
		// Insert student_work with kind already set (as migration 021 up would produce).
		db.Exec(t, `
			INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
			VALUES ($1, $2, $3, $4, $5, '', '[{"kind":"io","name":"sw-down-case","input":"stdin","match_type":"exact","order":0}]'::jsonb)
		`, workID, nsID, studentID, problemID, sectionID)

		// Roll back to migration 20.
		db.MigrateTo(t, 20)

		var rawTestCases []byte
		row := db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, workID)
		if err := row.Scan(&rawTestCases); err != nil {
			t.Fatalf("scan test_cases: %v", err)
		}

		var cases []map[string]interface{}
		if err := json.Unmarshal(rawTestCases, &cases); err != nil {
			t.Fatalf("unmarshal test_cases: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("expected 1 test case in student_work, got %d", len(cases))
		}
		if _, hasKind := cases[0]["kind"]; hasKind {
			t.Errorf("expected kind to be stripped by down migration from student_work, but got kind=%v", cases[0]["kind"])
		}
	})
}
