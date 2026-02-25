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

// mockStudentReviewRepo implements store.StudentWorkRepository for student review tests.
type mockStudentReviewRepo struct {
	listStudentProgressFn      func(ctx context.Context, sectionID uuid.UUID) ([]store.StudentProgress, error)
	listStudentWorkForReviewFn func(ctx context.Context, sectionID, studentUserID uuid.UUID) ([]store.StudentWorkSummary, error)
}

func (m *mockStudentReviewRepo) GetOrCreateStudentWork(_ context.Context, _ string, _, _, _ uuid.UUID) (*store.StudentWork, error) {
	panic("mockStudentReviewRepo: unexpected GetOrCreateStudentWork call")
}
func (m *mockStudentReviewRepo) UpdateStudentWork(_ context.Context, _ uuid.UUID, _ store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	panic("mockStudentReviewRepo: unexpected UpdateStudentWork call")
}
func (m *mockStudentReviewRepo) GetStudentWork(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
	panic("mockStudentReviewRepo: unexpected GetStudentWork call")
}
func (m *mockStudentReviewRepo) GetStudentWorkByProblem(_ context.Context, _, _, _ uuid.UUID) (*store.StudentWork, error) {
	panic("mockStudentReviewRepo: unexpected GetStudentWorkByProblem call")
}
func (m *mockStudentReviewRepo) ListStudentWorkBySession(_ context.Context, _ uuid.UUID) ([]store.StudentWork, error) {
	panic("mockStudentReviewRepo: unexpected ListStudentWorkBySession call")
}
func (m *mockStudentReviewRepo) ListStudentProgress(ctx context.Context, sectionID uuid.UUID) ([]store.StudentProgress, error) {
	return m.listStudentProgressFn(ctx, sectionID)
}
func (m *mockStudentReviewRepo) ListStudentWorkForReview(ctx context.Context, sectionID, studentUserID uuid.UUID) ([]store.StudentWorkSummary, error) {
	return m.listStudentWorkForReviewFn(ctx, sectionID, studentUserID)
}

// srReposImpl embeds stubRepos and overrides only the StudentWorkRepository methods.
type srReposImpl struct {
	stubRepos
	sw store.StudentWorkRepository
}

func (r srReposImpl) GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	return r.sw.GetOrCreateStudentWork(ctx, namespaceID, userID, problemID, sectionID)
}
func (r srReposImpl) UpdateStudentWork(ctx context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
	return r.sw.UpdateStudentWork(ctx, id, params)
}
func (r srReposImpl) GetStudentWork(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
	return r.sw.GetStudentWork(ctx, id)
}
func (r srReposImpl) GetStudentWorkByProblem(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*store.StudentWork, error) {
	return r.sw.GetStudentWorkByProblem(ctx, userID, problemID, sectionID)
}
func (r srReposImpl) ListStudentWorkBySession(ctx context.Context, sessionID uuid.UUID) ([]store.StudentWork, error) {
	return r.sw.ListStudentWorkBySession(ctx, sessionID)
}
func (r srReposImpl) ListStudentProgress(ctx context.Context, sectionID uuid.UUID) ([]store.StudentProgress, error) {
	return r.sw.ListStudentProgress(ctx, sectionID)
}
func (r srReposImpl) ListStudentWorkForReview(ctx context.Context, sectionID, studentUserID uuid.UUID) ([]store.StudentWorkSummary, error) {
	return r.sw.ListStudentWorkForReview(ctx, sectionID, studentUserID)
}

func srRepos(sw store.StudentWorkRepository) store.Repos {
	return srReposImpl{stubRepos{}, sw}
}

// TestStudentReviewHandler_ListStudentProgress_Success verifies a list of student
// progress records is returned as JSON 200 when the store succeeds.
func TestStudentReviewHandler_ListStudentProgress_Success(t *testing.T) {
	sectionID := uuid.New()
	userID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)
	expected := []store.StudentProgress{
		{
			UserID:          userID,
			DisplayName:     "Alice",
			Email:           "alice@example.com",
			ProblemsStarted: 2,
			TotalProblems:   5,
			LastActive:      &now,
		},
	}

	repo := &mockStudentReviewRepo{
		listStudentProgressFn: func(ctx context.Context, sid uuid.UUID) ([]store.StudentProgress, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			return expected, nil
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentProgress(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.StudentProgress
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 record, got %d", len(got))
	}
	if got[0].UserID != userID {
		t.Errorf("expected UserID %v, got %v", userID, got[0].UserID)
	}
	if got[0].DisplayName != "Alice" {
		t.Errorf("expected DisplayName 'Alice', got %v", got[0].DisplayName)
	}
	if got[0].ProblemsStarted != 2 {
		t.Errorf("expected ProblemsStarted 2, got %v", got[0].ProblemsStarted)
	}
}

// TestStudentReviewHandler_ListStudentProgress_Empty verifies that a nil result
// from the store is returned as an empty JSON array (not null).
func TestStudentReviewHandler_ListStudentProgress_Empty(t *testing.T) {
	sectionID := uuid.New()

	repo := &mockStudentReviewRepo{
		listStudentProgressFn: func(ctx context.Context, sid uuid.UUID) ([]store.StudentProgress, error) {
			return nil, nil // store returns nil slice
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentProgress(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.StudentProgress
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty array, got %v", got)
	}
}

// TestStudentReviewHandler_ListStudentProgress_InternalError verifies that a
// store error results in a 500 response.
func TestStudentReviewHandler_ListStudentProgress_InternalError(t *testing.T) {
	sectionID := uuid.New()

	repo := &mockStudentReviewRepo{
		listStudentProgressFn: func(ctx context.Context, sid uuid.UUID) ([]store.StudentProgress, error) {
			return nil, errors.New("db unavailable")
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentProgress(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStudentReviewHandler_ListStudentProgress_BadSectionID verifies that a
// non-UUID section param results in a 400 response.
func TestStudentReviewHandler_ListStudentProgress_BadSectionID(t *testing.T) {
	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(&mockStudentReviewRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentProgress(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStudentReviewHandler_ListStudentWork_Success verifies that a list of
// StudentWorkSummary records is returned as JSON 200.
func TestStudentReviewHandler_ListStudentWork_Success(t *testing.T) {
	sectionID := uuid.New()
	studentID := uuid.New()
	problemID := uuid.New()
	workID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	work := &store.StudentWork{
		ID:        workID,
		UserID:    studentID,
		ProblemID: problemID,
		SectionID: sectionID,
		Code:      "print('hello')",
	}
	expected := []store.StudentWorkSummary{
		{
			Problem:     store.Problem{ID: problemID, Title: "Two Sum"},
			PublishedAt: now,
			StudentWork: work,
		},
	}

	repo := &mockStudentReviewRepo{
		listStudentWorkForReviewFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.StudentWorkSummary, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: got %v, want %v", sid, sectionID)
			}
			if uid != studentID {
				t.Fatalf("unexpected studentID: got %v, want %v", uid, studentID)
			}
			return expected, nil
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.StudentWorkSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 record, got %d", len(got))
	}
	if got[0].Problem.ID != problemID {
		t.Errorf("expected problem ID %v, got %v", problemID, got[0].Problem.ID)
	}
	if got[0].StudentWork == nil {
		t.Error("expected non-nil StudentWork")
	} else if got[0].StudentWork.ID != workID {
		t.Errorf("expected work ID %v, got %v", workID, got[0].StudentWork.ID)
	}
}

// TestStudentReviewHandler_ListStudentWork_NullWork verifies that a nil StudentWork
// in the summary is serialized correctly (omitempty).
func TestStudentReviewHandler_ListStudentWork_NullWork(t *testing.T) {
	sectionID := uuid.New()
	studentID := uuid.New()
	problemID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	expected := []store.StudentWorkSummary{
		{
			Problem:     store.Problem{ID: problemID, Title: "Unsolved"},
			PublishedAt: now,
			StudentWork: nil,
		},
	}

	repo := &mockStudentReviewRepo{
		listStudentWorkForReviewFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.StudentWorkSummary, error) {
			return expected, nil
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.StudentWorkSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 record, got %d", len(got))
	}
	if got[0].StudentWork != nil {
		t.Errorf("expected nil StudentWork, got %v", got[0].StudentWork)
	}
}

// TestStudentReviewHandler_ListStudentWork_NullWorkSerializedAsNull verifies that
// when StudentWork is nil, the JSON response contains "student_work":null rather
// than omitting the field entirely.
func TestStudentReviewHandler_ListStudentWork_NullWorkSerializedAsNull(t *testing.T) {
	sectionID := uuid.New()
	studentID := uuid.New()
	problemID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	expected := []store.StudentWorkSummary{
		{
			Problem:     store.Problem{ID: problemID, Title: "Unsolved"},
			PublishedAt: now,
			StudentWork: nil,
		},
	}

	repo := &mockStudentReviewRepo{
		listStudentWorkForReviewFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.StudentWorkSummary, error) {
			return expected, nil
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// student_work must be present as null, not omitted from the JSON.
	body := rec.Body.String()
	if !strings.Contains(body, `"student_work":null`) {
		t.Errorf("expected JSON to contain \"student_work\":null, got: %s", body)
	}
}

// TestStudentReviewHandler_ListStudentWork_BadSectionID verifies that a
// non-UUID section param results in a 400 response.
func TestStudentReviewHandler_ListStudentWork_BadSectionID(t *testing.T) {
	studentID := uuid.New()

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(&mockStudentReviewRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStudentReviewHandler_ListStudentWork_BadUserID verifies that a
// non-UUID user param results in a 400 response.
func TestStudentReviewHandler_ListStudentWork_BadUserID(t *testing.T) {
	sectionID := uuid.New()

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(&mockStudentReviewRepo{}))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStudentReviewHandler_ListStudentWork_InternalError verifies that a
// store error results in a 500 response.
func TestStudentReviewHandler_ListStudentWork_InternalError(t *testing.T) {
	sectionID := uuid.New()
	studentID := uuid.New()

	repo := &mockStudentReviewRepo{
		listStudentWorkForReviewFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.StudentWorkSummary, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestStudentReviewHandler_ListStudentWork_Empty verifies that a nil result
// from the store is returned as an empty JSON array.
func TestStudentReviewHandler_ListStudentWork_Empty(t *testing.T) {
	sectionID := uuid.New()
	studentID := uuid.New()

	repo := &mockStudentReviewRepo{
		listStudentWorkForReviewFn: func(ctx context.Context, sid, uid uuid.UUID) ([]store.StudentWorkSummary, error) {
			return nil, nil
		},
	}

	h := NewStudentReviewHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", studentID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = store.WithRepos(ctx, srRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListStudentWork(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.StudentWorkSummary
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty array, got %v", got)
	}
}
