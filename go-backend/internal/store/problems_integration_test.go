// Integration tests for GetPublicProblem and ListProblemsFiltered store operations.
//
// These tests validate the SQL query with a real Postgres instance,
// including the LEFT JOIN on classes, the SECURITY DEFINER author name function,
// test_cases parsing, and tags nil-coercion logic.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_GetPublicProblem
package store

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// createProblemWithTestCasesAndLang inserts a problem with an explicit test_cases JSON
// and language value. Used to test the new fields on PublicProblem.
func (db *integrationDB) createProblemWithTestCasesAndLang(ctx context.Context, t *testing.T, id uuid.UUID, nsID, title string, authorID uuid.UUID, classID *uuid.UUID, tags []string, testCasesJSON string, lang string) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO problems (id, namespace_id, title, author_id, class_id, tags, test_cases, language)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
		id, nsID, title, authorID, classID, tags, testCasesJSON, lang)
	if err != nil {
		t.Fatalf("create problem with test cases %s: %v", title, err)
	}
}

func TestIntegration_GetPublicProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	// Author with a display_name set (used to test author_name field).
	authorID := uuid.New()
	db.createUserWithDisplayName(ctx, t, authorID, "author-public@test.com", "instructor", nsID, "Ada Lovelace")

	// Author with no display_name (used to test null author_name).
	authorNoNameID := uuid.New()
	db.createUser(ctx, t, authorNoNameID, "author-noname@test.com", "instructor", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	// Problem with a class and tags and io+pytest test cases.
	ioTestCasesJSON := `[
		{"kind":"io","name":"basic","input":"1 2\n","expected_output":"3\n","match_type":"exact","order":0},
		{"kind":"pytest","target_path":"test_solution.py","test_code":"def test_foo(): pass"}
	]`
	problemWithClassID := uuid.New()
	db.createProblemWithTestCasesAndLang(ctx, t, problemWithClassID, nsID, "Problem With Class", authorID, &classID, []string{"arrays", "easy"}, ioTestCasesJSON, "python")

	// Problem without a class and no tags, author has no display_name.
	problemNoClassID := uuid.New()
	db.createProblem(ctx, t, problemNoClassID, nsID, "Problem Without Class", authorNoNameID, nil, nil)

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

	t.Run("author_name returns display_name when set", func(t *testing.T) {
		// Verifies the SECURITY DEFINER function returns display_name (not email).
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemWithClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}
		if pp.AuthorName == nil {
			t.Fatal("expected author_name to be non-nil when display_name is set")
		}
		if *pp.AuthorName != "Ada Lovelace" {
			t.Errorf("expected author_name 'Ada Lovelace', got %q", *pp.AuthorName)
		}
		// Must not contain the author's email address.
		serialized, _ := json.Marshal(pp)
		if strings.Contains(string(serialized), "@") {
			t.Errorf("serialized public problem must not contain '@' (email leak): %s", string(serialized))
		}
	})

	t.Run("author_name is null when display_name is not set (no email fallback)", func(t *testing.T) {
		// Verifies that when display_name is NULL, author_name is null, never the email.
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemNoClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}
		if pp.AuthorName != nil {
			t.Errorf("expected author_name to be nil when display_name is not set, got %q", *pp.AuthorName)
		}
		// Serialized form must not contain any email address substring.
		serialized, _ := json.Marshal(pp)
		if strings.Contains(string(serialized), "@") {
			t.Errorf("serialized public problem must not contain '@' (email fallback leak): %s", string(serialized))
		}
		if strings.Contains(string(serialized), "author-noname") {
			t.Errorf("serialized public problem must not contain email prefix: %s", string(serialized))
		}
	})

	t.Run("test_cases: io summary is first stdin line, pytest summary is target_path", func(t *testing.T) {
		// Verifies the input-side-only test case summary mapping.
		// io: Summary = first line of Input (strips trailing content after newline).
		// pytest: Summary = TargetPath; expected_output and test_code must not appear.
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemWithClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}
		if len(pp.TestCases) != 2 {
			t.Fatalf("expected 2 test_cases, got %d: %v", len(pp.TestCases), pp.TestCases)
		}
		ioCase := pp.TestCases[0]
		if ioCase.Kind != "io" {
			t.Errorf("expected first test case kind 'io', got %q", ioCase.Kind)
		}
		if ioCase.Name != "basic" {
			t.Errorf("expected io case name 'basic', got %q", ioCase.Name)
		}
		// Input is "1 2\n" — first line is "1 2".
		if ioCase.Summary != "1 2" {
			t.Errorf("expected io summary '1 2' (first line of input), got %q", ioCase.Summary)
		}
		pytestCase := pp.TestCases[1]
		if pytestCase.Kind != "pytest" {
			t.Errorf("expected second test case kind 'pytest', got %q", pytestCase.Kind)
		}
		if pytestCase.Summary != "test_solution.py" {
			t.Errorf("expected pytest summary 'test_solution.py' (target_path), got %q", pytestCase.Summary)
		}
		// Serialized summaries must never contain expected_output, test_code, or input.
		serialized, _ := json.Marshal(pp.TestCases)
		for _, forbidden := range []string{"expected_output", "test_code", "3\n"} {
			if strings.Contains(string(serialized), forbidden) {
				t.Errorf("test_cases summary must not contain %q (output leak): %s", forbidden, string(serialized))
			}
		}
	})

	t.Run("language and updated_at are present", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		pp, err := s.GetPublicProblem(ctx, problemWithClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem failed: %v", err)
		}
		if pp.Language != "python" {
			t.Errorf("expected language 'python', got %q", pp.Language)
		}
		if pp.UpdatedAt.IsZero() {
			t.Error("expected non-zero updated_at")
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

	t.Run("works under public RLS context (eval_app + app.role=public)", func(t *testing.T) {
		// Verify GetPublicProblem works when only app.role = 'public' is set,
		// with no user_id or namespace_id — matching PublicStoreMiddleware.
		// Also verifies that the SECURITY DEFINER function returns author_name
		// correctly under the public RLS context (where direct users SELECT returns 0 rows).
		s, conn := db.storeWithPublicRLS(ctx, t)
		defer conn.Release()

		got, err := s.GetPublicProblem(ctx, problemWithClassID)
		if err != nil {
			t.Fatalf("GetPublicProblem under public RLS: %v", err)
		}
		if got.Title != "Problem With Class" {
			t.Errorf("expected title 'Problem With Class', got %q", got.Title)
		}
		if got.ClassID == nil {
			t.Fatal("expected class_id to be non-nil")
		}
		if *got.ClassID != classID {
			t.Errorf("expected class_id %s, got %s", classID, *got.ClassID)
		}
		if got.ClassName == nil {
			t.Fatal("expected class_name to be non-nil (LEFT JOIN on classes must work under public context)")
		}
		if *got.ClassName != "CS101" {
			t.Errorf("expected class_name 'CS101', got %q", *got.ClassName)
		}
		// The SECURITY DEFINER function must return author_name under public RLS.
		if got.AuthorName == nil {
			t.Fatal("expected author_name to be non-nil under public RLS (SECURITY DEFINER function must work)")
		}
		if *got.AuthorName != "Ada Lovelace" {
			t.Errorf("expected author_name 'Ada Lovelace' under public RLS, got %q", *got.AuthorName)
		}
		// test_cases summaries must be present under public RLS.
		if len(got.TestCases) != 2 {
			t.Errorf("expected 2 test_cases under public RLS, got %d", len(got.TestCases))
		}
	})

	t.Run("public RLS context cannot read other tables", func(t *testing.T) {
		// Verify that the public RLS context (eval_app + app.role='public') is
		// blocked from reading sensitive tables not covered by migration 016's
		// policies. Only problems and classes have SELECT policies under this
		// context, so querying users should return 0 rows.
		_, conn := db.storeWithPublicRLS(ctx, t)
		defer conn.Release()

		var count int
		err := conn.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&count)
		// With RLS enabled, the query succeeds but returns 0 rows (no matching policy).
		if err != nil {
			t.Fatalf("unexpected error querying users under public RLS context: %v", err)
		}
		if count != 0 {
			t.Errorf("expected 0 users under public RLS context, got %d", count)
		}
	})
}

// TestIntegration_ListProblemsFiltered_TestCounts verifies that ListProblemsFiltered
// populates TestCounts correctly for problems with mixed io+pytest cases and {0,0}
// for nil test_cases.
func TestIntegration_ListProblemsFiltered_TestCounts(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "tc-author@test.com", "instructor", nsID)

	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "TCClass", authorID)

	// Problem with 2 io + 1 pytest test cases.
	mixedJSON := `[
		{"kind":"io","name":"t1","input":"a","expected_output":"b","match_type":"exact","order":0},
		{"kind":"io","name":"t2","input":"c","expected_output":"d","match_type":"exact","order":1},
		{"kind":"pytest","target_path":"test_foo.py","test_code":"def test_x(): pass"}
	]`
	mixedID := uuid.New()
	db.createProblemWithTestCasesAndLang(ctx, t, mixedID, nsID, "Mixed Tests Problem", authorID, &classID, nil, mixedJSON, "python")

	// Problem with empty test_cases (default, nil → {0,0}).
	emptyID := uuid.New()
	db.createProblem(ctx, t, emptyID, nsID, "Empty Tests Problem", authorID, &classID, nil)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "tc-author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("mixed io+pytest problem has correct test_counts", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		problems, err := s.ListProblemsFiltered(ctx, ProblemFilters{ClassID: &classID})
		if err != nil {
			t.Fatalf("ListProblemsFiltered failed: %v", err)
		}

		var found *Problem
		for i := range problems {
			if problems[i].ID == mixedID {
				found = &problems[i]
				break
			}
		}
		if found == nil {
			t.Fatal("mixed tests problem not found in list")
		}
		if found.TestCounts == nil {
			t.Fatal("expected TestCounts to be non-nil for problem with test cases")
		}
		if found.TestCounts.IO != 2 {
			t.Errorf("expected IO count 2, got %d", found.TestCounts.IO)
		}
		if found.TestCounts.Pytest != 1 {
			t.Errorf("expected Pytest count 1, got %d", found.TestCounts.Pytest)
		}
	})

	t.Run("problem with no test cases has test_counts {0,0}", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		problems, err := s.ListProblemsFiltered(ctx, ProblemFilters{ClassID: &classID})
		if err != nil {
			t.Fatalf("ListProblemsFiltered failed: %v", err)
		}

		var found *Problem
		for i := range problems {
			if problems[i].ID == emptyID {
				found = &problems[i]
				break
			}
		}
		if found == nil {
			t.Fatal("empty tests problem not found in list")
		}
		if found.TestCounts == nil {
			t.Fatal("expected TestCounts to be non-nil even for problem with no test cases")
		}
		if found.TestCounts.IO != 0 {
			t.Errorf("expected IO count 0, got %d", found.TestCounts.IO)
		}
		if found.TestCounts.Pytest != 0 {
			t.Errorf("expected Pytest count 0, got %d", found.TestCounts.Pytest)
		}
	})
}
