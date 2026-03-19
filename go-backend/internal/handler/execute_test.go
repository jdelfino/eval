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
	"syscall"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/pkg/executorapi"
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

// defaultTestResponse returns a minimal valid ExecuteResponse for tests that
// don't care about the response content.
func defaultTestResponse() *executor.ExecuteResponse {
	return &executor.ExecuteResponse{
		Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok\n", TimeMs: 10}},
		Summary: executorapi.CaseSummary{Total: 1, Run: 1, TimeMs: 10},
	}
}

func TestExecute_HappyPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{{Name: "case1", Type: "io", Status: "run", Input: "hello", Actual: "HELLO", TimeMs: 30}},
				Summary: executorapi.CaseSummary{Total: 1, Run: 1, TimeMs: 30},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     `print(input().upper())`,
		"language": "python",
		"cases": []map[string]any{
			{"name": "case1", "input": "hello"},
		},
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

	// Response must be native {results[], summary} shape
	var resp executor.ExecuteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Name != "case1" {
		t.Fatalf("expected results[0].name='case1', got %q", resp.Results[0].Name)
	}
	if resp.Results[0].Status != "run" {
		t.Fatalf("expected results[0].status='run', got %q", resp.Results[0].Status)
	}
	if resp.Results[0].Actual != "HELLO" {
		t.Fatalf("expected results[0].actual='HELLO', got %q", resp.Results[0].Actual)
	}
	// Verify executor received correct fields
	if capturedReq.Code != `print(input().upper())` {
		t.Fatalf("expected code forwarded, got %q", capturedReq.Code)
	}
	if len(capturedReq.Cases) == 0 {
		t.Fatal("expected at least one case forwarded to executor")
	}
	if capturedReq.Cases[0].Name != "case1" {
		t.Fatalf("expected cases[0].name='case1', got %q", capturedReq.Cases[0].Name)
	}
	if capturedReq.Cases[0].Input != "hello" {
		t.Fatalf("expected cases[0].input='hello', got %q", capturedReq.Cases[0].Input)
	}
}

func TestExecute_MinimalRequest(t *testing.T) {
	// No cases provided → handler synthesizes a free-run case.
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return defaultTestResponse(), nil
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

func TestExecute_NoCases_SynthesizesFreeRunCase(t *testing.T) {
	// When the frontend sends no cases, the handler synthesizes a single free-run case.
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return defaultTestResponse(), nil
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
	if len(capturedReq.Cases) != 1 {
		t.Fatalf("expected 1 synthesized case, got %d", len(capturedReq.Cases))
	}
	if capturedReq.Cases[0].Name != "run" {
		t.Errorf("expected synthesized case name='run', got %q", capturedReq.Cases[0].Name)
	}
}

func TestExecute_StudentUserAllowed(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return defaultTestResponse(), nil
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

// TestExecute_AttachedFilesTranslatedToFiles verifies that the handler translates
// frontend case.attached_files to executor Cases[].Files.
// Catches: field name mismatch between frontend (attached_files) and executor (files).
func TestExecute_AttachedFilesTranslatedToFiles(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return defaultTestResponse(), nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "x",
		"language": "python",
		"cases": []map[string]any{
			{
				"name":  "run",
				"input": "",
				"attached_files": []map[string]string{
					{"name": "data.csv", "content": "a,b"},
				},
			},
		},
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
	if len(capturedReq.Cases) == 0 {
		t.Fatal("expected at least one case")
	}
	if len(capturedReq.Cases[0].Files) != 1 {
		t.Fatalf("expected 1 file in executor case, got %d", len(capturedReq.Cases[0].Files))
	}
	if capturedReq.Cases[0].Files[0].Name != "data.csv" {
		t.Errorf("expected file name 'data.csv', got %q", capturedReq.Cases[0].Files[0].Name)
	}
}

func TestExecute_RandomSeed(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return defaultTestResponse(), nil
		},
	}

	seed := 42
	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "x",
		"language": "python",
		"cases": []map[string]any{
			{"name": "seed-case", "input": "", "random_seed": seed},
		},
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
	if len(capturedReq.Cases) == 0 || capturedReq.Cases[0].RandomSeed == nil || *capturedReq.Cases[0].RandomSeed != 42 {
		t.Fatalf("expected random_seed 42 forwarded in cases[0], got %v", capturedReq.Cases)
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
			return defaultTestResponse(), nil
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

func TestExecute_ResultsNeverNull(t *testing.T) {
	// Verify that even when executor returns nil Results, the response has an empty array.
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{Results: nil, Summary: executorapi.CaseSummary{}}, nil
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
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if string(raw["results"]) == "null" {
		t.Error("expected results to be [] not null")
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
