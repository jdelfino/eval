package handler

// Handler dispatch unit tests for F2.3: CaseResult discriminated union + kind dispatch.
//
// These tests verify that /execute routes io cases to the io path and pytest cases to
// the pytest path, and that the response contains a unified results[] with kind discriminators.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/pkg/executorapi"
)

// TestExecute_AllIOCases_DispatchesToIOPath verifies that when all cases are kind='io',
// the executor receives them all as io cases with Kind="io" and no pytest cases.
//
// Contract: io cases must be dispatched to the io runner path, not the pytest path.
// Catches: misdispatch of io cases to executor pytest path.
func TestExecute_AllIOCases_DispatchesToIOPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{
					{Name: "case1", Type: "io", Status: "passed", TimeMs: 10},
					{Name: "case2", Type: "io", Status: "passed", TimeMs: 15},
					{Name: "case3", Type: "io", Status: "failed", TimeMs: 20},
				},
				Summary: executorapi.CaseSummary{Total: 3, Passed: 2, Failed: 1},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "print(input())",
		"language": "python",
		"cases": []map[string]any{
			{"name": "case1", "kind": "io", "input": "a"},
			{"name": "case2", "kind": "io", "input": "b"},
			{"name": "case3", "kind": "io", "input": "c"},
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

	// Verify executor received 3 cases, all as kind=io (no pytest cases).
	if len(capturedReq.Cases) != 3 {
		t.Fatalf("expected 3 cases forwarded to executor, got %d", len(capturedReq.Cases))
	}
	for i, c := range capturedReq.Cases {
		if c.Kind != "io" && c.Type != "io" {
			t.Errorf("cases[%d]: expected kind=io, got kind=%q type=%q", i, c.Kind, c.Type)
		}
	}

	// Response must contain unified results[] with kind discriminator on each result.
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	var results []map[string]json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
	for i, r := range results {
		var kind string
		if err := json.Unmarshal(r["kind"], &kind); err != nil {
			t.Errorf("results[%d]: missing or invalid 'kind' field: %v", i, err)
			continue
		}
		if kind != "io" {
			t.Errorf("results[%d].kind: expected 'io', got %q", i, kind)
		}
	}
}

// TestExecute_AllPytestCases_DispatchesToPytestPath verifies that when all cases are kind='pytest',
// the executor receives them as pytest cases and the response contains CaseResultPytest entries.
//
// Contract: pytest cases must be dispatched to the pytest runner path.
// Catches: misdispatch of pytest cases to io runner.
func TestExecute_AllPytestCases_DispatchesToPytestPath(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{},
				PytestResults: []executorapi.PytestCaseResult{
					{
						Kind:       "pytest",
						Name:       "case1",
						Passed:     true,
						DurationMs: 30,
						Assertions: []executorapi.PytestAssertion{{Name: "test_add", Passed: true}},
					},
					{
						Kind:       "pytest",
						Name:       "case2",
						Passed:     false,
						DurationMs: 25,
						Assertions: []executorapi.PytestAssertion{{Name: "test_sub", Passed: false, FailureMessage: "AssertionError"}},
					},
					{
						Kind:       "pytest",
						Name:       "case3",
						Passed:     true,
						DurationMs: 20,
						Assertions: []executorapi.PytestAssertion{{Name: "test_mul", Passed: true}},
					},
				},
				Summary: executorapi.CaseSummary{Total: 3, Passed: 2, Failed: 1},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "def add(a, b): return a + b",
		"language": "python",
		"cases": []map[string]any{
			{"name": "case1", "kind": "pytest", "test_code": "def test_add(): assert add(1,2)==3", "target_path": "tests/t.py"},
			{"name": "case2", "kind": "pytest", "test_code": "def test_sub(): assert 1==2", "target_path": "tests/t.py"},
			{"name": "case3", "kind": "pytest", "test_code": "def test_mul(): assert 2*2==4", "target_path": "tests/t.py"},
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

	// Verify executor received 3 cases, all as kind=pytest.
	if len(capturedReq.Cases) != 3 {
		t.Fatalf("expected 3 cases forwarded to executor, got %d", len(capturedReq.Cases))
	}
	for i, c := range capturedReq.Cases {
		if c.Kind != "pytest" {
			t.Errorf("cases[%d]: expected kind=pytest, got %q", i, c.Kind)
		}
	}

	// Response must contain unified results[] with kind='pytest' on each result.
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	// pytest_results should NOT be in the response (unified into results[]).
	if _, hasPytestResults := resp["pytest_results"]; hasPytestResults {
		t.Error("response should NOT contain 'pytest_results' key — results must be unified into 'results'")
	}

	var results []map[string]json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results in unified results[], got %d", len(results))
	}
	for i, r := range results {
		var kind string
		if err := json.Unmarshal(r["kind"], &kind); err != nil {
			t.Errorf("results[%d]: missing or invalid 'kind' field: %v", i, err)
			continue
		}
		if kind != "pytest" {
			t.Errorf("results[%d].kind: expected 'pytest', got %q", i, kind)
		}
	}
}

// TestExecute_MixedCases_DispatchesPerCase verifies that mixed io+pytest cases are
// each dispatched to the correct runner path, and results are unified in order.
//
// Contract: dispatch must happen per-case, not globally.
// Catches: dispatch loop short-circuiting or wrong routing for mixed inputs.
func TestExecute_MixedCases_DispatchesCorrectly(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			// Build response based on what was sent.
			var ioResults []executorapi.CaseResult
			var pytestResults []executorapi.PytestCaseResult
			for _, c := range req.Cases {
				if c.Kind == "pytest" {
					pytestResults = append(pytestResults, executorapi.PytestCaseResult{
						Kind:       "pytest",
						Name:       c.Name,
						Passed:     true,
						DurationMs: 10,
						Assertions: []executorapi.PytestAssertion{{Name: "test_fn", Passed: true}},
					})
				} else {
					ioResults = append(ioResults, executorapi.CaseResult{
						Name:   c.Name,
						Type:   "io",
						Status: "passed",
						TimeMs: 5,
					})
				}
			}
			return &executor.ExecuteResponse{
				Results:       ioResults,
				PytestResults: pytestResults,
				Summary:       executorapi.CaseSummary{Total: len(req.Cases)},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "def add(a, b): return a + b",
		"language": "python",
		"cases": []map[string]any{
			{"name": "io1", "kind": "io", "input": "a"},
			{"name": "io2", "kind": "io", "input": "b"},
			{"name": "pytest1", "kind": "pytest", "test_code": "def test_x(): pass", "target_path": "tests/t.py"},
			{"name": "pytest2", "kind": "pytest", "test_code": "def test_y(): pass", "target_path": "tests/t.py"},
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

	// Verify executor received all 4 cases with correct kinds.
	if len(capturedReq.Cases) != 4 {
		t.Fatalf("expected 4 cases forwarded to executor, got %d", len(capturedReq.Cases))
	}

	// Check kinds in order: io, io, pytest, pytest.
	expectedKinds := []string{"io", "io", "pytest", "pytest"}
	for i, c := range capturedReq.Cases {
		gotKind := c.Kind
		if gotKind == "" {
			gotKind = c.Type // legacy fallback
		}
		if gotKind != expectedKinds[i] {
			t.Errorf("cases[%d].kind: expected %q, got %q", i, expectedKinds[i], gotKind)
		}
	}

	// Response results[] must have 4 entries total (2 io + 2 pytest).
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	// No separate pytest_results key should be present.
	if _, hasPytestResults := resp["pytest_results"]; hasPytestResults {
		t.Error("response should not contain 'pytest_results' — results must be unified into 'results'")
	}

	var results []map[string]json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 4 {
		t.Fatalf("expected 4 unified results, got %d", len(results))
	}

	// Count io vs pytest results.
	ioCount := 0
	pytestCount := 0
	for _, r := range results {
		var kind string
		if err := json.Unmarshal(r["kind"], &kind); err != nil {
			t.Errorf("result missing 'kind': %v", err)
			continue
		}
		switch kind {
		case "io":
			ioCount++
		case "pytest":
			pytestCount++
		default:
			t.Errorf("unexpected kind %q in results", kind)
		}
	}
	if ioCount != 2 {
		t.Errorf("expected 2 io results, got %d", ioCount)
	}
	if pytestCount != 2 {
		t.Errorf("expected 2 pytest results, got %d", pytestCount)
	}
}

// TestExecute_KindDiscriminatorOnEveryResult verifies that the response wire format
// includes a "kind" discriminator on every result entry.
//
// Contract: all results[] entries must carry the kind discriminator so consumers can
// narrow the type. This is the contract test for the wire format (test case #7 from issue).
// Catches: handler emitting un-tagged results.
func TestExecute_KindDiscriminatorOnEveryResult(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{
					{Name: "run", Type: "io", Status: "passed", TimeMs: 5},
				},
				Summary: executorapi.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "print('hi')",
		"language": "python",
		"cases":    []map[string]any{{"name": "run", "kind": "io", "input": ""}},
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

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	var results []map[string]json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}

	for i, r := range results {
		if _, ok := r["kind"]; !ok {
			t.Errorf("results[%d]: missing 'kind' discriminator field", i)
		}
	}
}

// TestExecute_PytestCaseFields verifies that pytest results carry the expected fields
// (assertions array, stderr) in the response.
//
// Contract: CaseResultPytest must include assertions[] and stderr in the wire format.
// Catches: field mapping errors when converting PytestCaseResult → CaseResultPytest JSON.
func TestExecute_PytestCaseFields(t *testing.T) {
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, _ executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{},
				PytestResults: []executorapi.PytestCaseResult{
					{
						Kind:       "pytest",
						Name:       "pytest-case",
						Passed:     false,
						DurationMs: 50,
						Stderr:     "ImportError: no module named 'foo'",
						Assertions: []executorapi.PytestAssertion{
							{
								Name:           "test_foo",
								Passed:         false,
								FailureMessage: "AssertionError: 1 != 2",
								Traceback:      "traceback...",
							},
						},
					},
				},
				Summary: executorapi.CaseSummary{Total: 1, Failed: 1},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	body, _ := json.Marshal(map[string]any{
		"code":     "def foo(): pass",
		"language": "python",
		"cases": []map[string]any{
			{"name": "pytest-case", "kind": "pytest", "test_code": "def test_foo(): assert 1==2", "target_path": "tests/t.py"},
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

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	var results []json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	var result map[string]json.RawMessage
	if err := json.Unmarshal(results[0], &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}

	// Verify kind='pytest'.
	var kind string
	if err := json.Unmarshal(result["kind"], &kind); err != nil || kind != "pytest" {
		t.Errorf("expected kind='pytest', got %q", kind)
	}

	// Verify passed=false.
	var passed bool
	if err := json.Unmarshal(result["passed"], &passed); err != nil || passed {
		t.Errorf("expected passed=false, got %v", passed)
	}

	// Verify assertions array is present with correct content.
	var assertions []map[string]json.RawMessage
	if err := json.Unmarshal(result["assertions"], &assertions); err != nil {
		t.Fatalf("assertions missing or invalid: %v", err)
	}
	if len(assertions) != 1 {
		t.Fatalf("expected 1 assertion, got %d", len(assertions))
	}

	var failureMsg string
	if err := json.Unmarshal(assertions[0]["failure_message"], &failureMsg); err != nil || failureMsg == "" {
		t.Errorf("assertion.failure_message missing or empty")
	}

	// Verify stderr is present.
	var stderr string
	if err := json.Unmarshal(result["stderr"], &stderr); err != nil || stderr == "" {
		t.Errorf("stderr field missing or empty in pytest result")
	}
}

// TestExecute_IOCaseBackwardsCompat verifies that existing io cases sent without explicit
// 'kind' field default to io dispatch (backwards compatibility).
func TestExecute_IOCaseBackwardsCompat(t *testing.T) {
	var capturedReq executor.ExecuteRequest
	execClient := &mockExecutorClient{
		executeFn: func(_ context.Context, req executor.ExecuteRequest) (*executor.ExecuteResponse, error) {
			capturedReq = req
			return &executor.ExecuteResponse{
				Results: []executorapi.CaseResult{
					{Name: "case1", Type: "io", Status: "passed", TimeMs: 5},
				},
				Summary: executorapi.CaseSummary{Total: 1, Passed: 1},
			}, nil
		},
	}

	handler := setupExecuteHandler(execClient)
	// Sending cases WITHOUT explicit 'kind' field — should default to io.
	body, _ := json.Marshal(map[string]any{
		"code":     "print(input())",
		"language": "python",
		"cases": []map[string]any{
			{"name": "case1", "input": "hello", "expected_output": "hello", "match_type": "exact"},
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

	// Verify case was treated as io.
	if len(capturedReq.Cases) != 1 {
		t.Fatalf("expected 1 case, got %d", len(capturedReq.Cases))
	}

	// Response should have kind='io' in results.
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	var results []map[string]json.RawMessage
	if err := json.Unmarshal(resp["results"], &results); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	var kind string
	if err := json.Unmarshal(results[0]["kind"], &kind); err != nil || kind != "io" {
		t.Errorf("expected kind='io', got %q", kind)
	}
}
