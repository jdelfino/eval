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
	"github.com/jdelfino/eval/go-backend/internal/executor"
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

	h := NewStudentWorkHandler(nil)
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

	h := NewStudentWorkHandler(nil)
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

	h := NewStudentWorkHandler(nil)
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

	h := NewStudentWorkHandler(nil)
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
	execSettings := json.RawMessage(`{"stdin": "test"}`)

	reqBody := updateStudentWorkRequest{
		Code:              &newCode,
		ExecutionSettings: execSettings,
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWork{
		ID:                workID,
		UserID:            userID,
		Code:              newCode,
		ExecutionSettings: execSettings,
	}

	swRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			if id != workID {
				t.Fatalf("unexpected workID: got %v, want %v", id, workID)
			}
			if params.Code == nil || *params.Code != newCode {
				t.Fatalf("unexpected code")
			}
			if len(params.ExecutionSettings) == 0 {
				t.Fatalf("execution settings should not be empty")
			}
			return work, nil
		},
	}

	h := NewStudentWorkHandler(nil)
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

func TestStudentWorkHandler_Execute_Success(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()
	namespaceID := "test-ns"
	code := "print('hello')"
	execSettings := json.RawMessage(`{"stdin": "input"}`)

	reqBody := executeStudentWorkRequest{
		Code:              code,
		ExecutionSettings: &executionSettingsJSON{Stdin: strPtr("input")},
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:                workID,
			UserID:            userID,
			ProblemID:         problemID,
			Code:              code,
			ExecutionSettings: execSettings,
		},
		Problem: store.Problem{
			ID:                problemID,
			Title:             "Test",
			ExecutionSettings: json.RawMessage(`{}`),
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

	execClient := &mockExecutorClient{
		executeFn: func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			if req.Code != code {
				t.Fatalf("unexpected code: got %v, want %v", req.Code, code)
			}
			return &executor.ExecuteResponse{
				Success: true,
				Output:  "hello\n",
			}, nil
		},
	}

	h := NewStudentWorkHandler(execClient)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got executor.ExecuteResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Output != "hello\n" {
		t.Errorf("expected output 'hello\\n', got %v", got.Output)
	}
}

func TestStudentWorkHandler_Execute_WorkNotFound(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	namespaceID := "test-ns"

	reqBody := executeStudentWorkRequest{
		Code: "print('hello')",
	}
	body, _ := json.Marshal(reqBody)

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewStudentWorkHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
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

	h := NewStudentWorkHandler(nil)
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

	h := NewStudentWorkHandler(nil)
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

func TestStudentWorkHandler_Execute_ExecutorError(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()
	namespaceID := "test-ns"

	reqBody := executeStudentWorkRequest{
		Code: "print('hello')",
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        workID,
			UserID:    userID,
			ProblemID: problemID,
		},
		Problem: store.Problem{
			ID: problemID,
		},
	}

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return nil, errors.New("executor service error")
		},
	}

	h := NewStudentWorkHandler(execClient)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- mergeStudentWorkExecutionSettings unit tests ---

func TestMergeStudentWorkExecutionSettings_AllNil(t *testing.T) {
	result := mergeStudentWorkExecutionSettings(nil, nil, nil)

	if result.Stdin != nil {
		t.Errorf("expected nil Stdin, got %v", result.Stdin)
	}
	if result.RandomSeed != nil {
		t.Errorf("expected nil RandomSeed, got %v", result.RandomSeed)
	}
	if len(result.Files) != 0 {
		t.Errorf("expected empty Files, got %v", result.Files)
	}
}

func TestMergeStudentWorkExecutionSettings_OnlyProblemSettings(t *testing.T) {
	stdin := "from problem"
	seed := 42
	problemJSON := json.RawMessage(`{"stdin":"from problem","random_seed":42}`)

	result := mergeStudentWorkExecutionSettings(problemJSON, nil, nil)

	if result.Stdin == nil || *result.Stdin != stdin {
		t.Errorf("expected Stdin %q, got %v", stdin, result.Stdin)
	}
	if result.RandomSeed == nil || *result.RandomSeed != seed {
		t.Errorf("expected RandomSeed %d, got %v", seed, result.RandomSeed)
	}
}

func TestMergeStudentWorkExecutionSettings_StudentWorkOverridesProblem(t *testing.T) {
	problemJSON := json.RawMessage(`{"stdin":"from problem","random_seed":1}`)
	studentJSON := json.RawMessage(`{"stdin":"from student"}`)

	result := mergeStudentWorkExecutionSettings(problemJSON, studentJSON, nil)

	// Student stdin overrides problem stdin
	if result.Stdin == nil || *result.Stdin != "from student" {
		t.Errorf("expected Stdin %q, got %v", "from student", result.Stdin)
	}
	// RandomSeed from problem is preserved (student didn't set it)
	if result.RandomSeed == nil || *result.RandomSeed != 1 {
		t.Errorf("expected RandomSeed 1 from problem, got %v", result.RandomSeed)
	}
}

func TestMergeStudentWorkExecutionSettings_RequestOverridesAll(t *testing.T) {
	problemJSON := json.RawMessage(`{"stdin":"from problem","random_seed":1}`)
	studentJSON := json.RawMessage(`{"stdin":"from student","random_seed":2}`)
	reqSettings := &executionSettingsJSON{
		Stdin:      strPtr("from request"),
		RandomSeed: intPtr(99),
	}

	result := mergeStudentWorkExecutionSettings(problemJSON, studentJSON, reqSettings)

	if result.Stdin == nil || *result.Stdin != "from request" {
		t.Errorf("expected Stdin %q from request, got %v", "from request", result.Stdin)
	}
	if result.RandomSeed == nil || *result.RandomSeed != 99 {
		t.Errorf("expected RandomSeed 99 from request, got %v", result.RandomSeed)
	}
}

func TestMergeStudentWorkExecutionSettings_EmptyStudentWorkJSON(t *testing.T) {
	problemJSON := json.RawMessage(`{"stdin":"from problem"}`)
	// Empty JSON object — no fields set
	studentJSON := json.RawMessage(`{}`)

	result := mergeStudentWorkExecutionSettings(problemJSON, studentJSON, nil)

	// Problem-level stdin should still be present
	if result.Stdin == nil || *result.Stdin != "from problem" {
		t.Errorf("expected Stdin %q from problem, got %v", "from problem", result.Stdin)
	}
}

func TestMergeStudentWorkExecutionSettings_PartialOverlap(t *testing.T) {
	// Problem sets stdin and random_seed; student overrides only random_seed; request overrides nothing
	problemJSON := json.RawMessage(`{"stdin":"problem-stdin","random_seed":10}`)
	studentJSON := json.RawMessage(`{"random_seed":20}`)

	result := mergeStudentWorkExecutionSettings(problemJSON, studentJSON, nil)

	if result.Stdin == nil || *result.Stdin != "problem-stdin" {
		t.Errorf("expected Stdin %q, got %v", "problem-stdin", result.Stdin)
	}
	if result.RandomSeed == nil || *result.RandomSeed != 20 {
		t.Errorf("expected RandomSeed 20 from student, got %v", result.RandomSeed)
	}
}

func TestMergeStudentWorkExecutionSettings_NilRequestSettingsPreservesLowerLayers(t *testing.T) {
	problemJSON := json.RawMessage(`{"stdin":"problem-stdin"}`)
	studentJSON := json.RawMessage(`{"random_seed":7}`)

	result := mergeStudentWorkExecutionSettings(problemJSON, studentJSON, nil)

	if result.Stdin == nil || *result.Stdin != "problem-stdin" {
		t.Errorf("expected Stdin %q, got %v", "problem-stdin", result.Stdin)
	}
	if result.RandomSeed == nil || *result.RandomSeed != 7 {
		t.Errorf("expected RandomSeed 7, got %v", result.RandomSeed)
	}
}

// intPtr returns a pointer to an int value.
func intPtr(v int) *int { return &v }

// TestStudentWorkHandler_ConstructorInjectsExecutor verifies that the constructor
// takes an executor argument directly (Fix 4: no nil-panic risk from missing WithExecutor call).
func TestStudentWorkHandler_ConstructorInjectsExecutor(t *testing.T) {
	workID := uuid.New()
	userID := uuid.New()
	problemID := uuid.New()
	namespaceID := "test-ns"
	code := "print('hello')"

	reqBody := executeStudentWorkRequest{
		Code: code,
	}
	body, _ := json.Marshal(reqBody)

	work := &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:        workID,
			UserID:    userID,
			ProblemID: problemID,
			Code:      code,
		},
		Problem: store.Problem{
			ID: problemID,
		},
	}

	swRepo := &mockStudentWorkRepo{
		getStudentWorkFn: func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	// This line should compile with the new constructor signature NewStudentWorkHandler(exec ExecutorClient)
	h := NewStudentWorkHandler(execClient)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", workID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: namespaceID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, swRepos(nil, swRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Execute(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
