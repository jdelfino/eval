// Integration tests for migration 024: last_run_all_passed and last_run_at
// columns on the student_work table.
//
// Verifies:
//   - Columns exist and are nullable after the up migration
//   - SetStudentWorkRunResult round-trips both fields; ErrNotFound for unknown id
//   - ListStudentProgress counts problems_solved correctly
//   - ListSectionProblems returns the new columns on student_work
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration024
package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration024_Down verifies that rolling back migration 024
// removes the last_run_all_passed and last_run_at columns from student_work.
//
// Pattern follows migration 021/022 down tests: start at the target version,
// call MigrateTo(prior version), assert columns are absent.
func TestIntegration_Migration024_Down(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 24)

	// Roll back to migration 023.
	db.MigrateTo(t, 23)

	// After down, neither column should exist.
	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'student_work'
		  AND column_name IN ('last_run_all_passed', 'last_run_at')
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query columns: %v", err)
	}
	if count != 0 {
		t.Errorf("expected columns to be absent after down migration, found %d", count)
	}
}

// TestIntegration_Migration023_Down verifies that rolling back migration 023
// drops the public_author_display_name function.
func TestIntegration_Migration023_Down(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 23)

	// Roll back to migration 022.
	db.MigrateTo(t, 22)

	// After down, the function should not exist.
	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
		  AND p.proname = 'public_author_display_name'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query function: %v", err)
	}
	if count != 0 {
		t.Errorf("expected public_author_display_name to be absent after down migration, found %d instance(s)", count)
	}
}

func TestIntegration_Migration024_StudentWorkSolvedState(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-024@test.com", "instructor", nsID)
	db.createUser(ctx, t, studentID, "stu-024@test.com", "student", nsID)

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Migration 024 Class", instructorID)
	db.createSection(ctx, t, sectionID, nsID, classID, "Migration 024 Section", "MIG024")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	db.createMembership(ctx, t, studentID, sectionID, "student")

	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-024@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}
	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "instr-024@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	newProblem := func(name string) uuid.UUID {
		id := uuid.New()
		db.createProblem(ctx, t, id, nsID, name, instructorID, nil, nil)
		return id
	}

	t.Run("columns exist and are nullable after up migration", func(t *testing.T) {
		// Verify by directly querying information_schema.
		var count int
		err := db.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM information_schema.columns
			WHERE table_name = 'student_work'
			  AND column_name IN ('last_run_all_passed', 'last_run_at')
			  AND is_nullable = 'YES'
		`).Scan(&count)
		if err != nil {
			t.Fatalf("query columns: %v", err)
		}
		if count != 2 {
			t.Errorf("expected 2 nullable columns (last_run_all_passed, last_run_at), found %d", count)
		}
	})

	t.Run("SetStudentWorkRunResult round-trips both fields", func(t *testing.T) {
		workID := uuid.New()
		db.createStudentWork(ctx, t, workID, nsID, studentID, newProblem("024a"), sectionID)

		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		at := time.Now().Truncate(time.Millisecond)
		if err := s.SetStudentWorkRunResult(ctx, workID, true, at); err != nil {
			t.Fatalf("SetStudentWorkRunResult(true): %v", err)
		}

		sw, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork: %v", err)
		}
		if sw.LastRunAllPassed == nil || !*sw.LastRunAllPassed {
			t.Errorf("expected last_run_all_passed=true, got %v", sw.LastRunAllPassed)
		}
		if sw.LastRunAt == nil {
			t.Error("expected non-nil last_run_at")
		}
		// Flip to false
		if err := s.SetStudentWorkRunResult(ctx, workID, false, at); err != nil {
			t.Fatalf("SetStudentWorkRunResult(false): %v", err)
		}
		sw, err = s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork (second): %v", err)
		}
		if sw.LastRunAllPassed == nil || *sw.LastRunAllPassed {
			t.Errorf("expected last_run_all_passed=false after flip, got %v", sw.LastRunAllPassed)
		}
	})

	t.Run("SetStudentWorkRunResult_NotFound for unknown id", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		err := s.SetStudentWorkRunResult(ctx, uuid.New(), true, time.Now())
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("ListStudentProgress counts problems_solved only for true rows", func(t *testing.T) {
		// Set up: 2 published problems; student has solved one, not the other.
		p1 := newProblem("024b")
		p2 := newProblem("024c")

		_, err := db.pool.Exec(ctx,
			`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES ($1, $2, $3), ($4, $5, $6)`,
			sectionID, p1, instructorID,
			sectionID, p2, instructorID)
		if err != nil {
			t.Fatalf("publish problems: %v", err)
		}

		work1ID := uuid.New()
		work2ID := uuid.New()
		db.createStudentWork(ctx, t, work1ID, nsID, studentID, p1, sectionID)
		db.createStudentWork(ctx, t, work2ID, nsID, studentID, p2, sectionID)

		// Mark p1 as solved, leave p2 un-marked (NULL).
		sStore, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()
		if err := sStore.SetStudentWorkRunResult(ctx, work1ID, true, time.Now()); err != nil {
			t.Fatalf("SetStudentWorkRunResult: %v", err)
		}

		iStore, iConn := db.storeWithRLS(ctx, t, authInstructor)
		defer iConn.Release()

		progress, err := iStore.ListStudentProgress(ctx, sectionID)
		if err != nil {
			t.Fatalf("ListStudentProgress: %v", err)
		}

		var found bool
		for _, p := range progress {
			if p.UserID == studentID {
				found = true
				if p.ProblemsSolved != 1 {
					t.Errorf("expected ProblemsSolved=1, got %d", p.ProblemsSolved)
				}
			}
		}
		if !found {
			t.Error("student not found in progress")
		}
	})

	t.Run("ListSectionProblems returns new columns on student_work", func(t *testing.T) {
		// Reuse the solved work1 from the previous subtest via a new store call.
		iStore, iConn := db.storeWithRLS(ctx, t, authInstructor)
		defer iConn.Release()

		// Note: ListSectionProblems is designed for student view but works with any user ID.
		// Use the student's perspective to get student_work back.
		sStore, sConn := db.storeWithRLS(ctx, t, authStudent)
		defer sConn.Release()
		_ = iStore // silence unused

		problems, err := sStore.ListSectionProblems(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListSectionProblems: %v", err)
		}

		// Find the problem we marked as solved (p1 ← created as "024b" above).
		var foundSolved bool
		for _, pwp := range problems {
			if pwp.StudentWork != nil && pwp.StudentWork.LastRunAllPassed != nil && *pwp.StudentWork.LastRunAllPassed {
				foundSolved = true
				if pwp.StudentWork.LastRunAt == nil {
					t.Error("expected non-nil last_run_at on solved problem")
				}
			}
		}
		if !foundSolved {
			t.Error("no problem with last_run_all_passed=true found in ListSectionProblems results")
		}
	})
}
