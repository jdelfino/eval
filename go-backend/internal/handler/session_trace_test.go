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
	return NewTraceHandler(tracer)
}

func newStandaloneTraceReq(code string) []byte {
	b, _ := json.Marshal(map[string]any{
		"code":     code,
		"language": "python",
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

func TestStandaloneTrace_LanguagePassedToExecutor(t *testing.T) {
	var capturedReq executor.TraceRequest
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
			capturedReq = req
			return &executor.TraceResponse{
				Steps:      []executor.TraceStep{},
				TotalSteps: 0,
				ExitCode:   0,
			}, nil
		},
	}

	h := setupStandaloneTraceHandler(tracer)
	router := traceRouter(h)
	body, _ := json.Marshal(map[string]any{"code": "class Main {}", "language": "java"})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Language != "java" {
		t.Fatalf("expected language 'java' forwarded to tracer, got %q", capturedReq.Language)
	}
}

func TestStandaloneTrace_EmptyLanguageReturns400(t *testing.T) {
	h := setupStandaloneTraceHandler(&mockTracerClient{})
	router := traceRouter(h)
	// No language field — must now return 400 (no python default).
	body, _ := json.Marshal(map[string]any{"code": "x = 1"})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_400InvalidLanguage(t *testing.T) {
	h := setupStandaloneTraceHandler(&mockTracerClient{})
	router := traceRouter(h)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "ruby"})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestStandaloneTrace_FilesAndRandomSeedForwarded(t *testing.T) {
	var capturedReq executor.TraceRequest
	tracer := &mockTracerClient{
		traceFn: func(_ context.Context, req executor.TraceRequest) (*executor.TraceResponse, error) {
			capturedReq = req
			return &executor.TraceResponse{
				Steps:      []executor.TraceStep{},
				TotalSteps: 0,
				ExitCode:   0,
			}, nil
		},
	}

	h := setupStandaloneTraceHandler(tracer)
	router := traceRouter(h)
	seed := 42
	body, _ := json.Marshal(map[string]any{
		"code":        "import random",
		"language":    "python",
		"stdin":       "test-input",
		"files":       []map[string]string{{"name": "data.txt", "content": "hello"}},
		"random_seed": seed,
	})
	req := httptest.NewRequest(http.MethodPost, "/trace", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Stdin != "test-input" {
		t.Errorf("expected stdin 'test-input', got %q", capturedReq.Stdin)
	}
	if len(capturedReq.Files) != 1 {
		t.Fatalf("expected 1 file forwarded, got %d", len(capturedReq.Files))
	}
	if capturedReq.Files[0].Name != "data.txt" {
		t.Errorf("expected file name 'data.txt', got %q", capturedReq.Files[0].Name)
	}
	if capturedReq.Files[0].Content != "hello" {
		t.Errorf("expected file content 'hello', got %q", capturedReq.Files[0].Content)
	}
	if capturedReq.RandomSeed == nil {
		t.Fatal("expected RandomSeed to be set, got nil")
	}
	if *capturedReq.RandomSeed != 42 {
		t.Errorf("expected RandomSeed=42, got %d", *capturedReq.RandomSeed)
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
