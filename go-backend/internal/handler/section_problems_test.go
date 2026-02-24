package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockSectionProblemRepo implements store.SectionProblemRepository for testing.
type mockSectionProblemRepo struct {
	listSectionProblemsFn     func(ctx context.Context, sectionID, userID uuid.UUID) ([]store.PublishedProblemWithStatus, error)
	createSectionProblemFn    func(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error)
	updateSectionProblemFn    func(ctx context.Context, sectionID, problemID uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error)
	deleteSectionProblemFn    func(ctx context.Context, sectionID, problemID uuid.UUID) error
	listSectionsForProblemFn  func(ctx context.Context, problemID uuid.UUID) ([]store.SectionProblem, error)
}

func (m *mockSectionProblemRepo) ListSectionProblems(ctx context.Context, sectionID, userID uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
	return m.listSectionProblemsFn(ctx, sectionID, userID)
}

func (m *mockSectionProblemRepo) CreateSectionProblem(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error) {
	return m.createSectionProblemFn(ctx, params)
}

func (m *mockSectionProblemRepo) UpdateSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
	return m.updateSectionProblemFn(ctx, sectionID, problemID, params)
}

func (m *mockSectionProblemRepo) DeleteSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) error {
	return m.deleteSectionProblemFn(ctx, sectionID, problemID)
}

func (m *mockSectionProblemRepo) ListSectionsForProblem(ctx context.Context, problemID uuid.UUID) ([]store.SectionProblem, error) {
	return m.listSectionsForProblemFn(ctx, problemID)
}

// Helper to create repos with section problem repo.
type spReposImpl struct {
	stubRepos
	sp store.SectionProblemRepository
}

func (r spReposImpl) ListSectionProblems(ctx context.Context, sectionID, userID uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
	return r.sp.ListSectionProblems(ctx, sectionID, userID)
}

func (r spReposImpl) CreateSectionProblem(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error) {
	return r.sp.CreateSectionProblem(ctx, params)
}

func (r spReposImpl) UpdateSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
	return r.sp.UpdateSectionProblem(ctx, sectionID, problemID, params)
}

func (r spReposImpl) DeleteSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) error {
	return r.sp.DeleteSectionProblem(ctx, sectionID, problemID)
}

func (r spReposImpl) ListSectionsForProblem(ctx context.Context, problemID uuid.UUID) ([]store.SectionProblem, error) {
	return r.sp.ListSectionsForProblem(ctx, problemID)
}

func spRepos(sp store.SectionProblemRepository) store.Repos {
	return spReposImpl{stubRepos{}, sp}
}

func TestSectionProblemHandler_List_Success(t *testing.T) {
	sectionID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()

	sp := &store.SectionProblem{
		ID:           uuid.New(),
		SectionID:    sectionID,
		ProblemID:    problemID,
		PublishedBy:  uuid.New(),
		ShowSolution: true,
	}

	problem := store.Problem{
		ID:    problemID,
		Title: "Test Problem",
	}

	expected := []store.PublishedProblemWithStatus{
		{
			SectionProblem: *sp,
			Problem:        problem,
			StudentWork:    nil,
		},
	}

	repo := &mockSectionProblemRepo{
		listSectionProblemsFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			if uid != userID {
				t.Fatalf("unexpected userID: got %v, want %v", uid, userID)
			}
			return expected, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.PublishedProblemWithStatus
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 problem, got %d", len(got))
	}
	if got[0].ProblemID != problemID {
		t.Errorf("expected problem %v, got %v", problemID, got[0].ProblemID)
	}
}

func TestSectionProblemHandler_Publish_Success(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	userID := uuid.New()

	reqBody := publishProblemRequest{
		ProblemID:    problemID.String(),
		ShowSolution: true,
	}
	body, _ := json.Marshal(reqBody)

	sp := &store.SectionProblem{
		ID:           uuid.New(),
		SectionID:    sectionID,
		ProblemID:    problemID,
		PublishedBy:  userID,
		ShowSolution: true,
	}

	repo := &mockSectionProblemRepo{
		createSectionProblemFn: func(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error) {
			if params.SectionID != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", params.SectionID, sectionID)
			}
			if params.ProblemID != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", params.ProblemID, problemID)
			}
			if params.PublishedBy != userID {
				t.Fatalf("unexpected publishedBy: got %v, want %v", params.PublishedBy, userID)
			}
			if params.ShowSolution != true {
				t.Fatalf("unexpected showSolution: got %v, want true", params.ShowSolution)
			}
			return sp, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Publish(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_Publish_Duplicate(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	userID := uuid.New()

	reqBody := publishProblemRequest{
		ProblemID:    problemID.String(),
		ShowSolution: false,
	}
	body, _ := json.Marshal(reqBody)

	repo := &mockSectionProblemRepo{
		createSectionProblemFn: func(ctx context.Context, params store.CreateSectionProblemParams) (*store.SectionProblem, error) {
			return nil, store.ErrDuplicate
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Publish(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_Update_Success(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	showSolution := false

	reqBody := updateSectionProblemRequest{
		ShowSolution: &showSolution,
	}
	body, _ := json.Marshal(reqBody)

	sp := &store.SectionProblem{
		ID:           uuid.New(),
		SectionID:    sectionID,
		ProblemID:    problemID,
		ShowSolution: false,
	}

	repo := &mockSectionProblemRepo{
		updateSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			if pid != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", pid, problemID)
			}
			if params.ShowSolution == nil || *params.ShowSolution != false {
				t.Fatalf("unexpected showSolution param")
			}
			return sp, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodPatch, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_Unpublish_Success(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()

	repo := &mockSectionProblemRepo{
		deleteSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID) error {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			if pid != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", pid, problemID)
			}
			return nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Unpublish(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_Unpublish_NotFound(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()

	repo := &mockSectionProblemRepo{
		deleteSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Unpublish(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_ListSectionsForProblem_Success(t *testing.T) {
	problemID := uuid.New()
	sectionID := uuid.New()

	expected := []store.SectionProblem{
		{
			ID:           uuid.New(),
			SectionID:    sectionID,
			ProblemID:    problemID,
			PublishedBy:  uuid.New(),
			ShowSolution: true,
		},
	}

	repo := &mockSectionProblemRepo{
		listSectionsForProblemFn: func(ctx context.Context, pid uuid.UUID) ([]store.SectionProblem, error) {
			if pid != problemID {
				t.Fatalf("unexpected problemID: got %v, want %v", pid, problemID)
			}
			return expected, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListSectionsForProblem(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.SectionProblem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 section, got %d", len(got))
	}
	if got[0].SectionID != sectionID {
		t.Errorf("expected section %v, got %v", sectionID, got[0].SectionID)
	}
}

func TestSectionProblemHandler_List_Empty(t *testing.T) {
	sectionID := uuid.New()
	userID := uuid.New()

	repo := &mockSectionProblemRepo{
		listSectionProblemsFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
			return nil, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestSectionProblemHandler_Update_NotFound(t *testing.T) {
	sectionID := uuid.New()
	problemID := uuid.New()
	showSolution := true

	reqBody := updateSectionProblemRequest{
		ShowSolution: &showSolution,
	}
	body, _ := json.Marshal(reqBody)

	repo := &mockSectionProblemRepo{
		updateSectionProblemFn: func(ctx context.Context, sid, pid uuid.UUID, params store.UpdateSectionProblemParams) (*store.SectionProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodPatch, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("problemID", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionProblemHandler_List_InternalError(t *testing.T) {
	sectionID := uuid.New()
	userID := uuid.New()

	repo := &mockSectionProblemRepo{
		listSectionProblemsFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
			return nil, errors.New("database error")
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestSectionProblemHandler_List_StripsSensitiveFields verifies that test_cases are always
// stripped and solution is stripped when ShowSolution is false.
func TestSectionProblemHandler_List_StripsSensitiveFields(t *testing.T) {
	sectionID := uuid.New()
	userID := uuid.New()
	problemID1 := uuid.New()
	problemID2 := uuid.New()
	solution := "secret solution"
	testCases := json.RawMessage(`[{"input":"1","output":"1"}]`)

	problems := []store.PublishedProblemWithStatus{
		{
			SectionProblem: store.SectionProblem{
				ID:           uuid.New(),
				SectionID:    sectionID,
				ProblemID:    problemID1,
				ShowSolution: false, // solution should be stripped
			},
			Problem: store.Problem{
				ID:        problemID1,
				Title:     "Problem Without Solution",
				Solution:  &solution,
				TestCases: testCases,
			},
		},
		{
			SectionProblem: store.SectionProblem{
				ID:           uuid.New(),
				SectionID:    sectionID,
				ProblemID:    problemID2,
				ShowSolution: true, // solution should be visible
			},
			Problem: store.Problem{
				ID:        problemID2,
				Title:     "Problem With Solution",
				Solution:  &solution,
				TestCases: testCases,
			},
		},
	}

	repo := &mockSectionProblemRepo{
		listSectionProblemsFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.PublishedProblemWithStatus, error) {
			return problems, nil
		},
	}

	h := NewSectionProblemHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, spRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Decode as raw JSON to inspect fields precisely
	var got []map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 problems, got %d", len(got))
	}

	// Check both problems: test_cases must always be null/absent
	for i, item := range got {
		problemRaw, ok := item["problem"]
		if !ok {
			t.Fatalf("problem[%d]: missing 'problem' field", i)
		}
		var prob map[string]json.RawMessage
		if err := json.Unmarshal(problemRaw, &prob); err != nil {
			t.Fatalf("problem[%d]: unmarshal: %v", i, err)
		}
		if tc, ok := prob["test_cases"]; ok && string(tc) != "null" {
			t.Errorf("problem[%d]: test_cases should be null, got %s", i, tc)
		}
	}

	// Problem 0: ShowSolution=false — solution must be null
	prob0Raw := got[0]["problem"]
	var prob0 map[string]json.RawMessage
	_ = json.Unmarshal(prob0Raw, &prob0)
	if sol, ok := prob0["solution"]; ok && string(sol) != "null" {
		t.Errorf("problem[0] (ShowSolution=false): solution should be null, got %s", sol)
	}

	// Problem 1: ShowSolution=true — solution must be present
	prob1Raw := got[1]["problem"]
	var prob1 map[string]json.RawMessage
	_ = json.Unmarshal(prob1Raw, &prob1)
	if sol, ok := prob1["solution"]; !ok || string(sol) == "null" {
		t.Errorf("problem[1] (ShowSolution=true): solution should be present, got %s", sol)
	}
}
