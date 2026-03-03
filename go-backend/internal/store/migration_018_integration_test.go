// Integration tests for migration 018: language field on problems table.
//
// Verifies:
//   - New problems get language field stored and retrieved correctly
//   - Existing rows default to 'python' after migration
//   - CreateProblem stores language and returns it
//   - UpdateProblem stores language and returns it
//   - GetProblem returns language field
//   - ListProblems returns language field
//   - ListSectionProblems returns language field via joined query
//   - GetStudentWork returns language field via joined query
//   - ListStudentWorkForReview returns language field via joined query
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration018
package store

import (
	"context"
	"encoding/json"
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

// TestIntegration_Migration018_LanguageInJoinedQueries verifies that the language field
// is correctly scanned when problems are retrieved via joined queries in
// ListSectionProblems, GetStudentWork, and ListStudentWorkForReview.
// These are the queries updated in migration 018 to include p.language.
func TestIntegration_Migration018_LanguageInJoinedQueries(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-018j@test.com", "instructor", nsID)
	db.createUser(ctx, t, studentID, "stu-018j@test.com", "student", nsID)

	classID := uuid.New()
	sectionID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Lang Join Class", instructorID)
	db.createSection(ctx, t, sectionID, nsID, classID, "Lang Join Section", "018J")
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	db.createMembership(ctx, t, studentID, sectionID, "student")

	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "instr-018j@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}
	authStudent := &auth.User{
		ID:          studentID,
		Email:       "stu-018j@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	// Create a problem with 'java' language using the Store (not the raw INSERT helper,
	// which omits the language column and would default to 'python').
	setupConn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire setup connection: %v", err)
	}
	if err := db.setRLSContext(ctx, setupConn, authInstructor); err != nil {
		setupConn.Release()
		t.Fatalf("set RLS context: %v", err)
	}
	setupStore := New(setupConn)
	javaProblem, err := setupStore.CreateProblem(ctx, CreateProblemParams{
		NamespaceID:       nsID,
		Title:             "Java Join Problem",
		TestCases:         json.RawMessage(`{}`),
		ExecutionSettings: json.RawMessage(`{}`),
		AuthorID:          instructorID,
		Language:          "java",
	})
	setupConn.Release()
	if err != nil {
		t.Fatalf("CreateProblem failed: %v", err)
	}
	if javaProblem.Language != "java" {
		t.Fatalf("expected language 'java', got %q", javaProblem.Language)
	}
	javaProblemID := javaProblem.ID

	// Publish the problem to the section.
	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_problems (section_id, problem_id, published_by)
		 VALUES ($1, $2, $3)`,
		sectionID, javaProblemID, instructorID)
	if err != nil {
		t.Fatalf("insert section_problem: %v", err)
	}

	// Create student work for the java problem.
	studentWorkID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code, execution_settings)
		 VALUES ($1, $2, $3, $4, $5, 'System.out.println("hello");', '{}')`,
		studentWorkID, nsID, studentID, javaProblemID, sectionID)
	if err != nil {
		t.Fatalf("insert student_work: %v", err)
	}

	t.Run("ListSectionProblems returns language field from joined query", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		problems, err := s.ListSectionProblems(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListSectionProblems failed: %v", err)
		}

		var found bool
		for _, p := range problems {
			if p.ProblemID == javaProblemID {
				found = true
				if p.Problem.Language != "java" {
					t.Errorf("ListSectionProblems: expected language 'java' for problem %s, got %q",
						javaProblemID, p.Problem.Language)
				}
			}
		}
		if !found {
			t.Errorf("ListSectionProblems: java problem %s not found in results", javaProblemID)
		}
	})

	t.Run("GetStudentWork returns language field from joined query", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authStudent)
		defer conn.Release()

		swp, err := s.GetStudentWork(ctx, studentWorkID)
		if err != nil {
			t.Fatalf("GetStudentWork failed: %v", err)
		}
		if swp.Problem.Language != "java" {
			t.Errorf("GetStudentWork: expected language 'java', got %q", swp.Problem.Language)
		}
	})

	t.Run("ListStudentWorkForReview returns language field from joined query", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		summaries, err := s.ListStudentWorkForReview(ctx, sectionID, studentID)
		if err != nil {
			t.Fatalf("ListStudentWorkForReview failed: %v", err)
		}

		var found bool
		for _, summary := range summaries {
			if summary.Problem.ID == javaProblemID {
				found = true
				if summary.Problem.Language != "java" {
					t.Errorf("ListStudentWorkForReview: expected language 'java' for problem %s, got %q",
						javaProblemID, summary.Problem.Language)
				}
			}
		}
		if !found {
			t.Errorf("ListStudentWorkForReview: java problem %s not found in results", javaProblemID)
		}
	})
}
