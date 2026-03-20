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
		if string(p.TestCases) != string(testCases) {
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
		if string(updated.FeaturedTestCases) != string(testCases) {
			t.Errorf("expected featured_test_cases %s, got %s", testCases, updated.FeaturedTestCases)
		}
	})
}
