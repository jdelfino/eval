// Integration tests for migration 022: recover from migration 021's partial
// failure on prod (see beads eval-aga).
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration022
package store

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration022_CheckConstraints verifies that migration 022 adds
// CHECK constraints rejecting non-array test_cases shapes on both tables.
//
// This is the load-bearing schema invariant — it prevents any future bug or
// hand-written SQL from leaking non-array shapes the way prior migrations did.
func TestIntegration_Migration022_CheckConstraints(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 22)

	nsID := "ns-mig022-check"
	db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig022 NS', true)`, nsID)
	userID := uuid.New()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig022@test.com', 'instructor', $2)`,
		userID, nsID)

	t.Run("array test_cases insert succeeds", func(t *testing.T) {
		problemID := uuid.New()
		db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P', $3, '[]'::jsonb)`,
			problemID, nsID, userID)
	})

	t.Run("non-array test_cases insert rejected on problems", func(t *testing.T) {
		problemID := uuid.New()
		_, err := db.Pool.Exec(t.Context(),
			`INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P', $3, '{}'::jsonb)`,
			problemID, nsID, userID)
		if err == nil {
			t.Fatal("expected CHECK constraint to reject non-array test_cases on problems")
		}
		if !strings.Contains(err.Error(), "problems_test_cases_is_array") {
			t.Errorf("expected error to reference CHECK constraint, got: %v", err)
		}
	})

	t.Run("non-array test_cases insert rejected on student_work", func(t *testing.T) {
		// Set up problem + student + section so RLS-related FKs are satisfied.
		studentID := uuid.New()
		db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig022stu@test.com', 'student', $2)`,
			studentID, nsID)
		classID := uuid.New()
		db.Exec(t, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'C', $3)`, classID, nsID, userID)
		sectionID := uuid.New()
		db.Exec(t, `INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'S', 'jm022x')`,
			sectionID, nsID, classID)
		problemID := uuid.New()
		db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P', $3, '[]'::jsonb)`,
			problemID, nsID, userID)

		workID := uuid.New()
		_, err := db.Pool.Exec(t.Context(), `
			INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
			VALUES ($1, $2, $3, $4, $5, '', '{"stdin":"x"}'::jsonb)
		`, workID, nsID, studentID, problemID, sectionID)
		if err == nil {
			t.Fatal("expected CHECK constraint to reject non-array test_cases on student_work")
		}
		if !strings.Contains(err.Error(), "student_work_test_cases_is_array") {
			t.Errorf("expected error to reference CHECK constraint, got: %v", err)
		}
	})
}

// TestIntegration_Migration022_NormalizesLeakedShapes verifies that migration 022
// recovers data that migration 021 would have crashed on — the prod scenario.
//
// Setup mimics the actual prod state when 021 failed:
//   - DB is migrated to v20 (last successful migration).
//   - Bad-shape rows are inserted directly.
//   - schema_migrations is manually advanced to claim v21 applied (which mirrors
//     the operational step we'll take on prod to clear the dirty flag).
//   - MigrateTo(22) runs migration 022 on top of that state.
//
// Asserts:
//   - student_work rows with {"stdin":"..."} become a single-element IOTestCase[] with kind='io'.
//   - student_work rows with {} become [].
//   - problems rows with non-array shapes become [].
//   - Existing array elements lacking 'kind' get tagged with kind='io' (021's job).
//   - Already-tagged elements are left alone.
//   - Empty arrays are unaffected.
func TestIntegration_Migration022_NormalizesLeakedShapes(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 20)

	nsID := "ns-mig022-leak"
	db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig022 NS', true)`, nsID)
	authorID := uuid.New()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig022auth@test.com', 'instructor', $2)`,
		authorID, nsID)
	studentID := uuid.New()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig022stu@test.com', 'student', $2)`,
		studentID, nsID)
	classID := uuid.New()
	db.Exec(t, `INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'C', $3)`, classID, nsID, authorID)
	sectionID := uuid.New()
	db.Exec(t, `INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'S', 'jm022l')`,
		sectionID, nsID, classID)

	// Problem with an existing legacy array (elements lack 'kind').
	probLegacyID := uuid.New()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P-legacy', $3,
	  '[{"name":"t1","input":"a","match_type":"exact","order":0}]'::jsonb)`,
		probLegacyID, nsID, authorID)

	// Problem with an already-tagged array.
	probTaggedID := uuid.New()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P-tagged', $3,
	  '[{"kind":"io","name":"t1","input":"a","match_type":"exact","order":0}]'::jsonb)`,
		probTaggedID, nsID, authorID)

	// Problem with empty array.
	probEmptyID := uuid.New()
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P-empty', $3, '[]'::jsonb)`,
		probEmptyID, nsID, authorID)

	// One student_work per problem because (user_id, problem_id, section_id) is unique.
	// student_work row with empty object — should become [].
	workEmptyID := uuid.New()
	db.Exec(t, `INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
	  VALUES ($1, $2, $3, $4, $5, 'code-empty', '{}'::jsonb)`,
		workEmptyID, nsID, studentID, probLegacyID, sectionID)

	// student_work row with legacy {"stdin": "..."} — should listify.
	workStdinID := uuid.New()
	stdinValue := "hello\nworld\n"
	db.Exec(t, `INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
	  VALUES ($1, $2, $3, $4, $5, 'code-stdin', $6::jsonb)`,
		workStdinID, nsID, studentID, probTaggedID, sectionID,
		`{"stdin": "`+strings.ReplaceAll(stdinValue, "\n", `\n`)+`"}`)

	// student_work row with legacy array — should get kind tagged.
	workArrayID := uuid.New()
	db.Exec(t, `INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
	  VALUES ($1, $2, $3, $4, $5, 'code-array',
	  '[{"name":"sw","input":"in","match_type":"exact","order":0}]'::jsonb)`,
		workArrayID, nsID, studentID, probEmptyID, sectionID)

	// Manually advance schema_migrations to claim v21 applied. This mirrors the
	// operational step on prod where the dirty flag is cleared. Without it,
	// MigrateTo(22) would try to run 021's broken SQL against the bad-shape rows.
	db.Exec(t, `UPDATE schema_migrations SET version = 21, dirty = false`)

	// Run migration 022.
	db.MigrateTo(t, 22)

	t.Run("legacy problems array gets kind tagged", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, probLegacyID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		var cases []map[string]any
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("got %d cases, want 1: %s", len(cases), raw)
		}
		if cases[0]["kind"] != "io" {
			t.Errorf("expected kind=io, got %v", cases[0]["kind"])
		}
	})

	t.Run("already-tagged problems array unchanged", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, probTaggedID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		var cases []map[string]any
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if cases[0]["kind"] != "io" {
			t.Errorf("expected kind=io preserved, got %v", cases[0]["kind"])
		}
	})

	t.Run("empty array problem unchanged", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM problems WHERE id = $1`, probEmptyID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if string(raw) != "[]" {
			t.Errorf("expected '[]', got %q", raw)
		}
	})

	t.Run("student_work empty object becomes empty array", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, workEmptyID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if string(raw) != "[]" {
			t.Errorf("expected '[]', got %q", raw)
		}
	})

	t.Run("student_work {stdin} listifies preserving stdin", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, workStdinID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		var cases []map[string]any
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 {
			t.Fatalf("got %d cases, want 1: %s", len(cases), raw)
		}
		c := cases[0]
		if c["kind"] != "io" {
			t.Errorf("expected kind=io, got %v", c["kind"])
		}
		if c["name"] != "Default" {
			t.Errorf("expected name=Default, got %v", c["name"])
		}
		if c["input"] != stdinValue {
			t.Errorf("expected input=%q, got %q", stdinValue, c["input"])
		}
		if c["match_type"] != "exact" {
			t.Errorf("expected match_type=exact, got %v", c["match_type"])
		}
		// JSON unmarshal turns numbers into float64; the migration stores 0 as a
		// numeric literal, so the round-trip should be 0.
		if order, ok := c["order"].(float64); !ok || order != 0 {
			t.Errorf("expected order=0, got %v (%T)", c["order"], c["order"])
		}
	})

	t.Run("student_work legacy array gets kind tagged", func(t *testing.T) {
		var raw []byte
		if err := db.QueryRow(t, `SELECT test_cases FROM student_work WHERE id = $1`, workArrayID).Scan(&raw); err != nil {
			t.Fatalf("scan: %v", err)
		}
		var cases []map[string]any
		if err := json.Unmarshal(raw, &cases); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(cases) != 1 || cases[0]["kind"] != "io" {
			t.Errorf("expected single element with kind=io, got %s", raw)
		}
	})
}

// TestIntegration_Migration022_Down verifies the down migration removes the
// CHECK constraints (data shape is not reversible, so down only drops the schema invariant).
func TestIntegration_Migration022_Down(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 22)

	db.MigrateTo(t, 21)

	// After down, the CHECK constraints should be gone — verify by attempting
	// an insert that would have been rejected at v22.
	nsID := "ns-mig022-down"
	db.Exec(t, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, 'Mig022 Down NS', true)`, nsID)
	authorID := uuid.New()
	db.Exec(t, `INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'mig022dwn@test.com', 'instructor', $2)`,
		authorID, nsID)
	problemID := uuid.New()
	// At v21 (post-down), inserting a non-array should succeed (no CHECK).
	db.Exec(t, `INSERT INTO problems (id, namespace_id, title, author_id, test_cases) VALUES ($1, $2, 'P', $3, '{}'::jsonb)`,
		problemID, nsID, authorID)
}
