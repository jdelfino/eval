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

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
)

// mockTracerClient implements TracerClient for testing.
type mockTracerClient struct {
	traceFn func(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error)
}

func (m *mockTracerClient) Trace(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
	return m.traceFn(ctx, req)
}

func setupStandaloneTraceHandler(tracer TracerClient) *TraceHandler {
	return &TraceHandler{
		tracer:       tracer,
		traceLimiter: NewPracticeLimiter(15),
	}
}

func newStandaloneTraceReq(code string) []byte {
	b, _ := json.Marshal(map[string]any{
		"code": code,
	})
	return b
}

func traceRouter(h *TraceHandler) http.Handler {
	r := chi.NewRouter()
	r.Post("/trace", h.StandaloneTrace)
	return r
}

func TestStandaloneTrace_HappyPath(t *testing.T) {
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{
				Steps: []executor.TraceStep{
					{Line: 1, Event: "line", Locals: map[string]interface{}{"x": 5}, Globals: map[string]interface{}{}, Stdout: ""},
					{Line: 2, Event: "line", Locals: map[string]interface{}{"x": 5, "y": 10}, Globals: map[string]interface{}{}, Stdout: "15"},
				},
				TotalSteps: 2,
				ExitCode:   0,
			}, nil
		},
	}

	h := setupStandaloneTraceHandler(tracer)
	router := traceRouter(h)
	body := newStandaloneTraceReq(`x = 5; y = 10; print(x+y)`)
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp executor.TraceResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(resp.Steps))
	}
}

func TestStandaloneTrace_StudentCanTrace(t *testing.T) {
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, _ executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{
				Steps: []executor.TraceStep{
					{Line: 1, Event: "line", Locals: map[string]interface{}{"x": 1}, Globals: map[string]interface{}{}, Stdout: "1"},
				},
				TotalSteps: 1,
				ExitCode:   0,
			}, nil
		},
	}

	h := setupStandaloneTraceHandler(tracer)
	router := traceRouter(h)
	body := newStandaloneTraceReq("x = 1; print(x)")
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_401Unauthenticated(t *testing.T) {
	h := setupStandaloneTraceHandler(&mockTracerClient{})
	router := traceRouter(h)
	body := newStandaloneTraceReq("code")
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_422MissingCode(t *testing.T) {
	h := setupStandaloneTraceHandler(&mockTracerClient{})
	router := traceRouter(h)
	body, _ := json.Marshal(map[string]any{"stdin": "hello"})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_429RateLimited(t *testing.T) {
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, _ executor.TraceRequest) (*executor.TraceResponse, error) {
			return &executor.TraceResponse{ExitCode: 0}, nil
		},
	}

	h := &TraceHandler{
		tracer:       tracer,
		traceLimiter: NewPracticeLimiter(1), // allow only 1 per minute
	}
	router := traceRouter(h)
	userID := uuid.New()

	// First request should succeed
	body := newStandaloneTraceReq("code")
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("first request: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Second request should be rate limited
	body = newStandaloneTraceReq("code")
	req = httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx = auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second request: expected 429, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_500ExecutorError(t *testing.T) {
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, _ executor.TraceRequest) (*executor.TraceResponse, error) {
			return nil, fmt.Errorf("executor: connection refused")
		},
	}

	h := setupStandaloneTraceHandler(tracer)
	router := traceRouter(h)
	body := newStandaloneTraceReq("code")
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}
