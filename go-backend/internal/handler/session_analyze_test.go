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

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// mockAnalyzeLimiter implements ratelimit.Limiter for analyze tests.
type mockAnalyzeLimiter struct {
	allowFn func(ctx context.Context, category string, key string) (*ratelimit.Result, error)
}

func (m *mockAnalyzeLimiter) Allow(ctx context.Context, category string, key string) (*ratelimit.Result, error) {
	if m.allowFn != nil {
		return m.allowFn(ctx, category, key)
	}
	return &ratelimit.Result{Allowed: true, Remaining: 99}, nil
}

// mockAIClient implements ai.Client for testing.
type mockAIClient struct {
	analyzeFn func(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error)
}

func (m *mockAIClient) AnalyzeCode(ctx context.Context, req ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
	return m.analyzeFn(ctx, req)
}

// analyzeTestRepos embeds stubRepos and overrides session methods for analyze tests.
type analyzeTestRepos struct {
	stubRepos
	sess *mockSessionRepo
}

var _ store.Repos = (*analyzeTestRepos)(nil)

func (r *analyzeTestRepos) GetSession(ctx context.Context, id uuid.UUID) (*store.Session, error) {
	return r.sess.GetSession(ctx, id)
}

func setupAnalyzeHandler(sessRepo *mockSessionRepo, aiClient ai.Client) http.Handler {
	return setupAnalyzeHandlerWithLimiter(sessRepo, aiClient, nil)
}

func setupAnalyzeHandlerWithLimiter(sessRepo *mockSessionRepo, aiClient ai.Client, limiter ratelimit.Limiter) http.Handler {
	h := NewAnalyzeHandler(aiClient, limiter)
	repos := &analyzeTestRepos{sess: sessRepo}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
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

func TestAnalyze_429GlobalDailyLimit(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			t.Fatal("AI client should not be called when rate limited")
			return nil, nil
		},
	}

	limiter := &mockAnalyzeLimiter{
		allowFn: func(_ context.Context, category string, _ string) (*ratelimit.Result, error) {
			if category == "analyzeGlobal" {
				return &ratelimit.Result{Allowed: false, Remaining: 0}, nil
			}
			return &ratelimit.Result{Allowed: true, Remaining: 99}, nil
		},
	}

	handler := setupAnalyzeHandlerWithLimiter(sessRepo, aiClient, limiter)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["error"] != "Global daily analysis limit reached. Please try again tomorrow." {
		t.Fatalf("unexpected error message: %q", resp["error"])
	}
}

func TestAnalyze_429PerUserDailyLimit(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			t.Fatal("AI client should not be called when rate limited")
			return nil, nil
		},
	}

	limiter := &mockAnalyzeLimiter{
		allowFn: func(_ context.Context, category string, _ string) (*ratelimit.Result, error) {
			if category == "analyzeDaily" {
				return &ratelimit.Result{Allowed: false, Remaining: 0}, nil
			}
			return &ratelimit.Result{Allowed: true, Remaining: 99}, nil
		},
	}

	handler := setupAnalyzeHandlerWithLimiter(sessRepo, aiClient, limiter)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["error"] != "Daily analysis limit reached (100 per day). Please try again tomorrow." {
		t.Fatalf("unexpected error message: %q", resp["error"])
	}
}

func TestAnalyze_DailyLimitErrorAllowsRequest(t *testing.T) {
	// When the limiter returns an error, the request should be allowed through.
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiCalled := false
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			aiCalled = true
			return &ai.AnalyzeResponse{Analysis: "ok", Suggestions: []string{}}, nil
		},
	}

	limiter := &mockAnalyzeLimiter{
		allowFn: func(_ context.Context, _ string, _ string) (*ratelimit.Result, error) {
			return nil, fmt.Errorf("limiter error")
		},
	}

	handler := setupAnalyzeHandlerWithLimiter(sessRepo, aiClient, limiter)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !aiCalled {
		t.Fatal("expected AI client to be called when limiter errors")
	}
}

func TestAnalyze_NilLimiterAllowsRequest(t *testing.T) {
	// When no limiter is provided, the request should be allowed through.
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	aiClient := &mockAIClient{
		analyzeFn: func(_ context.Context, _ ai.AnalyzeRequest) (*ai.AnalyzeResponse, error) {
			return &ai.AnalyzeResponse{Analysis: "ok", Suggestions: []string{}}, nil
		},
	}

	// nil limiter
	handler := setupAnalyzeHandlerWithLimiter(sessRepo, aiClient, nil)
	body := newAnalyzeReq(testStudentID, "code", "desc")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/analyze", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
