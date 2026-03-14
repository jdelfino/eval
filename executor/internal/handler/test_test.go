package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
)

// defaultTestConfig returns a TestHandlerConfig with sensible test defaults.
func defaultTestConfig() handler.TestHandlerConfig {
	return handler.TestHandlerConfig{
		NsjailPath:       "/usr/bin/nsjail",
		PythonPath:       "/usr/bin/python3",
		MaxOutputBytes:   1048576,
		DefaultTimeoutMs: 10000,
		MaxCodeBytes:     102400,
		MaxConcurrentExecutions: 0,
	}
}

func newTestHandler(runner handler.SandboxRunner, m *metrics.Metrics, cfg handler.TestHandlerConfig) http.HandlerFunc {
	h := handler.NewTestHandler(noopLogger(), runner, m, cfg)
	return h.ServeHTTP
}

func doTestRequest(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// makeIOTestRunnerOutput builds the JSON output that the io_test_runner.py would emit.
func makeIOTestRunnerOutput(results []map[string]interface{}) string {
	b, _ := json.Marshal(results)
	return string(b)
}

// --- Validation tests ---

func TestTest_MissingCode(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"language":"python","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing code, got %d", w.Code)
	}
}

func TestTest_EmptyCode(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"","language":"python","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty code, got %d", w.Code)
	}
}

func TestTest_MissingLanguage(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing language, got %d", w.Code)
	}
}

func TestTest_InvalidLanguage(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"ruby","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid language, got %d", w.Code)
	}
}

func TestTest_NoIOTests(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python"}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing io_tests, got %d", w.Code)
	}
}

func TestTest_EmptyIOTestList(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty io_tests list, got %d", w.Code)
	}
}

func TestTest_InvalidJSON(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	w := doTestRequest(h, `not json`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid JSON, got %d", w.Code)
	}
}

func TestTest_CodeTooLarge(t *testing.T) {
	cfg := defaultTestConfig()
	cfg.MaxCodeBytes = 10
	h := newTestHandler(successRunner, metrics.NewNoop(), cfg)
	body := `{"code":"print('this is way too long')","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"","match_type":"exact"}]}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for code too large, got %d", w.Code)
	}
}

func TestTest_TimeoutTooLarge(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"","match_type":"exact"}],"timeout_ms":99999}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for timeout too large, got %d", w.Code)
	}
}

func TestTest_NegativeTimeout(t *testing.T) {
	h := newTestHandler(successRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"","match_type":"exact"}],"timeout_ms":-1}`
	w := doTestRequest(h, body)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for negative timeout, got %d", w.Code)
	}
}

// --- Success cases ---

func TestTest_AllPassed(t *testing.T) {
	results := []map[string]interface{}{
		{"name": "t1", "type": "io", "status": "passed", "input": "1\n", "expected": "1", "actual": "1", "time_ms": 50},
		{"name": "t2", "type": "io", "status": "passed", "input": "2\n", "expected": "2", "actual": "2", "time_ms": 40},
	}
	output := makeIOTestRunnerOutput(results)
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: output, ExitCode: 0, DurationMs: 100}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"n=int(input());print(n)","language":"python","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"},{"name":"t2","input":"2","expected_output":"2","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(resp.Results))
	}
	if resp.Summary.Total != 2 {
		t.Errorf("expected summary.total=2, got %d", resp.Summary.Total)
	}
	if resp.Summary.Passed != 2 {
		t.Errorf("expected summary.passed=2, got %d", resp.Summary.Passed)
	}
	if resp.Summary.Failed != 0 {
		t.Errorf("expected summary.failed=0, got %d", resp.Summary.Failed)
	}
}

func TestTest_SomeFailed(t *testing.T) {
	results := []map[string]interface{}{
		{"name": "t1", "type": "io", "status": "passed", "input": "1\n", "expected": "1", "actual": "1", "time_ms": 50},
		{"name": "t2", "type": "io", "status": "failed", "input": "2\n", "expected": "4", "actual": "2", "time_ms": 40},
	}
	output := makeIOTestRunnerOutput(results)
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: output, ExitCode: 0, DurationMs: 100}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"n=int(input());print(n)","language":"python","io_tests":[{"name":"t1","input":"1","expected_output":"1","match_type":"exact"},{"name":"t2","input":"2","expected_output":"4","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected summary.passed=1, got %d", resp.Summary.Passed)
	}
	if resp.Summary.Failed != 1 {
		t.Errorf("expected summary.failed=1, got %d", resp.Summary.Failed)
	}
}

func TestTest_StudentCodeCrash(t *testing.T) {
	results := []map[string]interface{}{
		{"name": "t1", "type": "io", "status": "error", "input": "abc\n", "stderr": "ValueError: invalid literal", "time_ms": 20},
	}
	output := makeIOTestRunnerOutput(results)
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: output, ExitCode: 0, DurationMs: 50}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"n=int(input());print(n)","language":"python","io_tests":[{"name":"t1","input":"abc","expected_output":"abc","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Summary.Errors != 1 {
		t.Errorf("expected summary.errors=1, got %d", resp.Summary.Errors)
	}
}

func TestTest_SandboxError(t *testing.T) {
	h := newTestHandler(errorRunner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestTest_SandboxTimeout(t *testing.T) {
	// When the overall sandbox invocation times out, the handler should return a response
	// with a single error result for the timed-out execution.
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "", ExitCode: 137, TimedOut: true, DurationMs: 10000}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"while True: pass","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	// Timeout should produce an error result.
	if resp.Summary.Errors == 0 {
		t.Error("expected at least one error in summary for timed-out execution")
	}
}

func TestTest_NoExpectedOutput_RunOnly(t *testing.T) {
	// When expected_output is absent, test is "run-only" and should pass if code runs without error.
	results := []map[string]interface{}{
		{"name": "t1", "type": "io", "status": "passed", "input": "hello\n", "actual": "HELLO", "time_ms": 30},
	}
	output := makeIOTestRunnerOutput(results)
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: output, ExitCode: 0, DurationMs: 50}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	// No expected_output field
	body := `{"code":"print(input().upper())","language":"python","io_tests":[{"name":"t1","input":"hello","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected run-only test to pass, summary=%+v", resp.Summary)
	}
}

func TestTest_WrapperScriptPassedToSandbox(t *testing.T) {
	// The sandbox should receive a wrapper script (not raw student code) as Code.
	type capture struct {
		req sandbox.Request
	}
	cap := &capture{}
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		cap.req = req
		// Return a minimal valid response so parsing doesn't fail.
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(input())","language":"python","io_tests":[{"name":"t1","input":"hello","expected_output":"hello","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// The Code passed to the sandbox should be the wrapper script, not the raw student code.
	// The wrapper receives the student code and test definitions via files.
	if cap.req.Code == "print(input())" {
		t.Error("expected sandbox to receive wrapper script as Code, not raw student code")
	}
	// There should be at least one attached file (the test definitions JSON).
	if len(cap.req.Files) == 0 {
		t.Error("expected sandbox to receive attached files (test definitions)")
	}
}

func TestTest_JavaLanguagePassedToSandbox(t *testing.T) {
	cap := &captureRunner{}
	// Return valid empty JSON array.
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		cap.req = req
		cap.cfg = sandbox.Config{}
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"public class Main { public static void main(String[] a) {} }","language":"java","io_tests":[{"name":"t1","input":"","expected_output":"","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for java, got %d: %s", w.Code, w.Body.String())
	}
	// Language should be passed along to sandbox.
	if cap.req.Language != "java" {
		t.Errorf("expected sandbox req.Language='java', got %q", cap.req.Language)
	}
}

func TestTest_CustomTimeout(t *testing.T) {
	cap := &captureRunner{}
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		cap.req = req
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"}],"timeout_ms":5000}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.TimeoutMs != 5000 {
		t.Errorf("expected timeout 5000, got %d", cap.req.TimeoutMs)
	}
}

func TestTest_DefaultTimeout(t *testing.T) {
	cap := &captureRunner{}
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		cap.req = req
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.TimeoutMs != 10000 {
		t.Errorf("expected default timeout 10000, got %d", cap.req.TimeoutMs)
	}
}

func TestTest_InvalidRunnerOutput(t *testing.T) {
	// When the wrapper script emits non-JSON output, expect an HTTP 500.
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "not json", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for bad runner output, got %d", w.Code)
	}
}

func TestTest_SummaryCalculated(t *testing.T) {
	// Verify that the handler correctly computes summary from results.
	results := []map[string]interface{}{
		{"name": "t1", "type": "io", "status": "passed", "input": "", "expected": "1", "actual": "1", "time_ms": int64(10)},
		{"name": "t2", "type": "io", "status": "failed", "input": "", "expected": "2", "actual": "3", "time_ms": int64(20)},
		{"name": "t3", "type": "io", "status": "error", "input": "", "stderr": "crash", "time_ms": int64(5)},
	}
	output := makeIOTestRunnerOutput(results)
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: output, ExitCode: 0, DurationMs: 40}, nil
	}
	h := newTestHandler(runner, metrics.NewNoop(), defaultTestConfig())
	body := `{"code":"print(1)","language":"python","io_tests":[{"name":"t1","input":"","expected_output":"1","match_type":"exact"},{"name":"t2","input":"","expected_output":"2","match_type":"exact"},{"name":"t3","input":"","expected_output":"","match_type":"exact"}]}`
	w := doTestRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.TestResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Summary.Total != 3 {
		t.Errorf("expected total=3, got %d", resp.Summary.Total)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected passed=1, got %d", resp.Summary.Passed)
	}
	if resp.Summary.Failed != 1 {
		t.Errorf("expected failed=1, got %d", resp.Summary.Failed)
	}
	if resp.Summary.Errors != 1 {
		t.Errorf("expected errors=1, got %d", resp.Summary.Errors)
	}
}
