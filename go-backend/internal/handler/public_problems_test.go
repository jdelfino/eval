package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

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
	sol := "func add(a, b int) int {\n\treturn a + b\n}"
	classID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	className := "Intro CS"
	return &store.PublicProblem{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		Title:       "Two Sum",
		Description: &desc,
		Solution:    &sol,
		StarterCode: &starter,
		ClassID:     &classID,
		ClassName:   &className,
		Tags:        []string{"algorithms", "arrays"},
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

	var rawResponse map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&rawResponse); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// Must NOT include sensitive fields from Problem
	for _, forbidden := range []string{"test_cases", "execution_settings", "author_id", "namespace_id"} {
		if _, ok := rawResponse[forbidden]; ok {
			t.Errorf("response should not include field %q", forbidden)
		}
	}

	// Must include expected public fields
	for _, expected := range []string{"id", "title"} {
		if _, ok := rawResponse[expected]; !ok {
			t.Errorf("response should include field %q", expected)
		}
	}
}
