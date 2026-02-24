// Integration tests for migration 015 - namespace-admin RLS for section_problems.
//
// These tests verify that:
// 1. A namespace-admin CAN manage (INSERT/UPDATE/DELETE) section_problems for a section in their namespace
// 2. A namespace-admin CANNOT manage section_problems for a section in a different namespace (expects 42501 error)
// 3. A section instructor CAN still manage section_problems for their section
// 4. A student is BLOCKED from mutation operations on section_problems (expects 42501 error)
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration015

package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// isForbiddenPgError returns true if the error is a PostgreSQL insufficient_privilege (42501) error.
func isForbiddenPgError(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42501"
}

// =============================================================================
// Test: namespace-admin can manage section_problems in their own namespace
// =============================================================================

func TestIntegration_Migration015_NamespaceAdminCanManageSectionProblems(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create users
	nsAdminID := uuid.New()
	instructorID := uuid.New()
	db.createUserWithDisplayName(ctx, t, nsAdminID, "nsadmin@test.com", "namespace-admin", db.nsID, "NS Admin")
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor@test.com", "instructor", db.nsID, "Instructor")

	// Create class and section
	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "Test Class", instructorID)
	db.createSection(ctx, t, sectionID, db.nsID, classID, "Test Section", "NS015")

	// Create problem
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, db.nsID, "Test Problem", instructorID, nil, nil)

	nsAdminUser := &auth.User{
		ID:          nsAdminID,
		Email:       "nsadmin@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleNamespaceAdmin,
	}

	t.Run("namespace-admin can insert section_problem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, nsAdminUser)
		defer conn.Release()

		sp, err := s.CreateSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  nsAdminID,
			ShowSolution: false,
		})
		if err != nil {
			t.Fatalf("namespace-admin should be able to create section_problem: %v", err)
		}
		if sp.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sp.SectionID)
		}
	})

	t.Run("namespace-admin can update section_problem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, nsAdminUser)
		defer conn.Release()

		showSolution := true
		sp, err := s.UpdateSectionProblem(ctx, sectionID, problemID, UpdateSectionProblemParams{
			ShowSolution: &showSolution,
		})
		if err != nil {
			t.Fatalf("namespace-admin should be able to update section_problem: %v", err)
		}
		if !sp.ShowSolution {
			t.Error("expected show_solution true after update")
		}
	})

	t.Run("namespace-admin can delete section_problem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, nsAdminUser)
		defer conn.Release()

		err := s.DeleteSectionProblem(ctx, sectionID, problemID)
		if err != nil {
			t.Fatalf("namespace-admin should be able to delete section_problem: %v", err)
		}
	})
}

// =============================================================================
// Test: namespace-admin CANNOT manage section_problems in a different namespace
// =============================================================================

func TestIntegration_Migration015_NamespaceAdminCannotManageCrossNamespace(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create a second namespace
	otherNsID := "ns-other-" + uuid.New().String()
	db.createNamespace(ctx, t, otherNsID, "Other Namespace")

	// Create users: nsAdmin belongs to db.nsID, but the section is in otherNsID
	nsAdminID := uuid.New()
	instructorID := uuid.New()
	db.createUserWithDisplayName(ctx, t, nsAdminID, "nsadmin2@test.com", "namespace-admin", db.nsID, "NS Admin 2")
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor2@test.com", "instructor", otherNsID, "Instructor 2")

	// Create class and section in OTHER namespace
	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, otherNsID, "Other Class", instructorID)
	db.createSection(ctx, t, sectionID, otherNsID, classID, "Other Section", "OTH015")

	// Create problem in other namespace
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, otherNsID, "Other Problem", instructorID, nil, nil)

	// Pre-insert a section_problem as superuser so update/delete have something to act on
	_, err := db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES ($1, $2, $3)`,
		sectionID, problemID, instructorID)
	if err != nil {
		t.Fatalf("pre-insert section_problem: %v", err)
	}

	// nsAdmin claims to be in db.nsID, but the section is in otherNsID
	nsAdminUser := &auth.User{
		ID:          nsAdminID,
		Email:       "nsadmin2@test.com",
		NamespaceID: db.nsID, // their namespace, NOT the section's namespace
		Role:        auth.RoleNamespaceAdmin,
	}

	t.Run("namespace-admin cannot insert section_problem in foreign namespace", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, nsAdminUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		_, insertErr := conn.Exec(ctx, `
			INSERT INTO section_problems (section_id, problem_id, published_by)
			VALUES ($1, $2, $3)
		`, sectionID, uuid.New(), nsAdminID)
		if insertErr == nil {
			t.Error("expected forbidden error when namespace-admin inserts into foreign namespace section")
		} else if !isForbiddenPgError(insertErr) {
			t.Errorf("expected 42501 insufficient_privilege, got: %v", insertErr)
		}
	})

	t.Run("namespace-admin cannot update section_problem in foreign namespace", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, nsAdminUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		// RLS UPDATE uses USING clause: row is silently hidden, 0 rows affected.
		tag, updateErr := conn.Exec(ctx, `
			UPDATE section_problems SET show_solution = true
			WHERE section_id = $1 AND problem_id = $2
		`, sectionID, problemID)
		if updateErr != nil {
			t.Fatalf("unexpected error: %v", updateErr)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("expected 0 rows affected (RLS blocked update), got %d", tag.RowsAffected())
		}
	})

	t.Run("namespace-admin cannot delete section_problem in foreign namespace", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, nsAdminUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		// RLS DELETE uses USING clause: row is silently hidden, 0 rows affected.
		tag, deleteErr := conn.Exec(ctx, `
			DELETE FROM section_problems
			WHERE section_id = $1 AND problem_id = $2
		`, sectionID, problemID)
		if deleteErr != nil {
			t.Fatalf("unexpected error: %v", deleteErr)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("expected 0 rows affected (RLS blocked delete), got %d", tag.RowsAffected())
		}

		// Verify row still exists (superuser can still see it)
		var count int
		if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM section_problems WHERE section_id = $1 AND problem_id = $2`, sectionID, problemID).Scan(&count); err != nil {
			t.Fatalf("count section_problems: %v", err)
		}
		if count != 1 {
			t.Errorf("expected row to still exist after blocked delete, got count=%d", count)
		}
	})
}

// =============================================================================
// Test: section instructor CAN still manage section_problems for their section
// =============================================================================

func TestIntegration_Migration015_SectionInstructorCanManageSectionProblems(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor3@test.com", "instructor", db.nsID, "Instructor 3")

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "Instructor Class", instructorID)
	db.createSection(ctx, t, sectionID, db.nsID, classID, "Instructor Section", "INS015")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")

	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, db.nsID, "Instructor Problem", instructorID, nil, nil)

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instructor3@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	s, conn := db.storeWithRLS(ctx, t, instructorUser)
	defer conn.Release()

	t.Run("section instructor can create section_problem", func(t *testing.T) {
		sp, err := s.CreateSectionProblem(ctx, CreateSectionProblemParams{
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  instructorID,
			ShowSolution: false,
		})
		if err != nil {
			t.Fatalf("section instructor should be able to create section_problem: %v", err)
		}
		if sp.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sp.SectionID)
		}
	})

	t.Run("section instructor can update section_problem", func(t *testing.T) {
		showSolution := true
		sp, err := s.UpdateSectionProblem(ctx, sectionID, problemID, UpdateSectionProblemParams{
			ShowSolution: &showSolution,
		})
		if err != nil {
			t.Fatalf("section instructor should be able to update section_problem: %v", err)
		}
		if !sp.ShowSolution {
			t.Error("expected show_solution true after update")
		}
	})

	t.Run("section instructor can delete section_problem", func(t *testing.T) {
		err := s.DeleteSectionProblem(ctx, sectionID, problemID)
		if err != nil {
			t.Fatalf("section instructor should be able to delete section_problem: %v", err)
		}
	})
}

// =============================================================================
// Test: student is BLOCKED from mutation operations on section_problems
// =============================================================================

func TestIntegration_Migration015_StudentBlockedFromMutations(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor4@test.com", "instructor", db.nsID, "Instructor 4")
	db.createUserWithDisplayName(ctx, t, studentID, "student4@test.com", "student", db.nsID, "Student 4")

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "Student Test Class", instructorID)
	db.createSection(ctx, t, sectionID, db.nsID, classID, "Student Test Section", "STU015")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	db.createMembership(ctx, t, studentID, sectionID, "student")

	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, db.nsID, "Student Test Problem", instructorID, nil, nil)

	// Pre-insert a section_problem as superuser for update/delete tests
	_, err := db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by) VALUES ($1, $2, $3)`,
		sectionID, problemID, instructorID)
	if err != nil {
		t.Fatalf("pre-insert section_problem: %v", err)
	}

	studentUser := &auth.User{
		ID:          studentID,
		Email:       "student4@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("student cannot insert section_problem", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, studentUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		_, insertErr := conn.Exec(ctx, `
			INSERT INTO section_problems (section_id, problem_id, published_by)
			VALUES ($1, $2, $3)
		`, sectionID, uuid.New(), studentID)
		if insertErr == nil {
			t.Error("expected forbidden error when student inserts section_problem")
		} else if !isForbiddenPgError(insertErr) {
			t.Errorf("expected 42501 insufficient_privilege, got: %v", insertErr)
		}
	})

	t.Run("student cannot update section_problem", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, studentUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		// RLS UPDATE uses USING clause: row is silently hidden, 0 rows affected.
		tag, updateErr := conn.Exec(ctx, `
			UPDATE section_problems SET show_solution = true
			WHERE section_id = $1 AND problem_id = $2
		`, sectionID, problemID)
		if updateErr != nil {
			t.Fatalf("unexpected error: %v", updateErr)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("expected 0 rows affected (RLS blocked student update), got %d", tag.RowsAffected())
		}
	})

	t.Run("student cannot delete section_problem", func(t *testing.T) {
		conn, err := db.appPool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquire connection: %v", err)
		}
		defer conn.Release()

		if err := db.setRLSContext(ctx, conn, studentUser); err != nil {
			t.Fatalf("set RLS context: %v", err)
		}

		// RLS DELETE uses USING clause: row is silently hidden, 0 rows affected.
		tag, deleteErr := conn.Exec(ctx, `
			DELETE FROM section_problems
			WHERE section_id = $1 AND problem_id = $2
		`, sectionID, problemID)
		if deleteErr != nil {
			t.Fatalf("unexpected error: %v", deleteErr)
		}
		if tag.RowsAffected() != 0 {
			t.Errorf("expected 0 rows affected (RLS blocked student delete), got %d", tag.RowsAffected())
		}

		// Verify row still exists (superuser can still see it)
		var count int
		if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM section_problems WHERE section_id = $1 AND problem_id = $2`, sectionID, problemID).Scan(&count); err != nil {
			t.Fatalf("count section_problems: %v", err)
		}
		if count != 1 {
			t.Errorf("expected row to still exist after blocked delete, got count=%d", count)
		}
	})
}
