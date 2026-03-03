// Integration tests for migration 018: language field on problems table.
//
// Verifies:
//   - New problems get language field stored and retrieved correctly
//   - Existing rows default to 'python' after migration
//   - CreateProblem stores language and returns it
//   - UpdateProblem stores language and returns it
//   - GetProblem returns language field
//   - ListProblems returns language field
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration018
package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

func TestIntegration_Migration018_LanguageField(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author-lang@test.com", "instructor", nsID)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author-lang@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("CreateProblem with python language stores and returns language", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		p, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "Python Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "python",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}
		if p.Language != "python" {
			t.Errorf("expected language 'python', got %q", p.Language)
		}
	})

	t.Run("CreateProblem with java language stores and returns language", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		p, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "Java Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "java",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}
		if p.Language != "java" {
			t.Errorf("expected language 'java', got %q", p.Language)
		}
	})

	t.Run("existing problem inserted without language defaults to python", func(t *testing.T) {
		// Insert directly using the helper (which does not include the language column)
		// to simulate a pre-migration row.
		problemID := uuid.New()
		db.createProblem(ctx, t, problemID, nsID, "Old Python Problem", authorID, nil, nil)

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		p, err := s.GetProblem(ctx, problemID)
		if err != nil {
			t.Fatalf("GetProblem failed: %v", err)
		}
		if p.Language != "python" {
			t.Errorf("expected default language 'python' for old row, got %q", p.Language)
		}
	})

	t.Run("GetProblem returns language field", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		created, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "Get Lang Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "java",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}

		got, err := s.GetProblem(ctx, created.ID)
		if err != nil {
			t.Fatalf("GetProblem failed: %v", err)
		}
		if got.Language != "java" {
			t.Errorf("expected language 'java', got %q", got.Language)
		}
	})

	t.Run("UpdateProblem with language stores and returns updated language", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		created, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "Update Lang Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "python",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}
		if created.Language != "python" {
			t.Fatalf("expected initial language 'python', got %q", created.Language)
		}

		lang := "java"
		updated, err := s.UpdateProblem(ctx, created.ID, UpdateProblemParams{
			Language: &lang,
		})
		if err != nil {
			t.Fatalf("UpdateProblem failed: %v", err)
		}
		if updated.Language != "java" {
			t.Errorf("expected updated language 'java', got %q", updated.Language)
		}
	})

	t.Run("UpdateProblem with nil language leaves language unchanged", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		created, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "No Change Lang Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "java",
		})
		if err != nil {
			t.Fatalf("CreateProblem failed: %v", err)
		}

		newTitle := "No Change Lang Problem Updated"
		updated, err := s.UpdateProblem(ctx, created.ID, UpdateProblemParams{
			Title: &newTitle,
			// Language is nil — should not change
		})
		if err != nil {
			t.Fatalf("UpdateProblem failed: %v", err)
		}
		if updated.Language != "java" {
			t.Errorf("expected language to remain 'java', got %q", updated.Language)
		}
	})

	t.Run("ListProblems returns language field for each problem", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		// Create problems with different languages
		_, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "List Python Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "python",
		})
		if err != nil {
			t.Fatalf("CreateProblem (python) failed: %v", err)
		}

		_, err = s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID:       nsID,
			Title:             "List Java Problem",
			TestCases:         []byte(`{}`),
			ExecutionSettings: []byte(`{}`),
			AuthorID:          authorID,
			Language:          "java",
		})
		if err != nil {
			t.Fatalf("CreateProblem (java) failed: %v", err)
		}

		problems, err := s.ListProblems(ctx, nil)
		if err != nil {
			t.Fatalf("ListProblems failed: %v", err)
		}

		langCount := map[string]int{}
		for _, p := range problems {
			if p.Language == "" {
				t.Errorf("problem %s has empty language field", p.ID)
			}
			langCount[p.Language]++
		}
		if langCount["python"] == 0 {
			t.Error("expected at least one python problem in list")
		}
		if langCount["java"] == 0 {
			t.Error("expected at least one java problem in list")
		}
	})
}
