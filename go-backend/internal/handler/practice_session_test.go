package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// --- Test constants (ps = practice session) ---

var (
	psProblemID    = uuid.MustParse("aaaa1111-2222-3333-4444-555555555555")
	psSectionID    = uuid.MustParse("bbbb1111-2222-3333-4444-555555555555")
	psClassID      = uuid.MustParse("cccc1111-2222-3333-4444-555555555555")
	psUserID       = uuid.MustParse("dddd1111-2222-3333-4444-555555555555")
	psNamespaceID  = "ps-test-ns"
	psOtherClassID = uuid.MustParse("eeee1111-2222-3333-4444-555555555555")
	psNewSessID    = uuid.MustParse("ffff1111-2222-3333-4444-555555555555")
	psExistSessID  = uuid.MustParse("1111ffff-2222-3333-4444-555555555555")
)

// --- Mock practice session store ---

type mockPracticeSessionStore struct {
	findCompletedSessionByProblemFn func(ctx context.Context, sectionID, problemID uuid.UUID) (*store.Session, error)
	createSessionFn                 func(ctx context.Context, params store.CreateSessionParams) (*store.Session, error)
	updateSessionFn                 func(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error)
}

func (m *mockPracticeSessionStore) FindCompletedSessionByProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*store.Session, error) {
	return m.findCompletedSessionByProblemFn(ctx, sectionID, problemID)
}

func (m *mockPracticeSessionStore) CreateSession(ctx context.Context, params store.CreateSessionParams) (*store.Session, error) {
	return m.createSessionFn(ctx, params)
}

func (m *mockPracticeSessionStore) UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
	return m.updateSessionFn(ctx, id, params)
}

// --- Test repos for RLS-scoped reads ---

type practiceSessionTestRepos struct {
	stubRepos
	getProblemFn func(ctx context.Context, id uuid.UUID) (*store.Problem, error)
	getSectionFn func(ctx context.Context, id uuid.UUID) (*store.Section, error)
}

func (r *practiceSessionTestRepos) GetProblem(ctx context.Context, id uuid.UUID) (*store.Problem, error) {
	return r.getProblemFn(ctx, id)
}

func (r *practiceSessionTestRepos) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	return r.getSectionFn(ctx, id)
}

// --- Test fixtures ---

func psProblemFixture() *store.Problem {
	return &store.Problem{
		ID:          psProblemID,
		NamespaceID: psNamespaceID,
		Title:       "Two Sum",
		ClassID:     &psClassID,
		AuthorID:    psUserID,
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func psSectionFixture() *store.Section {
	return &store.Section{
		ID:          psSectionID,
		NamespaceID: psNamespaceID,
		ClassID:     psClassID,
		Name:        "Section A",
		Active:      true,
		JoinCode:    "ABC123",
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func psExistingCompletedSession() *store.Session {
	now := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	return &store.Session{
		ID:           psExistSessID,
		NamespaceID:  psNamespaceID,
		SectionID:    psSectionID,
		SectionName:  "Section A",
		Problem:      json.RawMessage(`{"id":"` + psProblemID.String() + `","title":"Two Sum"}`),
		CreatorID:    psUserID,
		Participants: []uuid.UUID{},
		Status:       "completed",
		CreatedAt:    now,
		LastActivity: now,
		EndedAt:      &now,
	}
}

// --- Setup helper ---

func setupPracticeSessionHandler(
	repos *practiceSessionTestRepos,
	adminStore *mockPracticeSessionStore,
) http.Handler {
	h := NewPracticeSessionHandler(adminStore)
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/problems/{id}/practice", h.StartPractice)
	return r
}

func psReqBody(sectionID uuid.UUID) []byte {
	b, _ := json.Marshal(map[string]any{
		"section_id": sectionID.String(),
	})
	return b
}

// --- Tests ---

func TestStartPractice_HappyPath_ExistingSession(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, id uuid.UUID) (*store.Problem, error) {
			if id != psProblemID {
				t.Fatalf("unexpected problem ID: %s", id)
			}
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, id uuid.UUID) (*store.Section, error) {
			if id != psSectionID {
				t.Fatalf("unexpected section ID: %s", id)
			}
			return psSectionFixture(), nil
		},
	}
	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, sectionID, problemID uuid.UUID) (*store.Session, error) {
			if sectionID != psSectionID {
				t.Fatalf("expected sectionID %s, got %s", psSectionID, sectionID)
			}
			if problemID != psProblemID {
				t.Fatalf("expected problemID %s, got %s", psProblemID, problemID)
			}
			return psExistingCompletedSession(), nil
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp startPracticeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.SessionID != psExistSessID.String() {
		t.Fatalf("expected session_id %s, got %s", psExistSessID, resp.SessionID)
	}
}

func TestStartPractice_HappyPath_CreatesNewSession(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return psSectionFixture(), nil
		},
	}

	var createCalled bool
	var updateCalled bool
	now := time.Now()

	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, _, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
		createSessionFn: func(_ context.Context, params store.CreateSessionParams) (*store.Session, error) {
			createCalled = true
			if params.SectionID != psSectionID {
				t.Fatalf("expected sectionID %s, got %s", psSectionID, params.SectionID)
			}
			if params.NamespaceID != psNamespaceID {
				t.Fatalf("expected namespace %s, got %s", psNamespaceID, params.NamespaceID)
			}
			if params.CreatorID != psUserID {
				t.Fatalf("expected creatorID %s, got %s", psUserID, params.CreatorID)
			}
			return &store.Session{
				ID:           psNewSessID,
				NamespaceID:  psNamespaceID,
				SectionID:    psSectionID,
				SectionName:  "Section A",
				Problem:      params.Problem,
				CreatorID:    psUserID,
				Participants: []uuid.UUID{},
				Status:       "active",
				CreatedAt:    now,
				LastActivity: now,
			}, nil
		},
		updateSessionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error) {
			updateCalled = true
			if id != psNewSessID {
				t.Fatalf("expected session ID %s, got %s", psNewSessID, id)
			}
			if params.Status == nil || *params.Status != "completed" {
				t.Fatalf("expected status 'completed', got %v", params.Status)
			}
			if params.EndedAt == nil {
				t.Fatal("expected ended_at to be set")
			}
			return &store.Session{
				ID:           psNewSessID,
				NamespaceID:  psNamespaceID,
				SectionID:    psSectionID,
				SectionName:  "Section A",
				CreatorID:    psUserID,
				Participants: []uuid.UUID{},
				Status:       "completed",
				CreatedAt:    now,
				LastActivity: now,
				EndedAt:      params.EndedAt,
			}, nil
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp startPracticeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.SessionID != psNewSessID.String() {
		t.Fatalf("expected session_id %s, got %s", psNewSessID, resp.SessionID)
	}
	if !createCalled {
		t.Fatal("expected CreateSession to be called")
	}
	if !updateCalled {
		t.Fatal("expected UpdateSession to be called")
	}
}

func TestStartPractice_401NoAuth(t *testing.T) {
	repos := &practiceSessionTestRepos{}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// No auth context set
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_404ProblemNotFound(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return nil, store.ErrNotFound
		},
	}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_404SectionNotFound(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_400ClassMismatch(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil // classID = psClassID
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			s := psSectionFixture()
			s.ClassID = psOtherClassID // different class
			return s, nil
		},
	}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["error"] != "section does not belong to the problem's class" {
		t.Fatalf("unexpected error: %s", resp["error"])
	}
}

func TestStartPractice_400InvalidJSON(t *testing.T) {
	repos := &practiceSessionTestRepos{}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader([]byte("{invalid json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_400InvalidUUID(t *testing.T) {
	repos := &practiceSessionTestRepos{}
	adminStore := &mockPracticeSessionStore{}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, "/problems/not-a-uuid/practice", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_500FindError(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return psSectionFixture(), nil
		},
	}
	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, _, _ uuid.UUID) (*store.Session, error) {
			return nil, errors.New("database connection lost")
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_500CreateError(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return psSectionFixture(), nil
		},
	}
	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, _, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
		createSessionFn: func(_ context.Context, _ store.CreateSessionParams) (*store.Session, error) {
			return nil, errors.New("insert failed")
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_ProblemWithNilClassID(t *testing.T) {
	// When problem has nil ClassID, any section should be allowed.
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			p := psProblemFixture()
			p.ClassID = nil // public/unscoped problem
			return p, nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return psSectionFixture(), nil
		},
	}
	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, _, _ uuid.UUID) (*store.Session, error) {
			return psExistingCompletedSession(), nil
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStartPractice_500UpdateError(t *testing.T) {
	repos := &practiceSessionTestRepos{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return psProblemFixture(), nil
		},
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return psSectionFixture(), nil
		},
	}
	now := time.Now()
	adminStore := &mockPracticeSessionStore{
		findCompletedSessionByProblemFn: func(_ context.Context, _, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
		createSessionFn: func(_ context.Context, params store.CreateSessionParams) (*store.Session, error) {
			return &store.Session{
				ID:           psNewSessID,
				NamespaceID:  psNamespaceID,
				SectionID:    psSectionID,
				SectionName:  "Section A",
				Problem:      params.Problem,
				CreatorID:    psUserID,
				Participants: []uuid.UUID{},
				Status:       "active",
				CreatedAt:    now,
				LastActivity: now,
			}, nil
		},
		updateSessionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSessionParams) (*store.Session, error) {
			return nil, errors.New("update failed")
		},
	}

	handler := setupPracticeSessionHandler(repos, adminStore)
	body := psReqBody(psSectionID)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/problems/%s/practice", psProblemID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: psUserID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
