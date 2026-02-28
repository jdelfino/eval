// Integration tests for PreviewRepository store methods.
//
// These tests validate the PreviewRepository methods against a real database,
// covering create/get/enroll/unenroll operations on preview_students.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Preview
package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// storeWithPool returns a *Store backed by the raw pool (no RLS role switching).
// PreviewRepository methods are pool-scoped and bypass RLS (they use the
// application's superuser/app connection directly).
func (db *integrationDB) storeWithPool(ctx context.Context, t *testing.T) *Store {
	t.Helper()
	return New(db.pool)
}

func TestIntegration_PreviewStore_CreatePreviewStudent(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "instructor@preview.test", "instructor", db.nsID)

	s := db.storeWithPool(ctx, t)

	t.Run("creates user and preview_students row", func(t *testing.T) {
		ps, err := s.CreatePreviewStudent(ctx, instructorID, db.nsID)
		if err != nil {
			t.Fatalf("CreatePreviewStudent: %v", err)
		}
		if ps == nil {
			t.Fatal("expected non-nil PreviewStudent")
		}
		if ps.InstructorID != instructorID {
			t.Errorf("InstructorID = %v, want %v", ps.InstructorID, instructorID)
		}
		if ps.StudentUserID == uuid.Nil {
			t.Error("StudentUserID should be non-nil")
		}
		if ps.CreatedAt.IsZero() {
			t.Error("CreatedAt should be non-zero")
		}

		// Verify the preview student user exists in the users table.
		var count int
		err = db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", ps.StudentUserID).Scan(&count)
		if err != nil {
			t.Fatalf("query users: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 user, got %d", count)
		}

		// Verify the preview_students row exists.
		var dbInstructorID uuid.UUID
		err = db.pool.QueryRow(ctx,
			"SELECT instructor_id FROM preview_students WHERE student_user_id = $1",
			ps.StudentUserID).Scan(&dbInstructorID)
		if err != nil {
			t.Fatalf("query preview_students: %v", err)
		}
		if dbInstructorID != instructorID {
			t.Errorf("instructor_id = %v, want %v", dbInstructorID, instructorID)
		}
	})
}

func TestIntegration_PreviewStore_GetPreviewStudent(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "instructor@preview.test", "instructor", db.nsID)

	s := db.storeWithPool(ctx, t)

	t.Run("not found when no preview student exists", func(t *testing.T) {
		_, err := s.GetPreviewStudent(ctx, instructorID)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})

	t.Run("returns preview student after creation", func(t *testing.T) {
		created, err := s.CreatePreviewStudent(ctx, instructorID, db.nsID)
		if err != nil {
			t.Fatalf("CreatePreviewStudent: %v", err)
		}

		got, err := s.GetPreviewStudent(ctx, instructorID)
		if err != nil {
			t.Fatalf("GetPreviewStudent: %v", err)
		}
		if got.InstructorID != instructorID {
			t.Errorf("InstructorID = %v, want %v", got.InstructorID, instructorID)
		}
		if got.StudentUserID != created.StudentUserID {
			t.Errorf("StudentUserID = %v, want %v", got.StudentUserID, created.StudentUserID)
		}
	})
}

func TestIntegration_PreviewStore_EnrollPreviewStudent(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "instructor@preview.test", "instructor", db.nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "CS101", instructorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, db.nsID, classID, "Section A", "PREV-ENROLL")

	s := db.storeWithPool(ctx, t)

	ps, err := s.CreatePreviewStudent(ctx, instructorID, db.nsID)
	if err != nil {
		t.Fatalf("CreatePreviewStudent: %v", err)
	}

	t.Run("enrolls preview student in section", func(t *testing.T) {
		err := s.EnrollPreviewStudent(ctx, ps.StudentUserID, sectionID)
		if err != nil {
			t.Fatalf("EnrollPreviewStudent: %v", err)
		}

		var count int
		err = db.pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM section_memberships WHERE user_id = $1 AND section_id = $2",
			ps.StudentUserID, sectionID).Scan(&count)
		if err != nil {
			t.Fatalf("query section_memberships: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 membership, got %d", count)
		}
	})

	t.Run("idempotent — enroll twice does not fail", func(t *testing.T) {
		// Already enrolled from previous sub-test.
		err := s.EnrollPreviewStudent(ctx, ps.StudentUserID, sectionID)
		if err != nil {
			t.Fatalf("EnrollPreviewStudent (second call): %v", err)
		}

		var count int
		err = db.pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM section_memberships WHERE user_id = $1 AND section_id = $2",
			ps.StudentUserID, sectionID).Scan(&count)
		if err != nil {
			t.Fatalf("query section_memberships: %v", err)
		}
		if count != 1 {
			t.Errorf("expected exactly 1 membership after double enroll, got %d", count)
		}
	})
}

func TestIntegration_PreviewStore_UnenrollPreviewStudent(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "instructor@preview.test", "instructor", db.nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "CS101", instructorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, db.nsID, classID, "Section A", "PREV-UNENROLL")

	s := db.storeWithPool(ctx, t)

	ps, err := s.CreatePreviewStudent(ctx, instructorID, db.nsID)
	if err != nil {
		t.Fatalf("CreatePreviewStudent: %v", err)
	}

	err = s.EnrollPreviewStudent(ctx, ps.StudentUserID, sectionID)
	if err != nil {
		t.Fatalf("EnrollPreviewStudent: %v", err)
	}

	t.Run("removes the membership", func(t *testing.T) {
		err := s.UnenrollPreviewStudent(ctx, ps.StudentUserID, sectionID)
		if err != nil {
			t.Fatalf("UnenrollPreviewStudent: %v", err)
		}

		var count int
		err = db.pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM section_memberships WHERE user_id = $1 AND section_id = $2",
			ps.StudentUserID, sectionID).Scan(&count)
		if err != nil {
			t.Fatalf("query section_memberships: %v", err)
		}
		if count != 0 {
			t.Errorf("expected 0 memberships after unenroll, got %d", count)
		}
	})

	t.Run("no-op when not enrolled", func(t *testing.T) {
		// Already unenrolled — should not error.
		err := s.UnenrollPreviewStudent(ctx, ps.StudentUserID, sectionID)
		if err != nil {
			t.Fatalf("UnenrollPreviewStudent (already unenrolled): %v", err)
		}
	})
}

func TestIntegration_PreviewStore_UnenrollPreviewStudentFromOtherSections(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "instructor@preview.test", "instructor", db.nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, db.nsID, "CS101", instructorID)
	sectionA := uuid.New()
	db.createSection(ctx, t, sectionA, db.nsID, classID, "Section A", "PREV-OTHER-A")
	sectionB := uuid.New()
	db.createSection(ctx, t, sectionB, db.nsID, classID, "Section B", "PREV-OTHER-B")
	sectionC := uuid.New()
	db.createSection(ctx, t, sectionC, db.nsID, classID, "Section C", "PREV-OTHER-C")

	s := db.storeWithPool(ctx, t)

	ps, err := s.CreatePreviewStudent(ctx, instructorID, db.nsID)
	if err != nil {
		t.Fatalf("CreatePreviewStudent: %v", err)
	}

	// Enroll in A, B, C.
	for _, secID := range []uuid.UUID{sectionA, sectionB, sectionC} {
		if err := s.EnrollPreviewStudent(ctx, ps.StudentUserID, secID); err != nil {
			t.Fatalf("EnrollPreviewStudent: %v", err)
		}
	}

	t.Run("removes enrollments from other sections, keeps the keep section", func(t *testing.T) {
		err := s.UnenrollPreviewStudentFromOtherSections(ctx, ps.StudentUserID, sectionA)
		if err != nil {
			t.Fatalf("UnenrollPreviewStudentFromOtherSections: %v", err)
		}

		// sectionA should remain.
		var countA int
		if err := db.pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM section_memberships WHERE user_id = $1 AND section_id = $2",
			ps.StudentUserID, sectionA).Scan(&countA); err != nil {
			t.Fatalf("query sectionA: %v", err)
		}
		if countA != 1 {
			t.Errorf("expected 1 membership in sectionA (keep), got %d", countA)
		}

		// sectionB and sectionC should be gone.
		var countOther int
		if err := db.pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM section_memberships WHERE user_id = $1 AND section_id != $2",
			ps.StudentUserID, sectionA).Scan(&countOther); err != nil {
			t.Fatalf("query other sections: %v", err)
		}
		if countOther != 0 {
			t.Errorf("expected 0 memberships in other sections, got %d", countOther)
		}
	})

	t.Run("no-op when only enrolled in the keep section", func(t *testing.T) {
		// Already only in sectionA — should not fail.
		err := s.UnenrollPreviewStudentFromOtherSections(ctx, ps.StudentUserID, sectionA)
		if err != nil {
			t.Fatalf("UnenrollPreviewStudentFromOtherSections (only keep section): %v", err)
		}
	})
}
