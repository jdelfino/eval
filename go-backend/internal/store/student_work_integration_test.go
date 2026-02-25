// Integration tests for student_work store operations.
//
// These tests validate actual Store methods with proper RLS context,
// ensuring that the SQL queries, scanning logic, and RLS policies work
// together as they would in production.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_StudentWork

package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

func TestIntegration_StudentWorkCRUD(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data with superuser pool
	studentID := uuid.New()
	instructorID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problemID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES
		($1, 'student@test.com', 'student', $2),
		($3, 'instructor@test.com', 'instructor', $4)`,
		studentID, db.nsID, instructorID, db.nsID)
	if err != nil {
		t.Fatalf("create users: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, db.nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "JOIN-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, db.nsID, classID, joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES
		($1, $2, 'student'),
		($3, $4, 'instructor')`,
		studentID, sectionID, instructorID, sectionID)
	if err != nil {
		t.Fatalf("create memberships: %v", err)
	}

	testCases := json.RawMessage(`[]`)
	executionSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES ($1, $2, 'Test Problem', $3, $4, $5)`,
		problemID, db.nsID, testCases, executionSettings, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	studentUser := &auth.User{
		ID:          studentID,
		Email:       "student@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleStudent,
	}

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instructor@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	var workID uuid.UUID

	t.Run("GetOrCreateStudentWork_Create", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		work, err := s.GetOrCreateStudentWork(ctx, db.nsID, studentID, problemID, sectionID)
		if err != nil {
			t.Fatalf("GetOrCreateStudentWork failed: %v", err)
		}
		if work.NamespaceID != db.nsID {
			t.Errorf("expected namespace_id %s, got %s", db.nsID, work.NamespaceID)
		}
		if work.UserID != studentID {
			t.Errorf("expected user_id %s, got %s", studentID, work.UserID)
		}
		if work.ProblemID != problemID {
			t.Errorf("expected problem_id %s, got %s", problemID, work.ProblemID)
		}
		if work.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, work.SectionID)
		}
		if work.Code != "" {
			t.Errorf("expected empty code, got %s", work.Code)
		}
		if work.CreatedAt.IsZero() {
			t.Error("expected non-zero created_at")
		}
		if work.LastUpdate.IsZero() {
			t.Error("expected non-zero last_update")
		}
		workID = work.ID
	})

	t.Run("GetOrCreateStudentWork_Get", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		work, err := s.GetOrCreateStudentWork(ctx, db.nsID, studentID, problemID, sectionID)
		if err != nil {
			t.Fatalf("GetOrCreateStudentWork failed: %v", err)
		}
		if work.ID != workID {
			t.Errorf("expected same id %s, got %s", workID, work.ID)
		}
	})

	t.Run("UpdateStudentWork", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		newCode := "print('updated')"
		newSettings := json.RawMessage(`{"stdin": "input"}`)
		work, err := s.UpdateStudentWork(ctx, workID, UpdateStudentWorkParams{
			Code:              &newCode,
			ExecutionSettings: newSettings,
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork failed: %v", err)
		}
		if work.Code != newCode {
			t.Errorf("expected code %s, got %s", newCode, work.Code)
		}
		if string(work.ExecutionSettings) != string(newSettings) {
			t.Errorf("expected execution_settings %s, got %s", newSettings, work.ExecutionSettings)
		}
	})

	t.Run("UpdateStudentWork_OnlyCode", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		newCode := "print('code only')"
		work, err := s.UpdateStudentWork(ctx, workID, UpdateStudentWorkParams{
			Code: &newCode,
		})
		if err != nil {
			t.Fatalf("UpdateStudentWork failed: %v", err)
		}
		if work.Code != newCode {
			t.Errorf("expected code %s, got %s", newCode, work.Code)
		}
		// execution_settings should remain unchanged
		expectedSettings := `{"stdin": "input"}`
		if string(work.ExecutionSettings) != expectedSettings {
			t.Errorf("expected execution_settings %s, got %s", expectedSettings, work.ExecutionSettings)
		}
	})

	t.Run("UpdateStudentWork_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		newCode := "print('test')"
		_, err := s.UpdateStudentWork(ctx, uuid.New(), UpdateStudentWorkParams{
			Code: &newCode,
		})
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("GetStudentWork", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		workWithProblem, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		if workWithProblem.ID != workID {
			t.Errorf("expected id %s, got %s", workID, workWithProblem.ID)
		}
		if workWithProblem.Problem.ID != problemID {
			t.Errorf("expected problem.id %s, got %s", problemID, workWithProblem.Problem.ID)
		}
		if workWithProblem.Problem.Title != "Test Problem" {
			t.Errorf("expected problem.title 'Test Problem', got %s", workWithProblem.Problem.Title)
		}
	})

	t.Run("GetStudentWork_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		_, err := s.GetStudentWork(ctx, uuid.New())
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("GetStudentWorkByProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		work, err := s.GetStudentWorkByProblem(ctx, studentID, problemID, sectionID)
		if err != nil {
			t.Fatalf("GetStudentWorkByProblem failed: %v", err)
		}
		if work.ID != workID {
			t.Errorf("expected id %s, got %s", workID, work.ID)
		}
	})

	t.Run("GetStudentWorkByProblem_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		_, err := s.GetStudentWorkByProblem(ctx, studentID, uuid.New(), sectionID)
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("InstructorCanViewStudentWork", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		work, err := s.GetStudentWork(ctx, workID)
		if err != nil {
			t.Fatalf("GetStudentWork failed for instructor: %v", err)
		}
		if work.ID != workID {
			t.Errorf("expected id %s, got %s", workID, work.ID)
		}
	})
}

func TestIntegration_ListStudentWorkBySession(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
	student1ID := uuid.New()
	student2ID := uuid.New()
	instructorID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problemID := uuid.New()
	sessionID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES
		($1, 'student1@test.com', 'student', $2),
		($3, 'student2@test.com', 'student', $4),
		($5, 'instructor@test.com', 'instructor', $6)`,
		student1ID, db.nsID, student2ID, db.nsID, instructorID, db.nsID)
	if err != nil {
		t.Fatalf("create users: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, db.nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode2 := "JOIN-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, db.nsID, classID, joinCode2)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`,
		instructorID, sectionID)
	if err != nil {
		t.Fatalf("create instructor membership: %v", err)
	}

	testCases := json.RawMessage(`[]`)
	executionSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES ($1, $2, 'Test Problem', $3, $4, $5)`,
		problemID, db.nsID, testCases, executionSettings, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	problemJSON := json.RawMessage(`{"id": "` + problemID.String() + `"}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id)
		VALUES ($1, $2, $3, 'Test Section', $4, $5)`,
		sessionID, db.nsID, sectionID, problemJSON, instructorID)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Create student work
	work1ID := uuid.New()
	work2ID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code)
		VALUES
		($1, $2, $3, $4, $5, 'print("student1")'),
		($6, $7, $8, $9, $10, 'print("student2")')`,
		work1ID, db.nsID, student1ID, problemID, sectionID,
		work2ID, db.nsID, student2ID, problemID, sectionID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	// Link to session via session_students
	_, err = db.pool.Exec(ctx,
		`INSERT INTO session_students (session_id, user_id, name, student_work_id)
		VALUES
		($1, $2, 'Student 1', $3),
		($4, $5, 'Student 2', $6)`,
		sessionID, student1ID, work1ID,
		sessionID, student2ID, work2ID)
	if err != nil {
		t.Fatalf("create session_students: %v", err)
	}

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instructor@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListStudentWorkBySession", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		works, err := s.ListStudentWorkBySession(ctx, sessionID)
		if err != nil {
			t.Fatalf("ListStudentWorkBySession failed: %v", err)
		}
		if len(works) != 2 {
			t.Fatalf("expected 2 works, got %d", len(works))
		}

		// Check both student works are present
		foundWork1 := false
		foundWork2 := false
		for _, w := range works {
			if w.ID == work1ID {
				foundWork1 = true
				if w.Code != `print("student1")` {
					t.Errorf("expected code 'print(\"student1\")', got %s", w.Code)
				}
			}
			if w.ID == work2ID {
				foundWork2 = true
				if w.Code != `print("student2")` {
					t.Errorf("expected code 'print(\"student2\")', got %s", w.Code)
				}
			}
		}
		if !foundWork1 {
			t.Error("work1 not found in results")
		}
		if !foundWork2 {
			t.Error("work2 not found in results")
		}
	})
}

func TestIntegration_ListStudentProgress(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
	instructorID := uuid.New()
	student1ID := uuid.New()
	student2ID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problemID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES
		($1, 'instr-sp@test.com', 'instructor', $2),
		($3, 'stu1-sp@test.com', 'student', $4),
		($5, 'stu2-sp@test.com', 'student', $6)`,
		instructorID, db.nsID, student1ID, db.nsID, student2ID, db.nsID)
	if err != nil {
		t.Fatalf("create users: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, db.nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "LSP-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, db.nsID, classID, joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES
		($1, $2, 'instructor'),
		($3, $4, 'student'),
		($5, $6, 'student')`,
		instructorID, sectionID, student1ID, sectionID, student2ID, sectionID)
	if err != nil {
		t.Fatalf("create memberships: %v", err)
	}

	testCases := json.RawMessage(`[]`)
	executionSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES ($1, $2, 'Test Problem', $3, $4, $5)`,
		problemID, db.nsID, testCases, executionSettings, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	// Publish problem to section
	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES ($1, $2, $3)`,
		sectionID, problemID, instructorID)
	if err != nil {
		t.Fatalf("create section_problem: %v", err)
	}

	// Create student work for student1 only
	_, err = db.pool.Exec(ctx,
		`INSERT INTO student_work (namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, 'print("hello")')`,
		db.nsID, student1ID, problemID, sectionID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instr-sp@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListStudentProgress_ReturnsAllStudents", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		progress, err := s.ListStudentProgress(ctx, sectionID)
		if err != nil {
			t.Fatalf("ListStudentProgress failed: %v", err)
		}
		if len(progress) != 2 {
			t.Fatalf("expected 2 students, got %d", len(progress))
		}

		// All students should have total_problems = 1
		for _, p := range progress {
			if p.TotalProblems != 1 {
				t.Errorf("expected TotalProblems=1, got %d for user %s", p.TotalProblems, p.UserID)
			}
		}

		// student1 has started work, student2 has not
		var foundStudent1, foundStudent2 bool
		for _, p := range progress {
			if p.UserID == student1ID {
				foundStudent1 = true
				if p.ProblemsStarted != 1 {
					t.Errorf("student1: expected ProblemsStarted=1, got %d", p.ProblemsStarted)
				}
				if p.LastActive == nil {
					t.Error("student1: expected non-nil LastActive")
				}
				if p.DisplayName == "" {
					t.Error("student1: expected non-empty DisplayName")
				}
			}
			if p.UserID == student2ID {
				foundStudent2 = true
				if p.ProblemsStarted != 0 {
					t.Errorf("student2: expected ProblemsStarted=0, got %d", p.ProblemsStarted)
				}
				if p.LastActive != nil {
					t.Error("student2: expected nil LastActive (no work done)")
				}
			}
		}
		if !foundStudent1 {
			t.Error("student1 not found in results")
		}
		if !foundStudent2 {
			t.Error("student2 not found in results")
		}
	})

	t.Run("ListStudentProgress_EmptySection", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		progress, err := s.ListStudentProgress(ctx, uuid.New())
		if err != nil {
			t.Fatalf("ListStudentProgress failed: %v", err)
		}
		if len(progress) != 0 {
			t.Fatalf("expected 0 students, got %d", len(progress))
		}
	})
}

func TestIntegration_ListStudentWorkForReview(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
	instructorID := uuid.New()
	studentID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problem1ID := uuid.New()
	problem2ID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES
		($1, 'instr-wr@test.com', 'instructor', $2),
		($3, 'stu-wr@test.com', 'student', $4)`,
		instructorID, db.nsID, studentID, db.nsID)
	if err != nil {
		t.Fatalf("create users: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, db.nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "WR-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, db.nsID, classID, joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES
		($1, $2, 'instructor'),
		($3, $4, 'student')`,
		instructorID, sectionID, studentID, sectionID)
	if err != nil {
		t.Fatalf("create memberships: %v", err)
	}

	testCases := json.RawMessage(`[]`)
	execSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES
		($1, $2, 'Problem 1', $3, $4, $5),
		($6, $7, 'Problem 2', $8, $9, $10)`,
		problem1ID, db.nsID, testCases, execSettings, instructorID,
		problem2ID, db.nsID, testCases, execSettings, instructorID)
	if err != nil {
		t.Fatalf("create problems: %v", err)
	}

	// Publish both problems to section
	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES
		($1, $2, $3),
		($4, $5, $6)`,
		sectionID, problem1ID, instructorID,
		sectionID, problem2ID, instructorID)
	if err != nil {
		t.Fatalf("create section_problems: %v", err)
	}

	// Student has work for problem1 only
	_, err = db.pool.Exec(ctx,
		`INSERT INTO student_work (namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, 'print("problem1")')`,
		db.nsID, studentID, problem1ID, sectionID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instr-wr@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("ListStudentWorkForReview_PartialCompletion", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		summaries, err := s.ListStudentWorkForReview(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListStudentWorkForReview failed: %v", err)
		}
		if len(summaries) != 2 {
			t.Fatalf("expected 2 summaries, got %d", len(summaries))
		}

		// Check that we have both problems, one with work and one without
		var foundProblem1WithWork, foundProblem2WithoutWork bool
		for _, summary := range summaries {
			if summary.Problem.ID == problem1ID {
				if summary.StudentWork == nil {
					t.Error("problem1: expected non-nil StudentWork")
				} else {
					foundProblem1WithWork = true
					if summary.StudentWork.Code != `print("problem1")` {
						t.Errorf("problem1: expected code 'print(\"problem1\")', got %s", summary.StudentWork.Code)
					}
				}
			}
			if summary.Problem.ID == problem2ID {
				if summary.StudentWork != nil {
					t.Error("problem2: expected nil StudentWork (student hasn't started)")
				} else {
					foundProblem2WithoutWork = true
				}
			}
			// PublishedAt must be set
			if summary.PublishedAt.IsZero() {
				t.Errorf("expected non-zero PublishedAt for problem %s", summary.Problem.ID)
			}
		}
		if !foundProblem1WithWork {
			t.Error("problem1 with work not found")
		}
		if !foundProblem2WithoutWork {
			t.Error("problem2 without work not found")
		}
	})

	t.Run("ListStudentWorkForReview_NoProblems", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		summaries, err := s.ListStudentWorkForReview(ctx, uuid.New(), studentID)
		if err != nil {
			t.Fatalf("ListStudentWorkForReview failed: %v", err)
		}
		if len(summaries) != 0 {
			t.Fatalf("expected 0 summaries, got %d", len(summaries))
		}
	})
}
