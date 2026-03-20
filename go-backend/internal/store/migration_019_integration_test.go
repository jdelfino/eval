// Integration tests for migration 019: test_cases column on student_work table.
//
// Verifies:
//   - test_cases column is nullable (JSONB, no NOT NULL constraint in 019)
//   - UpdateStudentWork stores test_cases and returns it
//   - GetStudentWork returns test_cases field
//   - Existing rows (created without test_cases) have NULL test_cases
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

	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "019 Problem", instructorID, nil, nil)

	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-019@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("existing student_work row has NULL test_cases", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, problemID, sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		sw, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		// Migration 019 adds the column as nullable; existing rows should have NULL.
		if sw.TestCases != nil {
			t.Errorf("expected nil test_cases for existing row, got %s", sw.TestCases)
		}
	})

	t.Run("UpdateStudentWork stores and returns test_cases", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, problemID, sectionID)

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
		db.createStudentWork(ctx, t, workID, nsID, studentID, problemID, sectionID)

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

	t.Run("UpdateStudentWork with nil test_cases leaves field NULL", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, problemID, sectionID)

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
		if updated.TestCases != nil {
			t.Errorf("expected nil test_cases when not provided, got %s", updated.TestCases)
		}
	})
}
