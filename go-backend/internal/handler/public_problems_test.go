package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockPublicProblemRepo implements a mock for GetPublicProblem.
type mockPublicProblemRepo struct {
	getPublicProblemFn func(ctx context.Context, id uuid.UUID) (*store.PublicProblem, error)
}

// publicProblemTestRepos embeds stubRepos and overrides GetPublicProblem.
type publicProblemTestRepos struct {
	stubRepos
	pub *mockPublicProblemRepo
}

var _ store.Repos = (*publicProblemTestRepos)(nil)

func (r *publicProblemTestRepos) GetPublicProblem(ctx context.Context, id uuid.UUID) (*store.PublicProblem, error) {
	return r.pub.getPublicProblemFn(ctx, id)
}

func publicProblemRepos(mock *mockPublicProblemRepo) *publicProblemTestRepos {
	return &publicProblemTestRepos{pub: mock}
}

func testPublicProblem() *store.PublicProblem {
	desc := "Write a function that adds two numbers"
	starter := "func add(a, b int) int {\n\treturn 0\n}"
	authorName := "Ada Lovelace"
	classID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	className := "Intro CS"
	return &store.PublicProblem{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		Title:       "Two Sum",
		Description: &desc,
		StarterCode: &starter,
		ClassID:     &classID,
		ClassName:   &className,
		Tags:        []string{"algorithms", "arrays"},
		AuthorName:  &authorName,
		UpdatedAt:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Language:    "python",
		TestCases: []store.PublicTestCaseSummary{
			{Kind: "io", Name: "basic add", Summary: "1 2"},
			{Kind: "io", Name: "zeros", Summary: ""},
		},
	}
}

func TestGetPublicProblem_Success(t *testing.T) {
	p := testPublicProblem()
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, id uuid.UUID) (*store.PublicProblem, error) {
			if id != p.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return p, nil
		},
	}

	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.PublicProblem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != p.ID {
		t.Errorf("expected id %q, got %q", p.ID, got.ID)
	}
	if got.Title != p.Title {
		t.Errorf("expected title %q, got %q", p.Title, got.Title)
	}
}

func TestGetPublicProblem_EmptyTags(t *testing.T) {
	p := testPublicProblem()
	p.Tags = []string{} // explicitly empty
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, id uuid.UUID) (*store.PublicProblem, error) {
			return p, nil
		},
	}

	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.PublicProblem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Tags must serialize as [] not null
	if got.Tags == nil {
		t.Error("expected tags to be [] not null")
	}
}

func TestGetPublicProblem_NotFound(t *testing.T) {
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, _ uuid.UUID) (*store.PublicProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetPublicProblem_InvalidID(t *testing.T) {
	mock := &mockPublicProblemRepo{}
	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestGetPublicProblem_InternalError(t *testing.T) {
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, _ uuid.UUID) (*store.PublicProblem, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

// TestGetPublicProblem_NoSensitiveFields verifies the public problem endpoint
// never leaks solution, execution settings, author identity beyond display_name,
// or any test case output/body fields.
//
// Contract: response must not contain solution, execution_settings, author_id,
// or namespace_id. test_cases is now a legitimate public field but must only
// contain kind/name/summary keys. The raw JSON must not contain expected_output,
// test_code, or input substrings anywhere, and must not contain any '@'-address.
func TestGetPublicProblem_NoSensitiveFields(t *testing.T) {
	p := testPublicProblem()
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, id uuid.UUID) (*store.PublicProblem, error) {
			return p, nil
		},
	}

	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()

	var rawResponse map[string]json.RawMessage
	if err := json.Unmarshal([]byte(body), &rawResponse); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// Absolutely forbidden top-level fields.
	for _, forbidden := range []string{"solution", "execution_settings", "author_id", "namespace_id"} {
		if _, ok := rawResponse[forbidden]; ok {
			t.Errorf("response must not include field %q (solution leak or sensitive field)", forbidden)
		}
	}

	// test_cases is now public but must only contain kind/name/summary.
	if tcRaw, ok := rawResponse["test_cases"]; ok {
		var entries []map[string]json.RawMessage
		if err := json.Unmarshal(tcRaw, &entries); err != nil {
			t.Fatalf("test_cases is not a JSON array: %v", err)
		}
		for i, entry := range entries {
			for key := range entry {
				switch key {
				case "kind", "name", "summary":
					// allowed
				default:
					t.Errorf("test_cases[%d] must not contain key %q", i, key)
				}
			}
		}
	}

	// Raw response body must contain no output-revealing or identity-leaking substrings.
	for _, forbidden := range []string{"expected_output", "test_code"} {
		if strings.Contains(body, forbidden) {
			t.Errorf("response body must not contain %q (test output leak)", forbidden)
		}
	}
	// Must not expose any email address (@ sign in a value context).
	// The fixture author name "Ada Lovelace" has no @; fixture email is never set.
	if strings.Contains(body, "@") {
		t.Errorf("response body must not contain '@' (email leak in public payload)")
	}

	// Must include expected public fields.
	for _, expected := range []string{"id", "title", "author_name", "updated_at", "language", "test_cases"} {
		if _, ok := rawResponse[expected]; !ok {
			t.Errorf("response should include field %q", expected)
		}
	}
}

// TestGetPublicProblem_NewFields verifies that author_name, updated_at, language,
// and test_cases are present and correctly typed in the response.
func TestGetPublicProblem_NewFields(t *testing.T) {
	p := testPublicProblem()
	mock := &mockPublicProblemRepo{
		getPublicProblemFn: func(_ context.Context, _ uuid.UUID) (*store.PublicProblem, error) {
			return p, nil
		},
	}

	h := NewPublicProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, publicProblemRepos(mock))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.PublicProblem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if got.AuthorName == nil {
		t.Fatal("expected author_name to be non-nil")
	}
	if *got.AuthorName != "Ada Lovelace" {
		t.Errorf("expected author_name 'Ada Lovelace', got %q", *got.AuthorName)
	}
	if got.Language != "python" {
		t.Errorf("expected language 'python', got %q", got.Language)
	}
	if got.UpdatedAt.IsZero() {
		t.Error("expected non-zero updated_at")
	}
	if len(got.TestCases) != 2 {
		t.Errorf("expected 2 test_cases, got %d", len(got.TestCases))
	}
	for i, tc := range got.TestCases {
		if tc.Kind == "" {
			t.Errorf("test_cases[%d].kind must not be empty", i)
		}
	}
}
