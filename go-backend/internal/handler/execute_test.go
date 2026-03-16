package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"syscall"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
)

// mockExecutorClient implements ExecutorClient for testing.
type mockExecutorClient struct {
	executeFn func(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error)
}

func (m *mockExecutorClient) Execute(ctx context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
	return m.executeFn(ctx, req)
}

var (
	testCreatorID = uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	testStudentID = uuid.MustParse("dddddddd-dddd-dddd-dddd-dddddddddddd")
)

// setupExecuteHandler sets up the new unified Execute handler for testing.
func setupExecuteHandler(execClient ExecutorClient) http.Handler {
	h := NewExecuteHandler(execClient)
	r := chi.NewRouter()
	r.Post("/execute", h.Execute)
	return r
}

func TestExecute_HappyPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Success:         true,
				Output:          "hello\n",
				ExecutionTimeMs: 30,
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     `print("hello")`,
		"language": "python",
		"stdin":    "some input",
		"files":    []map[string]string{{"name": "test.txt", "content": "data"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp executor.ExecuteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !resp.Success {
		t.Fatal("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Fatalf("expected output 'hello\\n', got %q", resp.Output)
	}
	// Verify executor received correct fields
	if capturedReq.Code != `print("hello")` {
		t.Fatalf("expected code forwarded, got %q", capturedReq.Code)
	}
	if capturedReq.Stdin != "some input" {
		t.Fatalf("expected stdin 'some input', got %q", capturedReq.Stdin)
	}
	if len(capturedReq.Files) != 1 || capturedReq.Files[0].Name != "test.txt" {
		t.Fatalf("expected 1 file 'test.txt', got %v", capturedReq.Files)
	}
}

func TestExecute_MinimalRequest(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_StudentUserAllowed(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "hello\n"}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     `print("hello")`,
		"language": "python",
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	// Student user — endpoint is open to any authenticated user
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for student user, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Code != `print("hello")` {
		t.Fatalf("expected code forwarded, got %q", capturedReq.Code)
	}
}

func TestExecute_RandomSeed(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":        "x",
		"language":    "python",
		"random_seed": 42,
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.RandomSeed == nil || *capturedReq.RandomSeed != 42 {
		t.Fatalf("expected random_seed 42 forwarded to executor, got %v", capturedReq.RandomSeed)
	}
}

func TestExecute_NilRandomSeedNotForwarded(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "x",
		"language": "python",
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.RandomSeed != nil {
		t.Fatalf("expected nil random_seed when not provided, got %v", capturedReq.RandomSeed)
	}
}

func TestExecute_401NoAuth(t *testing.T) {
	handler := setupExecuteHandler(&mockExecutorClient{})
	body, _ := json.Marshal(map[string]any{"code": "x"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_422MissingCode(t *testing.T) {
	handler := setupExecuteHandler(&mockExecutorClient{})
	body, _ := json.Marshal(map[string]any{"language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_400InvalidJSON(t *testing.T) {
	handler := setupExecuteHandler(&mockExecutorClient{})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader([]byte("{bad")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_500ExecutorError(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return nil, fmt.Errorf("connection refused")
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_LanguagePassedToExecutor(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{Success: true, Output: "ok"}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "class Main {}", "language": "java"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.Language != "java" {
		t.Fatalf("expected language 'java' forwarded to executor, got %q", capturedReq.Language)
	}
}

func TestExecute_MissingLanguageReturns422(t *testing.T) {
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(execClient)
	// No language field — language has validate:"required" so returns 422.
	body, _ := json.Marshal(map[string]any{"code": "print('hi')"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for missing language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_400InvalidLanguage(t *testing.T) {
	execClient := &mockExecutorClient{}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "ruby"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExecute_503OnConnectionError(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			urlErr := &url.Error{
				Op:  "Post",
				URL: "http://executor:8080/execute",
				Err: &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED},
			}
			return nil, fmt.Errorf("executor: send request: %w", urlErr)
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{"code": "x", "language": "python"})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testCreatorID, Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- normalizeLanguage tests ---

func TestNormalizeLanguage_EmptyReturnsError(t *testing.T) {
	_, err := normalizeLanguage("")
	if err == nil {
		t.Error("expected error for empty language, got nil")
	}
}

func TestNormalizeLanguage_PythonReturnsAsIs(t *testing.T) {
	got, err := normalizeLanguage("python")
	if err != nil || got != "python" {
		t.Errorf("expected 'python', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_JavaReturnsAsIs(t *testing.T) {
	got, err := normalizeLanguage("java")
	if err != nil || got != "java" {
		t.Errorf("expected 'java', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_Python3AliasMapsTo_Python(t *testing.T) {
	got, err := normalizeLanguage("python3")
	if err != nil || got != "python" {
		t.Errorf("expected 'python', got %q, err %v", got, err)
	}
}

func TestNormalizeLanguage_InvalidReturnsError(t *testing.T) {
	_, err := normalizeLanguage("ruby")
	if err == nil {
		t.Error("expected error for invalid language 'ruby', got nil")
	}
}

// --- isConnectionError tests ---

func TestIsConnectionError_URLErrorWithNetOpError_ReturnsTrue(t *testing.T) {
	inner := &net.OpError{
		Op:  "dial",
		Net: "tcp",
		Err: syscall.ECONNREFUSED,
	}
	urlErr := &url.Error{
		Op:  "Post",
		URL: "http://executor:8080/execute",
		Err: inner,
	}
	wrapped := fmt.Errorf("executor: send request: %w", urlErr)
	if !isConnectionError(wrapped) {
		t.Error("expected isConnectionError=true for wrapped *url.Error with *net.OpError")
	}
}

func TestIsConnectionError_DNSError_ReturnsTrue(t *testing.T) {
	dnsErr := &net.DNSError{
		Err:  "no such host",
		Name: "executor",
	}
	wrapped := fmt.Errorf("executor: send request: %w", dnsErr)
	if !isConnectionError(wrapped) {
		t.Error("expected isConnectionError=true for wrapped *net.DNSError")
	}
}

func TestIsConnectionError_ContextDeadlineExceeded_ReturnsTrue(t *testing.T) {
	wrapped := fmt.Errorf("executor: send request: %w", context.DeadlineExceeded)
	if !isConnectionError(wrapped) {
		t.Error("expected isConnectionError=true for wrapped context.DeadlineExceeded")
	}
}

func TestIsConnectionError_StatusError_ReturnsFalse(t *testing.T) {
	statusErr := &executor.StatusError{Code: http.StatusInternalServerError, Body: "internal error"}
	if isConnectionError(statusErr) {
		t.Error("expected isConnectionError=false for *executor.StatusError")
	}
}

func TestIsConnectionError_PlainError_ReturnsFalse(t *testing.T) {
	if isConnectionError(fmt.Errorf("some other error")) {
		t.Error("expected isConnectionError=false for a plain error")
	}
}

// --- writeExecutorError 503 behavior tests ---

func TestWriteExecutorError_ConnectionError_Returns503(t *testing.T) {
	urlErr := &url.Error{
		Op:  "Post",
		URL: "http://executor:8080/execute",
		Err: &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED},
	}
	wrapped := fmt.Errorf("executor: send request: %w", urlErr)

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/execute", nil)
	writeExecutorError(w, r, wrapped, "execution failed")

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !strings.Contains(resp["error"], "Code execution is warming up") {
		t.Errorf("expected 'Code execution is warming up' in error message, got %q", resp["error"])
	}
}

func TestWriteExecutorError_DNSError_Returns503(t *testing.T) {
	dnsErr := &net.DNSError{Err: "no such host", Name: "executor"}
	wrapped := fmt.Errorf("executor: send request: %w", dnsErr)

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/execute", nil)
	writeExecutorError(w, r, wrapped, "execution failed")

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestWriteExecutorError_429StillPropagated(t *testing.T) {
	err := &executor.StatusError{Code: http.StatusTooManyRequests, Body: "rate limit exceeded"}

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/execute", nil)
	writeExecutorError(w, r, err, "execution failed")

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", w.Code, w.Body.String())
	}
}

func TestWriteExecutorError_OtherErrorStill500(t *testing.T) {
	err := fmt.Errorf("some unexpected internal error")

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/execute", nil)
	writeExecutorError(w, r, err, "execution failed")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}
