// Integration tests for migration 019: test_cases column on student_work table.
//
// Verifies:
//   - test_cases column exists and has default '[]'::jsonb after all migrations
//   - UpdateStudentWork stores test_cases and returns it
//   - GetStudentWork returns test_cases field
//   - UpdateStudentWork with nil test_cases preserves existing value
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration019
package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

func TestIntegration_Migration019_StudentWorkTestCases(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-019@test.com", "instructor", nsID)
	db.createUser(ctx, t, studentID, "stu-019@test.com", "student", nsID)

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Migration 019 Class", instructorID)
	db.createSection(ctx, t, sectionID, nsID, classID, "Migration 019 Section", "MIG019")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	db.createMembership(ctx, t, studentID, sectionID, "student")

	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-019@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	// Each subtest uses its own problem to avoid the UNIQUE(user_id, problem_id, section_id) constraint.
	newProblem := func(name string) uuid.UUID {
		id := uuid.New()
		db.createProblem(ctx, t, id, nsID, name, instructorID, nil, nil)
		return id
	}

	t.Run("existing student_work row has empty test_cases by default", func(t *testing.T) {
		// After migration 020, test_cases is NOT NULL DEFAULT '[]'::jsonb.
		// Rows inserted without specifying test_cases get the empty-array default.
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, newProblem("019a"), sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		sw, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		if string(sw.TestCases) != "[]" {
			t.Errorf("expected empty test_cases for new row, got %s", sw.TestCases)
		}
	})

	t.Run("UpdateStudentWork stores and returns test_cases", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, newProblem("019b"), sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		testCases := json.RawMessage(`[{"name":"t1","input":"hello","match_type":"exact"}]`)
		code := "print('hello')"
		updated, err := s.UpdateStudentWork(ctx, workID, UpdateStudentWorkParams{
			Code:      &code,
			TestCases: testCases,
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork failed: %v", err)
		}
		if string(updated.TestCases) != string(testCases) {
			t.Errorf("expected test_cases %s, got %s", testCases, updated.TestCases)
		}
	})

	t.Run("GetStudentWork returns test_cases field", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, newProblem("019c"), sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		testCases := json.RawMessage(`[{"name":"t2","input":"world","match_type":"exact"}]`)
		code := "print('world')"
		_, err := s.UpdateStudentWork(ctx, workID, UpdateStudentWorkParams{
			Code:      &code,
			TestCases: testCases,
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork failed: %v", err)
		}

		got, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		if string(got.TestCases) != string(testCases) {
			t.Errorf("GetStudentWork: expected test_cases %s, got %s", testCases, got.TestCases)
		}
	})

	t.Run("UpdateStudentWork with nil test_cases preserves existing value", func(t *testing.T) {
		// After migration 020, test_cases is NOT NULL. Passing nil in UpdateStudentWorkParams
		// should leave the existing value unchanged (not overwrite with empty array).
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, newProblem("019d"), sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		code := "x = 1"
		updated, err := s.UpdateStudentWork(ctx, workID, UpdateStudentWorkParams{
			Code:      &code,
			TestCases: nil, // should not change test_cases
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork failed: %v", err)
		}
		// The default value from DB is '[]', and nil params should not overwrite it.
		if string(updated.TestCases) != "[]" {
			t.Errorf("expected default [] test_cases when not provided, got %s", updated.TestCases)
		}
	})
}
