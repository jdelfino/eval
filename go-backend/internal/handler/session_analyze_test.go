package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/ai"
	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// mockAIClient implements ai.Client for testing.
type mockAIClient struct {
	analyzeFn func(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error)
}

func (m *mockAIClient) AnalyzeCode(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
	return m.analyzeFn(ctx, req)
}

func setupAnalyzeHandler(sessRepo store.SessionRepository, aiClient ai.Client) http.Handler {
	h := NewAnalyzeHandler(sessRepo, aiClient)
	r := chi.NewRouter()
	r.Post("/sessions/{id}/analyze", h.Analyze)
	return r
}

func newAnalyzeReq(studentID uuid.UUID, code, problemDesc string) []byte {
	b, _ := json.Marshal(map[string]any{
		"student_id":          studentID,
		"code":                code,
		"problem_description": problemDesc,
	})
	return b
}

func TestAnalyze_HappyPath(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return &ai.AnalyzeResponse{
				Analysis:    "The code correctly solves the problem.",
				Suggestions: []string{"Consider adding error handling."},
			}, nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, `print("hello")`, "Print hello world")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp ai.AnalyzeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Analysis == "" {
		t.Fatal("expected non-empty analysis")
	}
	if len(resp.Suggestions) != 1 {
		t.Fatalf("expected 1 suggestion, got %d", len(resp.Suggestions))
	}
}

func TestAnalyze_403StudentForbidden(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_401Unauthenticated(t *testing.T) {
	handler := setupAnalyzeHandler(&mockSessionRepo{}, &mockAIClient{})
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_404SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_403NotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_400StudentNotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testOutsiderID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_500AIError(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return nil, fmt.Errorf("ai: rate limited")
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyze_PassesRequestToAIClient(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}

	var capturedReq ai.AnalyzeRequest
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			capturedReq = req
			return &ai.AnalyzeResponse{Analysis: "ok", Suggestions: []string{}}, nil
		},
	}

	handler := setupAnalyzeHandler(sessRepo, aiClient)
	body := newAnalyzeReq(testStudentID, "my code", "my problem")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Code != "my code" {
		t.Fatalf("expected code 'my code', got %q", capturedReq.Code)
	}
	if capturedReq.ProblemDescription != "my problem" {
		t.Fatalf("expected problem_description 'my problem', got %q", capturedReq.ProblemDescription)
	}
}
