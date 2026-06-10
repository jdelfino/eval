package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"syscall"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/store"
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
	r := executorapi.CaseResult{Name: "run", Type: "io", Status: "run", Actual: "ok\n", TimeMs: 10}
	return &executor.ExecuteResponse{
		Results: []executorapi.ExecuteResultUnion{{Kind: "io", IO: &r}},
		Summary: executorapi.CaseSummary{Total: 1, Run: 1, TimeMs: 10},
	}
}

func TestExecute_HappyPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	r := executorapi.CaseResult{Name: "case1", Type: "io", Status: "run", Input: "hello", Actual: "HELLO", TimeMs: 30}
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executorapi.ExecuteResultUnion{{Kind: "io", IO: &r}},
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

	// Response must be native {results[], summary} shape — decode as raw JSON to inspect fields.
	var rawResp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &rawResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	var results []map[string]json.RawMessage
	if err := json.Unmarshal(rawResp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	var name string
	if err := json.Unmarshal(results[0]["name"], &name); err != nil || name != "case1" {
		t.Fatalf("expected results[0].name='case1', got %q", name)
	}
	var status string
	if err := json.Unmarshal(results[0]["status"], &status); err != nil || status != "run" {
		t.Fatalf("expected results[0].status='run', got %q", status)
	}
	var actual string
	if err := json.Unmarshal(results[0]["actual"], &actual); err != nil || actual != "HELLO" {
		t.Fatalf("expected results[0].actual='HELLO', got %q", actual)
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

// --- student_work_id tests ---

// executeTestRepos is a minimal store.Repos for execute handler tests that
// need student-work lookup and SetStudentWorkRunResult.
type executeTestRepos struct {
	stubRepos
	getStudentWorkFn         func(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error)
	setStudentWorkRunResultFn func(ctx context.Context, id uuid.UUID, allPassed bool, at time.Time) error
}

func (r *executeTestRepos) GetStudentWork(ctx context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
	if r.getStudentWorkFn != nil {
		return r.getStudentWorkFn(ctx, id)
	}
	panic("executeTestRepos: unexpected GetStudentWork call")
}

func (r *executeTestRepos) SetStudentWorkRunResult(ctx context.Context, id uuid.UUID, allPassed bool, at time.Time) error {
	if r.setStudentWorkRunResultFn != nil {
		return r.setStudentWorkRunResultFn(ctx, id, allPassed, at)
	}
	panic("executeTestRepos: unexpected SetStudentWorkRunResult call")
}

// setupExecuteHandlerWithRepos sets up the Execute handler with mock repos injected.
func setupExecuteHandlerWithRepos(execClient ExecutorClient, repos store.Repos) http.Handler {
	h := NewExecuteHandler(execClient)
	r := chi.NewRouter()
	r.Post("/execute", func(w http.ResponseWriter, req *http.Request) {
		ctx := store.WithRepos(req.Context(), repos)
		h.Execute(w, req.WithContext(ctx))
	})
	return r
}

// testCanonicalWork builds a StudentWorkWithProblem fixture with given canonical test cases.
func testCanonicalWork(ownerID uuid.UUID, testCasesJSON []byte) *store.StudentWorkWithProblem {
	return &store.StudentWorkWithProblem{
		StudentWork: store.StudentWork{
			ID:     uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
			UserID: ownerID,
		},
		Problem: store.Problem{
			ID:        uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
			TestCases: testCasesJSON,
		},
	}
}

// allPassedSummary returns an executor response where all cases passed.
func allPassedSummary(n int) *executor.ExecuteResponse {
	results := make([]executorapi.ExecuteResultUnion, n)
	for i := range n {
		r := executorapi.CaseResult{Name: fmt.Sprintf("case%d", i), Status: "passed", Actual: "ok\n", TimeMs: 10}
		results[i] = executorapi.ExecuteResultUnion{Kind: "io", IO: &r}
	}
	return &executor.ExecuteResponse{
		Results: results,
		Summary: executorapi.CaseSummary{Total: n, Passed: n},
	}
}

// failedSummary returns an executor response with one case failed.
func failedSummary() *executor.ExecuteResponse {
	r := executorapi.CaseResult{Name: "case0", Status: "failed", Actual: "wrong\n", TimeMs: 10}
	return &executor.ExecuteResponse{
		Results: []executorapi.ExecuteResultUnion{{Kind: "io", IO: &r}},
		Summary: executorapi.CaseSummary{Total: 1, Failed: 1},
	}
}

// canonicalIOTestCasesJSON builds a JSON array of io test cases with given inputs/expected outputs.
// Used to set up Problem.TestCases so the execute handler can match against them.
func canonicalIOTestCasesJSON(cases []struct{ input, expected, matchType string }) []byte {
	type ioCase struct {
		Kind           string `json:"kind"`
		Name           string `json:"name"`
		Input          string `json:"input"`
		ExpectedOutput string `json:"expected_output,omitempty"`
		MatchType      string `json:"match_type"`
	}
	arr := make([]ioCase, len(cases))
	for i, c := range cases {
		arr[i] = ioCase{Kind: "io", Name: fmt.Sprintf("canonical%d", i), Input: c.input, ExpectedOutput: c.expected, MatchType: c.matchType}
	}
	b, _ := json.Marshal(arr)
	return b
}

// TestExecute_WithStudentWorkID_AllCasesCovered_AllPassed verifies that when
// student_work_id is present and the run includes every canonical case (matched
// by content) and all pass, SetStudentWorkRunResult is called with allPassed=true.
// Catches: happy-path write missing (TC4).
func TestExecute_WithStudentWorkID_AllCasesCovered_AllPassed(t *testing.T) {
	ownerID := testStudentID
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID

	var persistedAllPassed *bool
	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, id uuid.UUID) (*store.StudentWorkWithProblem, error) {
			if id != workID {
				t.Fatalf("unexpected work id: %v", id)
			}
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, id uuid.UUID, allPassed bool, _ time.Time) error {
			persistedAllPassed = &allPassed
			return nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return allPassedSummary(1), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":            `print(input().upper())`,
		"language":        "python",
		"student_work_id": workID.String(),
		// The frontend renames the case to "run" but must include input/expected_output/match_type.
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: ownerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if persistedAllPassed == nil {
		t.Fatal("expected SetStudentWorkRunResult to be called, but it wasn't")
	}
	if !*persistedAllPassed {
		t.Errorf("expected allPassed=true, got false")
	}
}

// TestExecute_WithStudentWorkID_MissingCanonicalCase verifies that when a canonical
// case is absent from the run, SetStudentWorkRunResult is called with allPassed=false.
// Catches: coverage/pass conflation (TC5 - missing case).
func TestExecute_WithStudentWorkID_MissingCanonicalCase(t *testing.T) {
	ownerID := testStudentID
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	// Two canonical cases, but the run only includes one.
	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
		{input: "world", expected: "WORLD\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID

	var persistedAllPassed *bool
	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, _ uuid.UUID, allPassed bool, _ time.Time) error {
			persistedAllPassed = &allPassed
			return nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return allPassedSummary(1), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	// Only include one of the two canonical cases.
	body, _ := json.Marshal(map[string]any{
		"code":            `print(input().upper())`,
		"language":        "python",
		"student_work_id": workID.String(),
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: ownerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if persistedAllPassed == nil {
		t.Fatal("expected SetStudentWorkRunResult to be called")
	}
	if *persistedAllPassed {
		t.Errorf("expected allPassed=false when canonical case missing, got true")
	}
}

// TestExecute_WithStudentWorkID_CaseFailed verifies that when all canonical cases
// are covered but one fails (Summary.Failed > 0), allPassed=false is persisted.
// Catches: coverage/pass conflation (TC5 - case failed).
func TestExecute_WithStudentWorkID_CaseFailed(t *testing.T) {
	ownerID := testStudentID
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID

	var persistedAllPassed *bool
	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, _ uuid.UUID, allPassed bool, _ time.Time) error {
			persistedAllPassed = &allPassed
			return nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return failedSummary(), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":            `print("wrong")`,
		"language":        "python",
		"student_work_id": workID.String(),
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: ownerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if persistedAllPassed == nil {
		t.Fatal("expected SetStudentWorkRunResult to be called")
	}
	if *persistedAllPassed {
		t.Errorf("expected allPassed=false when case failed, got true")
	}
}

// TestExecute_ContentBasedMatching_NameDoesNotMatter verifies that canonical io cases
// are matched by input/expected_output/match_type, NOT by name. The frontend renames
// io cases to "run" on the run path — backend must match on content.
// Catches: name-based matching bug (TC6).
func TestExecute_ContentBasedMatching_NameDoesNotMatter(t *testing.T) {
	ownerID := testStudentID
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	// Canonical case named "canonical0".
	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID

	var persistedAllPassed *bool
	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, _ uuid.UUID, allPassed bool, _ time.Time) error {
			persistedAllPassed = &allPassed
			return nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return allPassedSummary(1), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	// Request case is named "run" (as the frontend does), but content matches the canonical case.
	body, _ := json.Marshal(map[string]any{
		"code":            `print(input().upper())`,
		"language":        "python",
		"student_work_id": workID.String(),
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: ownerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if persistedAllPassed == nil {
		t.Fatal("expected SetStudentWorkRunResult to be called")
	}
	if !*persistedAllPassed {
		t.Errorf("expected allPassed=true with content-based matching, got false (name-based matching bug?)")
	}
}

// TestExecute_WithStudentWorkID_NonOwner_Returns403 verifies that a student
// attempting to grade another student's work is rejected with 403 and nothing
// is persisted.
// Catches: cross-student grading writes (TC7 - non-owner).
func TestExecute_WithStudentWorkID_NonOwner_Returns403(t *testing.T) {
	ownerID := testStudentID
	callerID := uuid.MustParse("ffffffff-ffff-ffff-ffff-ffffffffffff") // different user
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID
	// Work belongs to ownerID, but callerID is different.

	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, _ uuid.UUID, _ bool, _ time.Time) error {
			t.Error("SetStudentWorkRunResult must NOT be called for non-owner")
			return nil
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			t.Error("executor must NOT be called when 403 is returned early")
			return defaultTestResponse(), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":            "x",
		"language":        "python",
		"student_work_id": workID.String(),
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: callerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestExecute_WithStudentWorkID_UnknownID_Returns404 verifies that an unknown
// student_work_id results in 404.
// Catches: cross-student grading writes (TC7 - unknown id).
func TestExecute_WithStudentWorkID_UnknownID_Returns404(t *testing.T) {
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return nil, store.ErrNotFound
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			t.Error("executor must NOT be called when work not found")
			return defaultTestResponse(), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":            "x",
		"language":        "python",
		"student_work_id": workID.String(),
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: testStudentID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestExecute_NoStudentWorkID_NoStoreCallsResponseIdentical verifies that when
// student_work_id is absent, no store calls are made and the response is identical
// to the existing stateless behavior.
// Catches: stateless-contract regression (TC8).
func TestExecute_NoStudentWorkID_NoStoreCallsResponseIdentical(t *testing.T) {
	// This repos will panic if any store method is called.
	repos := stubRepos{}

	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return defaultTestResponse(), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":     `print("hello")`,
		"language": "python",
		"cases": []map[string]any{
			{"name": "case1", "input": ""},
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
	// Verify executor was called with the case.
	if len(capturedReq.Cases) != 1 || capturedReq.Cases[0].Name != "case1" {
		t.Errorf("expected cases forwarded correctly, got %+v", capturedReq.Cases)
	}
}

// TestExecute_PersistError_StillReturns200 verifies that a persist failure
// (SetStudentWorkRunResult returns error) does not prevent the 200 response
// with execution results from being returned.
// Catches: execution results held hostage by a write failure (TC9).
func TestExecute_PersistError_StillReturns200(t *testing.T) {
	ownerID := testStudentID
	workID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

	canonical := canonicalIOTestCasesJSON([]struct{ input, expected, matchType string }{
		{input: "hello", expected: "HELLO\n", matchType: "exact"},
	})
	work := testCanonicalWork(ownerID, canonical)
	work.ID = workID

	repos := &executeTestRepos{
		getStudentWorkFn: func(_ context.Context, _ uuid.UUID) (*store.StudentWorkWithProblem, error) {
			return work, nil
		},
		setStudentWorkRunResultFn: func(_ context.Context, _ uuid.UUID, _ bool, _ time.Time) error {
			return errors.New("db write failed")
		},
	}

	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return allPassedSummary(1), nil
		},
	}

	handler := setupExecuteHandlerWithRepos(execClient, repos)
	body, _ := json.Marshal(map[string]any{
		"code":            `print(input().upper())`,
		"language":        "python",
		"student_work_id": workID.String(),
		"cases": []map[string]any{
			{"name": "run", "kind": "io", "input": "hello", "expected_output": "HELLO\n", "match_type": "exact"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: ownerID, Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// Must still return 200 with execution results despite persist failure.
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 even on persist error, got %d: %s", rec.Code, rec.Body.String())
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if raw["results"] == nil {
		t.Error("expected results in response even when persist failed")
	}
}
