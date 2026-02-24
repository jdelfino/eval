package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockRevisionRepo implements store.RevisionRepository for testing.
type mockRevisionRepo struct {
	listRevisionsFn  func(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]store.Revision, error)
	createRevisionFn func(ctx context.Context, params store.CreateRevisionParams) (*store.Revision, error)
}

func (m *mockRevisionRepo) ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]store.Revision, error) {
	return m.listRevisionsFn(ctx, sessionID, userID)
}

func (m *mockRevisionRepo) CreateRevision(ctx context.Context, params store.CreateRevisionParams) (*store.Revision, error) {
	return m.createRevisionFn(ctx, params)
}

// revisionTestRepos embeds stubRepos and overrides revision methods.
type revisionTestRepos struct {
	stubRepos
	rev *mockRevisionRepo
}

var _ store.Repos = (*revisionTestRepos)(nil)

func (r *revisionTestRepos) ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]store.Revision, error) {
	return r.rev.ListRevisions(ctx, sessionID, userID)
}
func (r *revisionTestRepos) CreateRevision(ctx context.Context, params store.CreateRevisionParams) (*store.Revision, error) {
	return r.rev.CreateRevision(ctx, params)
}

func revisionRepos(repo *mockRevisionRepo) *revisionTestRepos {
	return &revisionTestRepos{rev: repo}
}

func testRevision() *store.Revision {
	code := "fmt.Println(\"hello\")"
	sessionID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	return &store.Revision{
		ID:              uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		NamespaceID:     "test-ns",
		SessionID:       &sessionID,
		UserID:          uuid.MustParse("33333333-3333-3333-3333-333333333333"),
		Timestamp:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		IsDiff:          false,
		FullCode:        &code,
		ExecutionResult: json.RawMessage(`{"passed":true}`),
	}
}

func revisionRouteCtx(sessionID string) context.Context {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("sessionID", sessionID)
	return context.WithValue(context.Background(), chi.RouteCtxKey, rctx)
}

func TestListRevisions_Success(t *testing.T) {
	rev := testRevision()
	repo := &mockRevisionRepo{
		listRevisionsFn: func(_ context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]store.Revision, error) {
			if rev.SessionID == nil || sessionID != *rev.SessionID {
				t.Fatalf("unexpected sessionID: %v", sessionID)
			}
			if userID != nil {
				t.Fatalf("expected nil userID, got %v", userID)
			}
			return []store.Revision{*rev}, nil
		},
	}

	h := NewRevisionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx(rev.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Revision
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 revision, got %d", len(got))
	}
	if got[0].ID != rev.ID {
		t.Errorf("expected id %q, got %q", rev.ID, got[0].ID)
	}
}

func TestListRevisions_WithUserIDFilter(t *testing.T) {
	rev := testRevision()
	filterUserID := uuid.MustParse("44444444-4444-4444-4444-444444444444")

	repo := &mockRevisionRepo{
		listRevisionsFn: func(_ context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]store.Revision, error) {
			if rev.SessionID == nil || sessionID != *rev.SessionID {
				t.Fatalf("unexpected sessionID: %v", sessionID)
			}
			if userID == nil {
				t.Fatalf("expected userID filter, got nil")
			}
			if *userID != filterUserID {
				t.Fatalf("expected userID %v, got %v", filterUserID, *userID)
			}
			return []store.Revision{*rev}, nil
		},
	}

	h := NewRevisionHandler()
	req := httptest.NewRequest(http.MethodGet, "/?user_id="+filterUserID.String(), nil)
	ctx := revisionRouteCtx(rev.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestListRevisions_InvalidSessionID(t *testing.T) {
	repo := &mockRevisionRepo{}
	h := NewRevisionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx("not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListRevisions_InvalidUserID(t *testing.T) {
	repo := &mockRevisionRepo{}
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/?user_id=not-a-uuid", nil)
	ctx := revisionRouteCtx(sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListRevisions_Empty(t *testing.T) {
	repo := &mockRevisionRepo{
		listRevisionsFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) ([]store.Revision, error) {
			return nil, nil
		},
	}

	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListRevisions_InternalError(t *testing.T) {
	repo := &mockRevisionRepo{
		listRevisionsFn: func(_ context.Context, _ uuid.UUID, _ *uuid.UUID) ([]store.Revision, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestCreateRevision_Success(t *testing.T) {
	rev := testRevision()
	userID := rev.UserID

	repo := &mockRevisionRepo{
		createRevisionFn: func(_ context.Context, params store.CreateRevisionParams) (*store.Revision, error) {
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			if params.SessionID == nil || rev.SessionID == nil || *params.SessionID != *rev.SessionID {
				t.Fatalf("unexpected session_id: %v", params.SessionID)
			}
			if params.UserID != userID {
				t.Fatalf("unexpected user_id: %v", params.UserID)
			}
			if params.IsDiff {
				t.Fatalf("expected is_diff false")
			}
			return rev, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"full_code":        "fmt.Println(\"hello\")",
		"is_diff":          false,
		"execution_result": json.RawMessage(`{"passed":true}`),
	})

	h := NewRevisionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := revisionRouteCtx(rev.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{
		ID:          userID,
		Role:        auth.RoleStudent,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Revision
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != rev.ID {
		t.Errorf("expected id %q, got %q", rev.ID, got.ID)
	}
}

func TestCreateRevision_Unauthorized(t *testing.T) {
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateRevision_InvalidSessionID(t *testing.T) {
	h := NewRevisionHandler()
	body, _ := json.Marshal(map[string]any{"full_code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := revisionRouteCtx("not-a-uuid")
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent, NamespaceID: "test-ns"})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateRevision_InvalidBody(t *testing.T) {
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := revisionRouteCtx(sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent, NamespaceID: "test-ns"})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateRevision_InternalError(t *testing.T) {
	repo := &mockRevisionRepo{
		createRevisionFn: func(_ context.Context, _ store.CreateRevisionParams) (*store.Revision, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{
		"full_code": "x",
	})

	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := revisionRouteCtx(sessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent, NamespaceID: "test-ns"})
	ctx = store.WithRepos(ctx, revisionRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestListRevisions_Unauthorized(t *testing.T) {
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	// No auth user in context
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResp["error"] != "authentication required" {
		t.Errorf("expected error %q, got %q", "authentication required", errResp["error"])
	}
}

func TestListRevisions_Unauthorized_NoStoreCall(t *testing.T) {
	// Verify that the handler short-circuits on missing auth user
	// and never calls the store (no repos needed in context).
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	// No auth user AND no repos in context — should not panic
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateRevision_Unauthorized_ErrorBody(t *testing.T) {
	h := NewRevisionHandler()
	sessionID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	ctx := revisionRouteCtx(sessionID.String())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&errResp); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if errResp["error"] != "authentication required" {
		t.Errorf("expected error %q, got %q", "authentication required", errResp["error"])
	}
}
