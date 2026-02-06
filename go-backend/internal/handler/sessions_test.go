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

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// sessionTestRepos embeds stubRepos for session handler tests.
type sessionTestRepos struct {
	stubRepos
	sess         *mockSessionRepo
	getSectionFn func(ctx context.Context, id uuid.UUID) (*store.Section, error)
	getProblemFn func(ctx context.Context, id uuid.UUID) (*store.Problem, error)
}

var _ store.Repos = (*sessionTestRepos)(nil)

func (r *sessionTestRepos) ListSessions(ctx context.Context, filters store.SessionFilters) ([]store.Session, error) {
	return r.sess.ListSessions(ctx, filters)
}
func (r *sessionTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}
func (r *sessionTestRepos) CreateSession(ctx context.Context, params store.CreateSessionParams) (*store.Session, error) {
	return r.sess.CreateSession(ctx, params)
}
func (r *sessionTestRepos) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return r.sess.UpdateSession(ctx, id, params)
}
func (r *sessionTestRepos) UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*store.Session, error) {
	return r.sess.UpdateSessionProblem(ctx, id, problem)
}
func (r *sessionTestRepos) ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters store.SessionHistoryFilters) ([]store.Session, error) {
	return r.sess.ListSessionHistory(ctx, userID, isCreator, filters)
}
func (r *sessionTestRepos) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	if r.getSectionFn != nil {
		return r.getSectionFn(ctx, id)
	}
	return r.stubRepos.GetSection(ctx, id)
}
func (r *sessionTestRepos) GetProblem(ctx context.Context, id uuid.UUID) (*store.Problem, error) {
	if r.getProblemFn != nil {
		return r.getProblemFn(ctx, id)
	}
	return r.stubRepos.GetProblem(ctx, id)
}
func sessRepos(repo *mockSessionRepo) *sessionTestRepos {
	return &sessionTestRepos{sess: repo}
}
func sessReposWithSection(repo *mockSessionRepo, section *store.Section) *sessionTestRepos {
	return &sessionTestRepos{
		sess: repo,
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return section, nil
		},
	}
}

func TestListSessions_Success(t *testing.T) {
	sess := testSession()
	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, filters store.SessionFilters) ([]store.Session, error) {
			if filters.SectionID != nil {
				t.Fatalf("expected nil section_id, got %v", filters.SectionID)
			}
			if filters.Status != nil {
				t.Fatalf("expected nil status, got %v", filters.Status)
			}
			return []store.Session{*sess}, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 session, got %d", len(got))
	}
	if got[0].ID != sess.ID {
		t.Errorf("expected id %q, got %q", sess.ID, got[0].ID)
	}
}

func TestListSessions_WithSectionIDFilter(t *testing.T) {
	sectionID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	sess := testSession()

	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, filters store.SessionFilters) ([]store.Session, error) {
			if filters.SectionID == nil {
				t.Fatalf("expected section_id, got nil")
			}
			if *filters.SectionID != sectionID {
				t.Fatalf("expected section_id %v, got %v", sectionID, *filters.SectionID)
			}
			return []store.Session{*sess}, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/?section_id="+sectionID.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestListSessions_WithStatusFilter(t *testing.T) {
	sess := testSession()

	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, filters store.SessionFilters) ([]store.Session, error) {
			if filters.Status == nil {
				t.Fatalf("expected status filter, got nil")
			}
			if *filters.Status != "active" {
				t.Fatalf("expected status 'active', got %q", *filters.Status)
			}
			return []store.Session{*sess}, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/?status=active", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestListSessions_InvalidSectionID(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/?section_id=not-a-uuid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListSessions_Empty(t *testing.T) {
	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, _ store.SessionFilters) ([]store.Session, error) {
			return nil, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
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

func TestListSessions_InternalError(t *testing.T) {
	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, _ store.SessionFilters) ([]store.Session, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetSession_Success(t *testing.T) {
	sess := testSession()
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != sess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return sess, nil
		},
	}

	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/"+sess.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != sess.ID {
		t.Errorf("expected id %q, got %q", sess.ID, got.ID)
	}
}

func TestGetSession_NotFound(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetSession_InvalidID(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateSession_Success(t *testing.T) {
	userID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	sectionID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	sess := testSession()

	section := &store.Section{
		ID:   sectionID,
		Name: "Section A",
	}

	repo := &mockSessionRepo{
		createSessionFn: func(_ context.Context, params store.CreateSessionParams) (*store.Session, error) {
			if params.SectionName != "Section A" {
				t.Fatalf("unexpected section_name: %v", params.SectionName)
			}
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			if params.CreatorID != userID {
				t.Fatalf("unexpected creator_id: %v", params.CreatorID)
			}
			return sess, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"section_id": sectionID.String(),
	})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          userID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, sessReposWithSection(repo, section))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != sess.ID {
		t.Errorf("expected id %q, got %q", sess.ID, got.ID)
	}
}

func TestCreateSession_Unauthorized(t *testing.T) {
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateSession_RBACForbidden(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{
		"section_id": uuid.New().String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSession_InternalError(t *testing.T) {
	sectionID := uuid.New()
	section := &store.Section{ID: sectionID, Name: "Section A"}

	repo := &mockSessionRepo{
		createSessionFn: func(_ context.Context, _ store.CreateSessionParams) (*store.Session, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{
		"section_id": sectionID.String(),
	})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, sessReposWithSection(repo, section))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateSession_Success(t *testing.T) {
	sess := testSession()
	featuredID := uuid.New()
	updatedSess := *sess
	updatedSess.FeaturedStudentID = &featuredID

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
		updateSessionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			if id != sess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.FeaturedStudentID == nil || *params.FeaturedStudentID != featuredID {
				t.Fatalf("unexpected featured_student_id: %v", params.FeaturedStudentID)
			}
			return &updatedSess, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"featured_student_id": featuredID.String(),
	})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/"+sess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.FeaturedStudentID == nil || *got.FeaturedStudentID != featuredID {
		t.Errorf("expected featured_student_id %q, got %v", featuredID, got.FeaturedStudentID)
	}
}

func TestUpdateSession_EndSession(t *testing.T) {
	prevSess := testSession() // status "active"
	now := time.Now()
	completedSess := *prevSess
	completedSess.Status = "completed"
	completedSess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			if id != prevSess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Status == nil || *params.Status != "completed" {
				t.Fatalf("expected status 'completed', got %v", params.Status)
			}
			if params.EndedAt == nil {
				t.Fatalf("expected ended_at to be set when status is completed")
			}
			return &completedSess, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"status": "completed",
	})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSession_NotFound(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"status": "completed"})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateSession_InvalidID(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/not-a-uuid", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateSession_MissingRequiredFields(t *testing.T) {
	h := NewSessionHandler(noopPublisher())
	// Missing section_id (the only required field)
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, sessRepos(&mockSessionRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSession_InvalidBody(t *testing.T) {
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, sessRepos(&mockSessionRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSession_InvalidStatus(t *testing.T) {
	id := uuid.New()
	h := NewSessionHandler(noopPublisher())
	body, _ := json.Marshal(map[string]any{"status": "invalid_status"})
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(&mockSessionRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSession_InvalidBody(t *testing.T) {
	id := uuid.New()
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(&mockSessionRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateSession_InternalError(t *testing.T) {
	sess := testSession()
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return nil, errors.New("db error")
		},
	}

	id := sess.ID
	body, _ := json.Marshal(map[string]any{"status": "completed"})
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetSession_InternalError(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateSession_RBACForbidden(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	router := h.Routes()

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"status": "completed"})
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student PATCH, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- Publisher integration tests ---

func TestUpdateSession_EndSession_PublishesSessionEnded(t *testing.T) {
	prevSess := testSession() // status "active"
	now := time.Now()
	completedSess := *prevSess
	completedSess.Status = "completed"
	completedSess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return &completedSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{"status": "completed"})
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.sessionEndedCalls) != 1 {
		t.Fatalf("expected 1 SessionEnded call, got %d", len(pub.sessionEndedCalls))
	}
	if pub.sessionEndedCalls[0].sessionID != prevSess.ID.String() {
		t.Errorf("expected session_id %q, got %q", prevSess.ID, pub.sessionEndedCalls[0].sessionID)
	}
	if pub.sessionEndedCalls[0].reason != "completed" {
		t.Errorf("expected reason %q, got %q", "completed", pub.sessionEndedCalls[0].reason)
	}
}

func TestUpdateSession_FeaturedStudent_PublishesFeaturedStudentChanged(t *testing.T) {
	prevSess := testSession() // no featured student
	featuredID := uuid.New()
	featuredCode := "print('featured')"
	updatedSess := *prevSess
	updatedSess.FeaturedStudentID = &featuredID
	updatedSess.FeaturedCode = &featuredCode

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return &updatedSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{
		"featured_student_id": featuredID.String(),
		"featured_code":       featuredCode,
	})
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.featuredStudentChangedCalls) != 1 {
		t.Fatalf("expected 1 FeaturedStudentChanged call, got %d", len(pub.featuredStudentChangedCalls))
	}
	call := pub.featuredStudentChangedCalls[0]
	if call.sessionID != prevSess.ID.String() {
		t.Errorf("expected session_id %q, got %q", prevSess.ID, call.sessionID)
	}
	if call.userID != featuredID.String() {
		t.Errorf("expected user_id %q, got %q", featuredID, call.userID)
	}
	if call.code != featuredCode {
		t.Errorf("expected code %q, got %q", featuredCode, call.code)
	}
}

func TestUpdateSession_EndSession_SucceedsWhenPublisherFails(t *testing.T) {
	prevSess := testSession() // status "active"
	now := time.Now()
	completedSess := *prevSess
	completedSess.Status = "completed"
	completedSess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return &completedSess, nil
		},
	}
	pub := newMockPublisherWithErr(errors.New("publish failed"))
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{"status": "completed"})
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 even when publisher fails, got %d", rec.Code)
	}
}

func TestUpdateSession_DBError_NoPublish(t *testing.T) {
	sess := testSession()
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return nil, errors.New("db error")
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	id := sess.ID
	body, _ := json.Marshal(map[string]any{"status": "completed"})
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	// No goroutine spawned on DB error, so no need to wait.
	// Brief sleep to confirm no spurious calls arrive.
	time.Sleep(50 * time.Millisecond)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.sessionEndedCalls) != 0 {
		t.Errorf("expected no SessionEnded calls when DB fails, got %d", len(pub.sessionEndedCalls))
	}
}

func TestListSessions_InvalidStatus(t *testing.T) {
	repo := &mockSessionRepo{}
	h := NewSessionHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodGet, "/?status=invalid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSession_IdempotentEnd_NoPublish(t *testing.T) {
	// Session is already completed; re-sending status=completed should not publish.
	prevSess := testSession()
	prevSess.Status = "completed"
	now := time.Now()
	prevSess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return prevSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{"status": "completed"})
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// Brief sleep to confirm no publish calls arrive.
	time.Sleep(50 * time.Millisecond)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.sessionEndedCalls) != 0 {
		t.Errorf("expected no SessionEnded calls on idempotent end, got %d", len(pub.sessionEndedCalls))
	}
}

func TestDeleteSession_Success(t *testing.T) {
	sess := testSession()
	now := time.Now()
	completedSess := *sess
	completedSess.Status = "completed"
	completedSess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != sess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return sess, nil
		},
		updateSessionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			if params.Status == nil || *params.Status != "completed" {
				t.Fatalf("expected status 'completed', got %v", params.Status)
			}
			if params.EndedAt == nil {
				t.Fatalf("expected ended_at to be set")
			}
			return &completedSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	req := httptest.NewRequest(http.MethodDelete, "/"+sess.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Status != "completed" {
		t.Errorf("expected status 'completed', got %q", got.Status)
	}

	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.sessionEndedCalls) != 1 {
		t.Fatalf("expected 1 SessionEnded call, got %d", len(pub.sessionEndedCalls))
	}
}

func TestDeleteSession_NotFound(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	h := NewSessionHandler(noopPublisher())

	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteSession_AlreadyCompleted(t *testing.T) {
	sess := testSession()
	sess.Status = "completed"
	now := time.Now()
	sess.EndedAt = &now

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}
	h := NewSessionHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodDelete, "/"+sess.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestReopenSession_Success(t *testing.T) {
	sess := testSession()
	sess.Status = "completed"
	now := time.Now()
	sess.EndedAt = &now

	reopenedSess := *sess
	reopenedSess.Status = "active"
	reopenedSess.EndedAt = nil

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != sess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return sess, nil
		},
		updateSessionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			if params.Status == nil || *params.Status != "active" {
				t.Fatalf("expected status 'active', got %v", params.Status)
			}
			if !params.ClearEndedAt {
				t.Fatalf("expected ClearEndedAt to be true")
			}
			return &reopenedSess, nil
		},
	}
	h := NewSessionHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodPost, "/"+sess.ID.String()+"/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Reopen(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Status != "active" {
		t.Errorf("expected status 'active', got %q", got.Status)
	}
}

func TestReopenSession_NotFound(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	h := NewSessionHandler(noopPublisher())

	id := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/"+id.String()+"/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Reopen(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestReopenSession_NotCompleted(t *testing.T) {
	sess := testSession() // status "active"

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
	}
	h := NewSessionHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodPost, "/"+sess.ID.String()+"/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Reopen(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHistorySession_Success(t *testing.T) {
	sess := testSession()
	userID := uuid.New()

	repo := &mockSessionRepo{
		listSessionHistoryFn: func(_ context.Context, uid uuid.UUID, isCreator bool, filters store.SessionHistoryFilters) ([]store.Session, error) {
			if uid != userID {
				t.Fatalf("expected userID %v, got %v", userID, uid)
			}
			if !isCreator {
				t.Fatalf("expected isCreator true for instructor role")
			}
			return []store.Session{*sess}, nil
		},
	}
	h := NewSessionHandler(noopPublisher())

	req := httptest.NewRequest(http.MethodGet, "/history", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.History(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 session, got %d", len(got))
	}
}

func TestUpdateSessionProblem_Success(t *testing.T) {
	sess := testSession()
	newProblem := json.RawMessage(`{"title":"Three Sum","description":"Add three numbers"}`)
	updatedSess := *sess
	updatedSess.Problem = newProblem

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return sess, nil
		},
		updateSessionProblemFn: func(_ context.Context, id uuid.UUID, problem json.RawMessage) (*store.Session, error) {
			if id != sess.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if string(problem) != string(newProblem) {
				t.Fatalf("unexpected problem: %s", problem)
			}
			return &updatedSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{
		"problem": json.RawMessage(`{"title":"Three Sum","description":"Add three numbers"}`),
	})
	req := httptest.NewRequest(http.MethodPost, "/"+sess.ID.String()+"/update-problem", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateProblem(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(got.Problem) != string(newProblem) {
		t.Errorf("expected problem %s, got %s", newProblem, got.Problem)
	}

	pub.waitForCalls(t, 1)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.problemUpdatedCalls) != 1 {
		t.Fatalf("expected 1 ProblemUpdated call, got %d", len(pub.problemUpdatedCalls))
	}
	if pub.problemUpdatedCalls[0].sessionID != sess.ID.String() {
		t.Errorf("expected session_id %q, got %q", sess.ID, pub.problemUpdatedCalls[0].sessionID)
	}
}

func TestUpdateSessionProblem_NotFound(t *testing.T) {
	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	h := NewSessionHandler(noopPublisher())

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{
		"problem": json.RawMessage(`{"title":"Two Sum"}`),
	})
	req := httptest.NewRequest(http.MethodPost, "/"+id.String()+"/update-problem", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateProblem(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestUpdateSessionProblem_InvalidBody(t *testing.T) {
	h := NewSessionHandler(noopPublisher())

	id := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/"+id.String()+"/update-problem", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(&mockSessionRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateProblem(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSession_IdempotentFeaturedStudent_NoPublish(t *testing.T) {
	// Featured student is already set to the same ID; re-sending should not publish.
	featuredID := uuid.New()
	prevSess := testSession()
	prevSess.FeaturedStudentID = &featuredID
	code := "print('hello')"
	prevSess.FeaturedCode = &code

	repo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return prevSess, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return prevSess, nil
		},
	}
	pub := newMockPublisher()
	h := NewSessionHandler(pub)

	body, _ := json.Marshal(map[string]any{
		"featured_student_id": featuredID.String(),
		"featured_code":       code,
	})
	req := httptest.NewRequest(http.MethodPatch, "/"+prevSess.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", prevSess.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, sessRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// Brief sleep to confirm no publish calls arrive.
	time.Sleep(50 * time.Millisecond)
	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.featuredStudentChangedCalls) != 0 {
		t.Errorf("expected no FeaturedStudentChanged calls on idempotent update, got %d", len(pub.featuredStudentChangedCalls))
	}
}
