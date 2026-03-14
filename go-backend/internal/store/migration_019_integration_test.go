// Integration tests for migration 019: test_cases JSONB column on student_work table.
//
// Verifies:
//   - student_work.test_cases column exists with JSONB type
//   - Column is nullable (no NOT NULL constraint)
//   - Students can read/write their own test_cases via RLS
//   - Instructors can read student test_cases in their section via RLS
//   - UpdateStudentWork stores and retrieves test_cases correctly
//   - GetOrCreateStudentWork returns test_cases field
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration019
package store

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// assertJSONEqual compares two JSON byte slices semantically (key order independent).
func assertJSONEqual(t *testing.T, field string, got, want json.RawMessage) {
	t.Helper()
	var gotVal, wantVal interface{}
	if err := json.Unmarshal(got, &gotVal); err != nil {
		t.Fatalf("%s: unmarshal got: %v", field, err)
	}
	if err := json.Unmarshal(want, &wantVal); err != nil {
		t.Fatalf("%s: unmarshal want: %v", field, err)
	}
	if !reflect.DeepEqual(gotVal, wantVal) {
		t.Errorf("%s: got %s, want %s", field, string(got), string(want))
	}
}

func TestIntegration_Migration019_StudentWorkTestCasesColumn(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	t.Run("student_work.test_cases column exists with JSONB type", func(t *testing.T) {
		var dataType string
		err := db.pool.QueryRow(ctx, `
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'student_work' AND column_name = 'test_cases'
		`).Scan(&dataType)
		if err != nil {
			t.Fatalf("check column type: %v", err)
		}
		if dataType != "jsonb" {
			t.Errorf("expected data_type 'jsonb', got %q", dataType)
		}
	})

	t.Run("student_work.test_cases column is nullable", func(t *testing.T) {
		var isNullable string
		err := db.pool.QueryRow(ctx, `
			SELECT is_nullable FROM information_schema.columns
			WHERE table_name = 'student_work' AND column_name = 'test_cases'
		`).Scan(&isNullable)
		if err != nil {
			t.Fatalf("check is_nullable: %v", err)
		}
		if isNullable != "YES" {
			t.Errorf("expected is_nullable 'YES', got %q", isNullable)
		}
	})
}

func TestIntegration_Migration019_StudentWorkTestCasesRLS(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	studentID := uuid.New()
	instructorID := uuid.New()
	db.createUser(ctx, t, studentID, "stu-019@test.com", "student", nsID)
	db.createUser(ctx, t, instructorID, "instr-019@test.com", "instructor", nsID)

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Test Class 019", instructorID)
	db.createSection(ctx, t, sectionID, nsID, classID, "Test Section 019", "019-RLS")
	db.createMembership(ctx, t, studentID, sectionID, "student")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")

	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Problem 019", instructorID, nil, nil)

	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-019@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}
	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "instr-019@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	testCasesJSON := json.RawMessage(`[{"name":"my test","input":"hello","match_type":"exact","order":0}]`)

	t.Run("student can write test_cases to their own student_work", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		sw, err := s.GetOrCreateStudentWork(ctx, nsID, studentID, problemID, sectionID)
		if err != nil {
			t.Fatalf("GetOrCreateStudentWork: %v", err)
		}

		updated, err := s.UpdateStudentWork(ctx, sw.ID, UpdateStudentWorkParams{
			TestCases: testCasesJSON,
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork with test_cases: %v", err)
		}
		assertJSONEqual(t, "test_cases", updated.TestCases, testCasesJSON)
	})

	t.Run("instructor can read test_cases on student work in their section", func(t *testing.T) {
		// Use a separate problem to avoid unique constraint with the student subtest above.
		instrProblemID := uuid.New()
		db.createProblem(ctx, t, instrProblemID, nsID, "Problem 019-instr", instructorID, nil, nil)

		swID := uuid.New()
		_, err := db.pool.Exec(ctx,
			`INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, test_cases)
			 VALUES ($1, $2, $3, $4, $5, '', $6)`,
			swID, nsID, studentID, instrProblemID, sectionID, testCasesJSON)
		if err != nil {
			t.Fatalf("insert student_work with test_cases: %v", err)
		}

		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		sw, err := s.GetStudentWork(ctx, swID)
		if err != nil {
			t.Fatalf("GetStudentWork as instructor: %v", err)
		}
		assertJSONEqual(t, "test_cases", sw.TestCases, testCasesJSON)
	})

	t.Run("test_cases defaults to null when not set", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		otherProblemID := uuid.New()
		db.createProblem(ctx, t, otherProblemID, nsID, "Other Problem 019", instructorID, nil, nil)

		sw, err := s.GetOrCreateStudentWork(ctx, nsID, studentID, otherProblemID, sectionID)
		if err != nil {
			t.Fatalf("GetOrCreateStudentWork: %v", err)
		}
		if sw.TestCases != nil {
			t.Errorf("expected nil test_cases for new student work, got %s", string(sw.TestCases))
		}
	})
}
