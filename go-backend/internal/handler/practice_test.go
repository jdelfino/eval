package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/executor"
	"github.com/jdelfino/eval/internal/store"
)

func newPracticeReq(code string) []byte {
	b, _ := json.Marshal(map[string]any{
		"code": code,
	})
	return b
}

func setupPracticeHandler(
	sessionRepo *mockSessionRepo,
	execClient ExecutorClient,
) http.Handler {
	h := NewExecuteHandler(execClient)
	repos := &executeTestRepos{sessions: sessionRepo, students: &execMockSessionStudentRepo{}}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/sessions/{id}/practice", h.PracticeExecute)
	return r
}

func TestPractice_HappyPath(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			return completedSession(), nil
		},
	}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Success:         true,
				Output:          "hello\n",
				ExecutionTimeMs: 45,
			}, nil
		},
	}

	handler := setupPracticeHandler(sessRepo, execClient)
	body := newPracticeReq(`print("hello")`)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp executor.ExecuteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !resp.Success {
		t.Fatal("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Fatalf("expected output 'hello\\n', got %q", resp.Output)
	}
}

func TestPractice_400SessionActive(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return activeSession(), nil
		},
	}
	execClient := &mockExecutorClient{}

	handler := setupPracticeHandler(sessRepo, execClient)
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
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
	if resp["error"] != "session is not completed; use /execute for active sessions" {
		t.Fatalf("unexpected error message: %s", resp["error"])
	}
}

func TestPractice_403NotParticipant(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return completedSession(), nil
		},
	}
	execClient := &mockExecutorClient{}

	handler := setupPracticeHandler(sessRepo, execClient)
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testOutsiderID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPractice_429RateLimited(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return completedSession(), nil
		},
	}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	// Use a handler with a small rate limit for testing
	h := NewExecuteHandler(execClient)
	h.practiceLimiter = NewPracticeLimiter(15) // 15 per minute
	repos := &executeTestRepos{sessions: sessRepo, students: &execMockSessionStudentRepo{}}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), repos)))
		})
	})
	r.Post("/sessions/{id}/practice", h.PracticeExecute)

	// Make 15 requests (should all succeed)
	for i := 0; i < 15; i++ {
		body := newPracticeReq("code")
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
		req = req.WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	// 16th request should be rate limited
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPractice_404SessionNotFound(t *testing.T) {
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			return nil, store.ErrNotFound
		},
	}
	execClient := &mockExecutorClient{}

	handler := setupPracticeHandler(sessRepo, execClient)
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPractice_401NoAuth(t *testing.T) {
	handler := setupPracticeHandler(&mockSessionRepo{}, &mockExecutorClient{})
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// No auth context set
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPractice_MergesProblemExecutionSettings(t *testing.T) {
	// Practice mode should include problem-level execution settings (e.g. stdin, files)
	// even when the request doesn't provide any.
	problemJSON := json.RawMessage(`{"title":"Test","execution_settings":{"stdin":"problem-stdin","files":[{"name":"data.txt","content":"hello"}]}}`)
	sessRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, _ uuid.UUID) (*store.Session, error) {
			s := completedSession()
			s.Problem = problemJSON
			return s, nil
		},
	}
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true}, nil
		},
	}

	handler := setupPracticeHandler(sessRepo, execClient)
	body := newPracticeReq("code")
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// stdin from problem should be forwarded to executor
	if capturedReq.Stdin != "problem-stdin" {
		t.Fatalf("expected stdin 'problem-stdin', got %q", capturedReq.Stdin)
	}
	if len(capturedReq.Files) != 1 || capturedReq.Files[0].Name != "data.txt" {
		t.Fatalf("expected 1 file 'data.txt', got %v", capturedReq.Files)
	}
}

func TestPracticeLimiter_CleansUpIdleUsers(t *testing.T) {
	limiter := NewPracticeLimiter(100)
	userA := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	// Record a request
	limiter.Allow(userA)
	if _, ok := limiter.windows[userA]; !ok {
		t.Fatal("expected userA in windows after Allow")
	}

	// Simulate time passing by backdating entries
	limiter.mu.Lock()
	limiter.windows[userA] = []time.Time{time.Now().Add(-2 * time.Minute)}
	limiter.mu.Unlock()

	// Next Allow call should evict the expired entry AND clean up the empty key
	limiter.Allow(userA)

	limiter.mu.Lock()
	// userA should still exist (we just added a new entry)
	if _, ok := limiter.windows[userA]; !ok {
		t.Fatal("expected userA in windows after fresh Allow")
	}

	// Now backdate again and call Allow for a different user
	limiter.windows[userA] = []time.Time{time.Now().Add(-2 * time.Minute)}
	limiter.mu.Unlock()

	userB := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	limiter.Allow(userB)

	// Call Allow for userA — expired entries should be evicted and key deleted
	limiter.Allow(userA)

	// After the above Allow, userA has a new fresh entry so key exists.
	// Test the actual cleanup: manually set an empty slice and call Allow
	limiter.mu.Lock()
	limiter.windows[userA] = []time.Time{time.Now().Add(-2 * time.Minute)}
	limiter.mu.Unlock()

	limiter.Allow(userA)
	// userA should still be present because Allow added a new timestamp
	limiter.mu.Lock()
	if len(limiter.windows[userA]) != 1 {
		t.Fatalf("expected 1 entry for userA, got %d", len(limiter.windows[userA]))
	}
	limiter.mu.Unlock()
}

func TestPractice_400InvalidJSON(t *testing.T) {
	sessRepo := &mockSessionRepo{}
	execClient := &mockExecutorClient{}

	handler := setupPracticeHandler(sessRepo, execClient)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/sessions/%s/practice", testSessionID), bytes.NewReader([]byte("{invalid json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}
