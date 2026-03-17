package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockStudentWorkRepo implements store.StudentWorkRepository for testing.
type mockStudentWorkRepo struct {
	getOrCreateStudentWorkFn   func(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error)
	updateStudentWorkFn        func(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error)
	getStudentWorkFn           func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error)
	getStudentWorkByProblemFn  func(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error)
	listStudentWorkBySessionFn func(ctx context.Context, sessionID uuid.UUID) ([]store.StudentWork, error)
}

func (m *mockStudentWorkRepo) GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	return m.getOrCreateStudentWorkFn(ctx, namespaceID, userID, problemID, sectionID)
}

func (m *mockStudentWorkRepo) UpdateStudentWork(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	return m.updateStudentWorkFn(ctx, id, params)
}

func (m *mockStudentWorkRepo) GetStudentWork(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
	return m.getStudentWorkFn(ctx, id)
}

func (m *mockStudentWorkRepo) GetStudentWorkByProblem(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	return m.getStudentWorkByProblemFn(ctx, userID, problemID, sectionID)
}

func (m *mockStudentWorkRepo) ListStudentWorkBySession(ctx context.Context, sessionID uuid.UUID) ([]store.StudentWork, error) {
	return m.listStudentWorkBySessionFn(ctx, sessionID)
}

func (m *mockStudentWorkRepo) ListStudentProgress(_ context.Context, _ uuid.UUID) ([]store.StudentProgress, error) {
	panic("mockStudentWorkRepo: unexpected ListStudentProgress call")
}

func (m *mockStudentWorkRepo) ListStudentWorkForReview(_ context.Context, _, _ uuid.UUID) ([]store.StudentWorkSummary, error) {
	panic("mockStudentWorkRepo: unexpected ListStudentWorkForReview call")
}

// Helper to create repos with both section problem and student work repos.
type swReposImpl struct {
	stubRepos
	sp   store.SectionProblemRepository
	sw   store.StudentWorkRepository
	prob store.ProblemRepository
}

func (r swReposImpl) ListSectionProblems(ctx context.Context, sectionID, userID uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
	if r.sp != nil {
		return r.sp.ListSectionProblems(ctx, sectionID, userID)
	}
	return nil, nil
}

func (r swReposImpl) GetSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*store.SectionProblem, error) {
	if r.sp != nil {
		return r.sp.GetSectionProblem(ctx, sectionID, problemID)
	}
	panic("swReposImpl: unexpected GetSectionProblem call")
}

func (r swReposImpl) CreateSectionProblem(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error) {
	if r.sp != nil {
		return r.sp.CreateSectionProblem(ctx, params)
	}
	panic("swReposImpl: unexpected CreateSectionProblem call")
}

func (r swReposImpl) UpdateSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
	if r.sp != nil {
		return r.sp.UpdateSectionProblem(ctx, sectionID, problemID, params)
	}
	panic("swReposImpl: unexpected UpdateSectionProblem call")
}

func (r swReposImpl) DeleteSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) error {
	if r.sp != nil {
		return r.sp.DeleteSectionProblem(ctx, sectionID, problemID)
	}
	panic("swReposImpl: unexpected DeleteSectionProblem call")
}

func (r swReposImpl) ListSectionsForProblem(ctx context.Context, problemID uuid.UUID) ([]store.SectionProblem, error) {
	if r.sp != nil {
		return r.sp.ListSectionsForProblem(ctx, problemID)
	}
	panic("swReposImpl: unexpected ListSectionsForProblem call")
}

func (r swReposImpl) GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	if r.sw != nil {
		return r.sw.GetOrCreateStudentWork(ctx, namespaceID, userID, problemID, sectionID)
	}
	panic("swReposImpl: unexpected GetOrCreateStudentWork call")
}

func (r swReposImpl) UpdateStudentWork(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	if r.sw != nil {
		return r.sw.UpdateStudentWork(ctx, id, params)
	}
	panic("swReposImpl: unexpected UpdateStudentWork call")
}

func (r swReposImpl) GetStudentWork(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
	if r.sw != nil {
		return r.sw.GetStudentWork(ctx, id)
	}
	panic("swReposImpl: unexpected GetStudentWork call")
}

func (r swReposImpl) GetStudentWorkByProblem(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	if r.sw != nil {
		return r.sw.GetStudentWorkByProblem(ctx, userID, problemID, sectionID)
	}
	panic("swReposImpl: unexpected GetStudentWorkByProblem call")
}

func (r swReposImpl) ListStudentWorkBySession(ctx context.Context, sessionID uuid.UUID) ([]store.StudentWork, error) {
	if r.sw != nil {
		return r.sw.ListStudentWorkBySession(ctx, sessionID)
	}
	panic("swReposImpl: unexpected ListStudentWorkBySession call")
}

func (r swReposImpl) GetProblem(ctx context.Context, id uuid.UUID) (*store.Problem, error) {
	if r.prob != nil {
		return r.prob.GetProblem(ctx, id)
	}
	panic("swReposImpl: unexpected GetProblem call")
}

func swRepos(sp store.SectionProblemRepository, sw store.StudentWorkRepository, prob store.ProblemRepository) store.Repos {
	return swReposImpl{stubRepos{}, sp, sw, prob}
}

func TestStudentWorkHandler_GetOrCreate_Success(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	userID := uuid.New()
	namespaceID := "test-ns"
	starterCode := "# starter"

	work := &store.StudentWork{
		ID:          uuid.New(),
		NamespaceID: namespaceID,
		UserID:      userID,
		ProblemID:   problemID,
		SectionID:   sectionID,
		Code:        starterCode,
	}

	spRepo := &mockSectionProblemRepo{
		getSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID) (*store.SectionProblem, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			if pid != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", pid, problemID)
			}
			return &store.SectionProblem{
				ProblemID: problemID,
				SectionID: sectionID,
			}, nil
		},
	}

	swRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(ctx context.Context, ns string, uid, pid, sid uuid.UUID) (*store.StudentWork, error) {
			if ns != namespaceID {
				t.Fatalf("unexpected namespaceID: got %v, want %v", ns, namespaceID)
			}
			if uid != userID {
				t.Fatalf("unexpected userID: got %v, want %v", uid, userID)
			}
			if pid != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", pid, problemID)
			}
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			return work, nil
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(spRepo, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetOrCreate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.StudentWork
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != work.ID {
		t.Errorf("expected work ID %v, got %v", work.ID, got.ID)
	}
}

func TestStudentWorkHandler_GetOrCreate_ProblemNotPublished(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	userID := uuid.New()
	namespaceID := "test-ns"

	spRepo := &mockSectionProblemRepo{
		getSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID) (*store.SectionProblem, error) {
			// Return not found - problem not published to this section
			return nil, store.ErrNotFound
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(spRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetOrCreate(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkHandler_Get_Success(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        workID,
			UserID:    userID,
			ProblemID: problemID,
			Code:      "print('hello')",
		},
		Problem: store.Problem{
			ID:    problemID,
			Title: "Test Problem",
		},
	}

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			if id != workID {
				t.Fatalf("unexpected workID: got %v, want %v", id, workID)
			}
			return work, nil
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.StudentWorkWithProblem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != workID {
		t.Errorf("expected work ID %v, got %v", workID, got.ID)
	}
	if got.Problem.ID != problemID {
		t.Errorf("expected problem ID %v, got %v", problemID, got.Problem.ID)
	}
}

func TestStudentWorkHandler_Get_NotFound(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkHandler_Update_Success(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	newCode := "print('updated')"
	testCases := json.RawMessage(`[{"name":"Case 1","input":"test","match_type":"exact","order":0}]`)

	reqBody := updateStudentWorkRequest{
		Code:      &newCode,
		TestCases: testCases,
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWork{
		ID:        workID,
		UserID:    userID,
		Code:      newCode,
		TestCases: testCases,
	}

	swRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			if id != workID {
				t.Fatalf("unexpected workID: got %v, want %v", id, workID)
			}
			if params.Code == nil || *params.Code != newCode {
				t.Fatalf("unexpected code")
			}
			if len(params.TestCases) == 0 {
				t.Fatalf("test_cases should not be empty")
			}
			return work, nil
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodPatch, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkHandler_GetOrCreate_EmptyNamespaceID(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	userID := uuid.New()

	spRepo := &mockSectionProblemRepo{
		getSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID) (*store.SectionProblem, error) {
			return &store.SectionProblem{
				ProblemID: problemID,
				SectionID: sectionID,
			}, nil
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	// User has empty NamespaceID (system-admin user)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(spRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetOrCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStudentWorkHandler_Update_NotFound(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	newCode := "print('updated')"

	reqBody := updateStudentWorkRequest{
		Code: &newCode,
	}
	body, _ := json.Marshal(reqBody)

	swRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewStudentWorkHandler()
	req := httptest.NewRequest(http.MethodPatch, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}
