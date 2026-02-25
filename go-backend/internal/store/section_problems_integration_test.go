// Integration tests for section_problems store operations.
//
// These tests validate actual Store methods with proper RLS context,
// ensuring that the SQL queries, scanning logic, and RLS policies work
// together as they would in production.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_SectionProblems

package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

func TestIntegration_SectionProblemsCRUD(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data with superuser pool
	instructorID := uuid.New()
	studentID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problemID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES
		($1, 'instructor@test.com', 'instructor', $2),
		($3, 'student@test.com', 'student', $4)`,
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

	joinCode := "JOIN-" + sectionID.String()[:8]
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
	executionSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES ($1, $2, 'Test Problem', $3, $4, $5)`,
		problemID, db.nsID, testCases, executionSettings, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	// Test as instructor
	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instructor@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	// Test as student
	studentUser := &auth.User{
		ID:          studentID,
		Email:       "student@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("CreateSectionProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		sp, err := s.CreateSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  instructorID,
			ShowSolution: false,
		})
		if err != nil {
			t.Fatalf("CreateSectionProblem failed: %v", err)
		}
		if sp.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sp.SectionID)
		}
		if sp.ProblemID != problemID {
			t.Errorf("expected problem_id %s, got %s", problemID, sp.ProblemID)
		}
		if sp.PublishedBy != instructorID {
			t.Errorf("expected published_by %s, got %s", instructorID, sp.PublishedBy)
		}
		if sp.ShowSolution {
			t.Error("expected show_solution false")
		}
		if sp.PublishedAt.IsZero() {
			t.Error("expected non-zero published_at")
		}
	})

	t.Run("CreateSectionProblem_Duplicate", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		_, err := s.CreateSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  instructorID,
			ShowSolution: false,
		})
		if err != ErrDuplicate {
			t.Errorf("expected ErrDuplicate, got %v", err)
		}
	})

	t.Run("ListSectionProblems_NoStudentWork", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		problems, err := s.ListSectionProblems(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListSectionProblems failed: %v", err)
		}
		if len(problems) != 1 {
			t.Fatalf("expected 1 problem, got %d", len(problems))
		}
		p := problems[0]
		if p.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, p.SectionID)
		}
		if p.ProblemID != problemID {
			t.Errorf("expected problem_id %s, got %s", problemID, p.ProblemID)
		}
		if p.Problem.ID != problemID {
			t.Errorf("expected problem.id %s, got %s", problemID, p.Problem.ID)
		}
		if p.Problem.Title != "Test Problem" {
			t.Errorf("expected problem.title 'Test Problem', got %s", p.Problem.Title)
		}
		if p.StudentWork != nil {
			t.Error("expected nil student_work (student hasn't started)")
		}
	})

	t.Run("UpdateSectionProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		showSolution := true
		sp, err := s.UpdateSectionProblem(ctx, sectionID, problemID, UpdateSectionProblemParams{
			ShowSolution: &showSolution,
		})
		if err != nil {
			t.Fatalf("UpdateSectionProblem failed: %v", err)
		}
		if !sp.ShowSolution {
			t.Error("expected show_solution true")
		}
	})

	t.Run("UpdateSectionProblem_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		showSolution := false
		_, err := s.UpdateSectionProblem(ctx, uuid.New(), problemID, UpdateSectionProblemParams{
			ShowSolution: &showSolution,
		})
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("GetSectionProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		sp, err := s.GetSectionProblem(ctx, sectionID, problemID)
		if err != nil {
			t.Fatalf("GetSectionProblem failed: %v", err)
		}
		if sp.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sp.SectionID)
		}
		if sp.ProblemID != problemID {
			t.Errorf("expected problem_id %s, got %s", problemID, sp.ProblemID)
		}
		if sp.PublishedBy != instructorID {
			t.Errorf("expected published_by %s, got %s", instructorID, sp.PublishedBy)
		}
	})

	t.Run("GetSectionProblem_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		_, err := s.GetSectionProblem(ctx, sectionID, uuid.New())
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("ListSectionsForProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		sections, err := s.ListSectionsForProblem(ctx, problemID)
		if err != nil {
			t.Fatalf("ListSectionsForProblem failed: %v", err)
		}
		if len(sections) != 1 {
			t.Fatalf("expected 1 section, got %d", len(sections))
		}
		if sections[0].SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sections[0].SectionID)
		}
	})

	t.Run("DeleteSectionProblem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		err := s.DeleteSectionProblem(ctx, sectionID, problemID)
		if err != nil {
			t.Fatalf("DeleteSectionProblem failed: %v", err)
		}

		// Verify deletion
		problems, err := s.ListSectionProblems(ctx, sectionID, instructorID)
		if err != nil {
			t.Fatalf("ListSectionProblems failed: %v", err)
		}
		if len(problems) != 0 {
			t.Errorf("expected 0 problems after deletion, got %d", len(problems))
		}
	})

	t.Run("DeleteSectionProblem_NotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		err := s.DeleteSectionProblem(ctx, sectionID, problemID)
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})
}

func TestIntegration_EnsureSectionProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	classID := uuid.New()
	sectionID := uuid.New()
	problemID := uuid.New()

	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role, namespace_id) VALUES ($1, 'instr_ensure@test.com', 'instructor', $2)`,
		instructorID, db.nsID)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Ensure Class', $3)`,
		classID, db.nsID, instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "ENS-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Ensure Section', $4)`,
		sectionID, db.nsID, classID, joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`,
		instructorID, sectionID)
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}

	testCases := json.RawMessage(`[]`)
	executionSettings := json.RawMessage(`{"stdin": ""}`)
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, test_cases, execution_settings, author_id)
		VALUES ($1, $2, 'Ensure Problem', $3, $4, $5)`,
		problemID, db.nsID, testCases, executionSettings, instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instr_ensure@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("Creates record when not exists", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		err := s.EnsureSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  instructorID,
			ShowSolution: false,
		})
		if err != nil {
			t.Fatalf("EnsureSectionProblem failed: %v", err)
		}

		// Verify the record was created
		var count int
		err = db.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM section_problems WHERE section_id = $1 AND problem_id = $2`,
			sectionID, problemID).Scan(&count)
		if err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 record, got %d", count)
		}
	})

	t.Run("No-ops when record already exists", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, instructorUser)
		defer conn.Release()

		// Call again - should not error and should not change show_solution
		err := s.EnsureSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  instructorID,
			ShowSolution: true, // different from original
		})
		if err != nil {
			t.Fatalf("EnsureSectionProblem (duplicate) failed: %v", err)
		}

		// Verify still only one record and show_solution was NOT changed
		var count int
		var showSolution bool
		err = db.pool.QueryRow(ctx,
			`SELECT COUNT(*), bool_or(show_solution) FROM section_problems WHERE section_id = $1 AND problem_id = $2`,
			sectionID, problemID).Scan(&count, &showSolution)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 record, got %d", count)
		}
		if showSolution {
			t.Error("expected show_solution unchanged (false), but it was changed to true")
		}
	})
}

func TestIntegration_ListSectionProblemsWithStudentWork(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
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

	joinCode2 := "JOIN-" + sectionID.String()[:8]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, 'Test Section', $4)`,
		sectionID, db.nsID, classID, joinCode2)
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

	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES ($1, $2, $3)`,
		sectionID, problemID, instructorID)
	if err != nil {
		t.Fatalf("create section_problem: %v", err)
	}

	// Create student work
	studentWorkID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, $5, 'print("hello")')`,
		studentWorkID, db.nsID, studentID, problemID, sectionID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	studentUser := &auth.User{
		ID:          studentID,
		Email:       "student@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("ListSectionProblems_WithStudentWork", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, studentUser)
		defer conn.Release()

		problems, err := s.ListSectionProblems(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListSectionProblems failed: %v", err)
		}
		if len(problems) != 1 {
			t.Fatalf("expected 1 problem, got %d", len(problems))
		}
		p := problems[0]
		if p.StudentWork == nil {
			t.Fatal("expected student_work to be non-nil")
		}
		if p.StudentWork.ID != studentWorkID {
			t.Errorf("expected student_work.id %s, got %s", studentWorkID, p.StudentWork.ID)
		}
		if p.StudentWork.Code != `print("hello")` {
			t.Errorf("expected code 'print(\"hello\")', got %s", p.StudentWork.Code)
		}
		// Verify timestamps are parsed correctly (regression for PLAT-wqpn).
		// Previously the ::text cast caused time parsing to fail silently, yielding zero times.
		if p.StudentWork.CreatedAt.IsZero() {
			t.Error("expected non-zero student_work.created_at")
		}
		if p.StudentWork.LastUpdate.IsZero() {
			t.Error("expected non-zero student_work.last_update")
		}
	})
}
