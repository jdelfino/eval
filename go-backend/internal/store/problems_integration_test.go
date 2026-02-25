// Integration tests for GetPublicProblem store operation.
//
// These tests validate the SQL query with a real Postgres instance,
// including the LEFT JOIN on classes and tags nil-coercion logic.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_GetPublicProblem
package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

func TestIntegration_GetPublicProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author-public@test.com", "instructor", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	// Problem with a class and tags
	problemWithClassID := uuid.New()
	db.createProblem(ctx, t, problemWithClassID, nsID, "Problem With Class", authorID, &classID, []string{"arrays", "easy"})

	// Problem without a class and no tags
	problemNoClassID := uuid.New()
	db.createProblem(ctx, t, problemNoClassID, nsID, "Problem Without Class", authorID, nil, nil)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author-public@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("happy path: returns correct fields including class_name from JOIN", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemWithClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}

		if pp.ID != problemWithClassID {
			t.Errorf("expected id %s, got %s", problemWithClassID, pp.ID)
		}
		if pp.Title != "Problem With Class" {
			t.Errorf("expected title 'Problem With Class', got %q", pp.Title)
		}
		if pp.ClassID == nil {
			t.Fatal("expected class_id to be non-nil")
		}
		if *pp.ClassID != classID {
			t.Errorf("expected class_id %s, got %s", classID, *pp.ClassID)
		}
		if pp.ClassName == nil {
			t.Fatal("expected class_name to be non-nil")
		}
		if *pp.ClassName != "CS101" {
			t.Errorf("expected class_name 'CS101', got %q", *pp.ClassName)
		}
		if len(pp.Tags) != 2 {
			t.Errorf("expected 2 tags, got %d: %v", len(pp.Tags), pp.Tags)
		}
	})

	t.Run("problem without a class: class_name is nil", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemNoClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}

		if pp.ID != problemNoClassID {
			t.Errorf("expected id %s, got %s", problemNoClassID, pp.ID)
		}
		if pp.ClassID != nil {
			t.Errorf("expected class_id to be nil, got %s", *pp.ClassID)
		}
		if pp.ClassName != nil {
			t.Errorf("expected class_name to be nil, got %q", *pp.ClassName)
		}
	})

	t.Run("non-existent problem: returns ErrNotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetPublicProblem(ctx, uuid.New())
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("tags nil coercion: no tags returns empty slice, not nil", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemNoClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}

		if pp.Tags == nil {
			t.Error("expected non-nil tags slice for problem with no tags, got nil")
		}
		if len(pp.Tags) != 0 {
			t.Errorf("expected empty tags slice, got %v", pp.Tags)
		}
	})
}
