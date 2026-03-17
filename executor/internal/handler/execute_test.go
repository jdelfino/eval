package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/prometheus/client_golang/prometheus"
	io_prometheus_client "github.com/prometheus/client_model/go"
)

func defaultConfig() handler.ExecuteHandlerConfig {
	return handler.ExecuteHandlerConfig{
		NsjailPath:       "/usr/bin/nsjail",
		PythonPath:       "/usr/bin/python3",
		MaxOutputBytes:   1048576,
		DefaultTimeoutMs: 10000,
		MaxCodeBytes:     102400,
	}
}

func newHandler(runner handler.SandboxRunner, m *metrics.Metrics, cfg handler.ExecuteHandlerConfig) http.HandlerFunc {
	h := handler.NewExecuteHandler(noopLogger(), runner, m, cfg)
	return h.ServeHTTP
}

func noopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func successRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return &sandbox.Result{
		Stdout:     "hello\n",
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 45,
	}, nil
}

func errorRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return nil, fmt.Errorf("nsjail binary not found")
}

func timeoutRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return &sandbox.Result{
		Stdout:     "",
		Stderr:     "",
		ExitCode:   137,
		TimedOut:   true,
		DurationMs: 10000,
	}, nil
}

// captureRunner records the sandbox request for inspection.
type captureRunner struct {
	req sandbox.Request
	cfg sandbox.Config
}

func (c *captureRunner) run(_ context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
	c.req = req
	c.cfg = cfg
	// Return valid JSON array for the iotestrunner output parser.
	return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 1}, nil
}

func doRequest(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/execute", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestExecute_Success(t *testing.T) {
	// successRunner returns stdout "hello\n". A run-only case (no expected_output)
	// should appear in results with status "run".
	runOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "run", "type": "io", "status": "run", "input": "", "actual": "hello", "time_ms": 45},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: runOutput, ExitCode: 0, DurationMs: 45}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print('hello')","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Status != "run" {
		t.Errorf("expected status 'run', got %q", resp.Results[0].Status)
	}
	if resp.Results[0].Actual != "hello" {
		t.Errorf("expected actual 'hello', got %q", resp.Results[0].Actual)
	}
	if resp.Results[0].TimeMs != 45 {
		t.Errorf("expected 45ms, got %d", resp.Results[0].TimeMs)
	}
}

func TestExecute_CodeFailure(t *testing.T) {
	// When student code crashes, the iotestrunner emits status "error" with stderr.
	crashOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "run", "type": "io", "status": "error", "input": "", "stderr": "NameError: name 'x' is not defined", "time_ms": 30},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: crashOutput, ExitCode: 0, DurationMs: 30}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(x)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Status != "error" {
		t.Errorf("expected status 'error', got %q", resp.Results[0].Status)
	}
	if resp.Results[0].Stderr == "" {
		t.Error("expected non-empty stderr")
	}
}

func TestExecute_Timeout(t *testing.T) {
	h := newHandler(timeoutRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"while True: pass","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result for timeout")
	}
	if resp.Results[0].Status != "error" {
		t.Errorf("expected status 'error' for timeout, got %q", resp.Results[0].Status)
	}
	if resp.Results[0].Stderr != "execution timed out" {
		t.Errorf("expected timeout error in Stderr, got %q", resp.Results[0].Stderr)
	}
}

func TestExecute_InternalError(t *testing.T) {
	h := newHandler(errorRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}

	var errResp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
		t.Fatal(err)
	}
	if got := errResp["error"]; got != "sandbox setup failed: nsjail binary not found" {
		t.Errorf("expected sandbox setup error detail, got %q", got)
	}
}

func TestExecute_EmptyCode(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_MissingCode(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_InvalidJSON(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `not json`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_CodeTooLarge(t *testing.T) {
	cfg := defaultConfig()
	cfg.MaxCodeBytes = 10
	h := newHandler(successRunner, metrics.NewNoop(), cfg)
	w := doRequest(h, `{"code":"print('this is way too long')","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_NegativeTimeout(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}],"timeout_ms":-1}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_TimeoutTooLarge(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}],"timeout_ms":99999}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_CustomTimeout(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}],"timeout_ms":5000}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.req.TimeoutMs != 5000 {
		t.Errorf("expected timeout 5000, got %d", cap.req.TimeoutMs)
	}
}

func TestExecute_DefaultTimeout(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.req.TimeoutMs != 10000 {
		t.Errorf("expected default timeout 10000, got %d", cap.req.TimeoutMs)
	}
}

func TestExecute_BodyTooLarge(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	// Create a body larger than 1MB
	large := bytes.Repeat([]byte("x"), 2*1024*1024)
	req := httptest.NewRequest(http.MethodPost, "/execute", bytes.NewReader(large))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}


func newTestMetrics(t *testing.T) *metrics.Metrics {
	t.Helper()
	reg := prometheus.NewRegistry()
	return metrics.New(reg)
}

func getCounterValue(t *testing.T, cv *prometheus.CounterVec, label string) float64 {
	t.Helper()
	m := &io_prometheus_client.Metric{}
	if err := cv.WithLabelValues(label).Write(m); err != nil {
		t.Fatalf("failed to write metric: %v", err)
	}
	return m.GetCounter().GetValue()
}

func getGaugeValue(t *testing.T, g prometheus.Gauge) float64 {
	t.Helper()
	m := &io_prometheus_client.Metric{}
	if err := g.Write(m); err != nil {
		t.Fatalf("failed to write metric: %v", err)
	}
	return m.GetGauge().GetValue()
}

func TestExecute_MetricsSuccess(t *testing.T) {
	// successRunner returns empty JSON for case results (all run, no failures).
	allPassRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	m := newTestMetrics(t)
	h := newHandler(allPassRunner, m, defaultConfig())
	w := doRequest(h, `{"code":"print('hello')","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	if v := getCounterValue(t, m.ExecutionsTotal, "success"); v != 1 {
		t.Errorf("expected executions_total{status=success}=1, got %v", v)
	}
	// Active executions should be 0 after completion.
	if v := getGaugeValue(t, m.ActiveExecutions); v != 0 {
		t.Errorf("expected active_executions=0 after completion, got %v", v)
	}
}

func TestExecute_MetricsFailure(t *testing.T) {
	// Return a failed case result so the handler records "failure".
	failCaseRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		out := makeIOTestRunnerOutput([]map[string]interface{}{
			{"name": "run", "type": "io", "status": "failed", "input": "", "expected": "x", "actual": "y", "time_ms": 10},
		})
		return &sandbox.Result{Stdout: out, ExitCode: 0, DurationMs: 10}, nil
	}
	m := newTestMetrics(t)
	h := newHandler(failCaseRunner, m, defaultConfig())
	doRequest(h, `{"code":"print(x)","language":"python","cases":[{"name":"run","type":"io","input":"","expected_output":"x","match_type":"exact"}]}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "failure"); v != 1 {
		t.Errorf("expected executions_total{status=failure}=1, got %v", v)
	}
}

func TestExecute_MetricsTimeout(t *testing.T) {
	m := newTestMetrics(t)
	h := newHandler(timeoutRunner, m, defaultConfig())
	doRequest(h, `{"code":"while True: pass","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "timeout"); v != 1 {
		t.Errorf("expected executions_total{status=timeout}=1, got %v", v)
	}
}

func TestExecute_MetricsError(t *testing.T) {
	m := newTestMetrics(t)
	h := newHandler(errorRunner, m, defaultConfig())
	doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "error"); v != 1 {
		t.Errorf("expected executions_total{status=error}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationCodeTooLarge(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultConfig()
	cfg.MaxCodeBytes = 10
	h := newHandler(successRunner, m, cfg)
	doRequest(h, `{"code":"print('this is way too long')","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "code_too_large"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=code_too_large}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationInvalidJSON(t *testing.T) {
	m := newTestMetrics(t)
	h := newHandler(successRunner, m, defaultConfig())
	doRequest(h, `not json`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "invalid_request"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=invalid_request}=1, got %v", v)
	}
}

func TestExecute_ConcurrencyLimit_RejectWhenFull(t *testing.T) {
	entryCh := make(chan struct{})
	blockCh := make(chan struct{})
	blockingRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		close(entryCh)
		<-blockCh
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 1}, nil
	}

	cfg := defaultConfig()
	cfg.MaxConcurrentExecutions = 1
	h := handler.NewExecuteHandler(noopLogger(), blockingRunner, metrics.NewNoop(), cfg)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		doRequest(h.ServeHTTP, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	}()

	// Wait for first request to enter the runner (slot occupied).
	<-entryCh

	// Second request should be rejected with 429.
	w := doRequest(h.ServeHTTP, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}

	var errResp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
		t.Fatal(err)
	}
	if errResp["error"] != "too many concurrent executions" {
		t.Errorf("unexpected error message: %q", errResp["error"])
	}

	// Unblock.
	close(blockCh)
	wg.Wait()
}

func TestExecute_ConcurrencyLimit_AllowsAfterRelease(t *testing.T) {
	cfg := defaultConfig()
	cfg.MaxConcurrentExecutions = 1
	allPassRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 1}, nil
	}
	h := handler.NewExecuteHandler(noopLogger(), allPassRunner, metrics.NewNoop(), cfg)

	// First request succeeds (acquires and releases).
	w1 := doRequest(h.ServeHTTP, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w1.Code != http.StatusOK {
		t.Fatalf("first request: expected 200, got %d", w1.Code)
	}

	// Second request should also succeed since first released the slot.
	w2 := doRequest(h.ServeHTTP, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w2.Code != http.StatusOK {
		t.Fatalf("second request: expected 200, got %d", w2.Code)
	}
}

func TestExecute_ConcurrencyLimit_ZeroMeansUnlimited(t *testing.T) {
	cfg := defaultConfig()
	cfg.MaxConcurrentExecutions = 0
	allPassRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 1}, nil
	}
	h := handler.NewExecuteHandler(noopLogger(), allPassRunner, metrics.NewNoop(), cfg)

	w := doRequest(h.ServeHTTP, `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

// --- Language validation tests ---

func TestExecute_ValidateLanguage_EmptyIsRejected(t *testing.T) {
	// Empty language must now be rejected — every request must specify a language explicitly.
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty language, got %d", w.Code)
	}
}

func TestExecute_ValidateLanguage_PythonIsOk(t *testing.T) {
	allPassRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 1}, nil
	}
	h := newHandler(allPassRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for language=python, got %d", w.Code)
	}
}

func TestExecute_ValidateLanguage_JavaIsOk(t *testing.T) {
	// Java validation passes; captureRunner returns empty JSON array.
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"public class Main {}","language":"java","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for language=java (validation passes), got %d", w.Code)
	}
}

func TestExecute_ValidateLanguage_InvalidRejected(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"ruby","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported language, got %d", w.Code)
	}
	var errResp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
		t.Fatal(err)
	}
	if got := errResp["error"]; !strings.Contains(got, "language") {
		t.Errorf("expected language error message, got %q", got)
	}
}

func TestExecute_LanguagePassedToSandbox(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.req.Language != "python" {
		t.Errorf("expected sandbox req.Language='python', got %q", cap.req.Language)
	}
}

func TestExecute_JavaPathPassedToSandboxConfig(t *testing.T) {
	cap := &captureRunner{}
	cfg := defaultConfig()
	cfg.JavaPath = "/usr/bin/java"
	cfg.JavacPath = "/usr/bin/javac"
	h := newHandler(cap.run, metrics.NewNoop(), cfg)
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.cfg.JavaPath != "/usr/bin/java" {
		t.Errorf("expected cfg.JavaPath='/usr/bin/java', got %q", cap.cfg.JavaPath)
	}
	if cap.cfg.JavacPath != "/usr/bin/javac" {
		t.Errorf("expected cfg.JavacPath='/usr/bin/javac', got %q", cap.cfg.JavacPath)
	}
}

// --- Cases mode tests ---

// makeIOTestRunnerOutput builds the JSON output that the io_test_runner.py would emit.
func makeIOTestRunnerOutput(results []map[string]interface{}) string {
	b, _ := json.Marshal(results)
	return string(b)
}

func TestExecute_Cases_SingleRunOnly(t *testing.T) {
	// A case with no expected_output should get status "run".
	runOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "case1", "type": "io", "status": "run", "input": "hello\n", "actual": "HELLO", "time_ms": 30},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: runOutput, ExitCode: 0, DurationMs: 50}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input().upper())","language":"python","cases":[{"name":"case1","type":"io","input":"hello"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Status != "run" {
		t.Errorf("expected status 'run' for case without expected_output, got %q", resp.Results[0].Status)
	}
}

func TestExecute_Cases_WithExpectedOutput_Passed(t *testing.T) {
	// A case with expected_output that matches should get status "passed".
	runOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "case1", "type": "io", "status": "passed", "input": "hello\n", "expected": "hello", "actual": "hello", "time_ms": 30},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: runOutput, ExitCode: 0, DurationMs: 50}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[{"name":"case1","type":"io","input":"hello","expected_output":"hello","match_type":"exact"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Status != "passed" {
		t.Errorf("expected status 'passed', got %q", resp.Results[0].Status)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected summary.passed=1, got %d", resp.Summary.Passed)
	}
}

func TestExecute_Cases_WithExpectedOutput_Failed(t *testing.T) {
	// A case with expected_output that doesn't match should get status "failed".
	runOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "case1", "type": "io", "status": "failed", "input": "hello\n", "expected": "world", "actual": "hello", "time_ms": 30},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: runOutput, ExitCode: 0, DurationMs: 50}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[{"name":"case1","type":"io","input":"hello","expected_output":"world","match_type":"exact"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Results[0].Status != "failed" {
		t.Errorf("expected status 'failed', got %q", resp.Results[0].Status)
	}
	if resp.Summary.Failed != 1 {
		t.Errorf("expected summary.failed=1, got %d", resp.Summary.Failed)
	}
}

func TestExecute_Cases_MultipleCases(t *testing.T) {
	// Multiple cases: one passed, one failed, one run-only.
	runOutput := makeIOTestRunnerOutput([]map[string]interface{}{
		{"name": "c1", "type": "io", "status": "passed", "input": "1\n", "expected": "1", "actual": "1", "time_ms": 10},
		{"name": "c2", "type": "io", "status": "failed", "input": "2\n", "expected": "4", "actual": "2", "time_ms": 10},
		{"name": "c3", "type": "io", "status": "run", "input": "3\n", "actual": "3", "time_ms": 10},
	})
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: runOutput, ExitCode: 0, DurationMs: 40}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[` +
		`{"name":"c1","type":"io","input":"1","expected_output":"1","match_type":"exact"},` +
		`{"name":"c2","type":"io","input":"2","expected_output":"4","match_type":"exact"},` +
		`{"name":"c3","type":"io","input":"3"}` +
		`]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(resp.Results))
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
}

func TestExecute_Cases_SandboxTimeout(t *testing.T) {
	// When sandbox times out, all cases should have status "error".
	timeoutRunner2 := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "", ExitCode: 137, TimedOut: true, DurationMs: 10000}, nil
	}
	h := newHandler(timeoutRunner2, metrics.NewNoop(), defaultConfig())
	body := `{"code":"while True: pass","language":"python","cases":[{"name":"t1","type":"io","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Summary.Errors == 0 {
		t.Error("expected at least one error in summary for timed-out execution")
	}
}

func TestExecute_Cases_NoCases_RequiresCode(t *testing.T) {
	// No cases: requires code, language.
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"","language":"python","cases":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty code, got %d", w.Code)
	}
}

func TestExecute_Cases_WrapperScriptPassedToSandbox(t *testing.T) {
	// When cases are present, sandbox should receive a wrapper script, not raw student code.
	type capture struct {
		req sandbox.Request
	}
	cap := &capture{}
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		cap.req = req
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[{"name":"t1","type":"io","input":"hello","expected_output":"hello","match_type":"exact"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// The Code passed to the sandbox should NOT be the raw student code.
	if cap.req.Code == "print(input())" {
		t.Error("expected sandbox to receive wrapper script as Code, not raw student code")
	}
	// There should be at least one attached file (the test definitions JSON).
	if len(cap.req.Files) == 0 {
		t.Error("expected sandbox to receive attached files (test definitions)")
	}
}

func TestExecute_Cases_RandomSeedForwardedToIOTests(t *testing.T) {
	// Verify that random_seed on a CaseDef is serialized into io_tests.json for the Python runner.
	var capturedFiles []sandbox.File
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		capturedFiles = req.Files
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"import random; print(random.randint(1,100))","language":"python","cases":[{"name":"seed-test","type":"io","input":"","random_seed":42}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var testsJSON string
	for _, f := range capturedFiles {
		if f.Name == "io_tests.json" {
			testsJSON = f.Content
			break
		}
	}
	if testsJSON == "" {
		t.Fatal("io_tests.json not found in sandbox files")
	}
	if !strings.Contains(testsJSON, `"random_seed":42`) {
		t.Errorf("expected random_seed=42 in io_tests.json, got: %s", testsJSON)
	}
}

func TestExecute_Cases_RandomSeedAbsentWhenNil(t *testing.T) {
	// Verify that random_seed is NOT present in io_tests.json when not set on a CaseDef.
	var capturedFiles []sandbox.File
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		capturedFiles = req.Files
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print('hello')","language":"python","cases":[{"name":"t1","type":"io","input":""}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var testsJSON string
	for _, f := range capturedFiles {
		if f.Name == "io_tests.json" {
			testsJSON = f.Content
			break
		}
	}
	if testsJSON == "" {
		t.Fatal("io_tests.json not found in sandbox files")
	}
	if strings.Contains(testsJSON, "random_seed") {
		t.Errorf("expected random_seed to be absent when nil, got: %s", testsJSON)
	}
}

func TestExecute_Cases_InvalidRunnerOutput(t *testing.T) {
	// When sandbox emits non-JSON, expect HTTP 500.
	runner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		return &sandbox.Result{Stdout: "not json", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(1)","language":"python","cases":[{"name":"t1","type":"io","input":"","expected_output":"1","match_type":"exact"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for bad runner output, got %d", w.Code)
	}
}

func TestExecute_Cases_CasesForwardedToSandbox(t *testing.T) {
	// Verify match_type is serialized into io_tests.json for the Python runner.
	var capturedFiles []sandbox.File
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		capturedFiles = req.Files
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print('hello world')","language":"python","cases":[{"name":"t1","type":"io","input":"","expected_output":"hello","match_type":"contains"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var testsJSON string
	for _, f := range capturedFiles {
		if f.Name == "io_tests.json" {
			testsJSON = f.Content
			break
		}
	}
	if testsJSON == "" {
		t.Fatal("io_tests.json not found in sandbox files")
	}
	if !strings.Contains(testsJSON, `"match_type":"contains"`) {
		t.Errorf("expected match_type=contains in io_tests.json, got: %s", testsJSON)
	}
}

func TestExecute_Cases_ArgsUseRelativeFilenames(t *testing.T) {
	// Verify that the Args passed to the sandbox use relative filenames (not absolute /tmp/work/ paths).
	// This ensures RunUnsafe mode (used in CI) works correctly because files are written to a
	// temp dir whose CWD matches the args.
	var capturedArgs []string
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		capturedArgs = req.Args
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())

	// Python case: arg[0] should be "solution.py", arg[1] should be "io_tests.json"
	body := `{"code":"print('hello')","language":"python","cases":[{"name":"t1","type":"io","input":""}]}`
	w := doRequest(h, body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(capturedArgs) < 2 {
		t.Fatalf("expected at least 2 args, got %d", len(capturedArgs))
	}
	if capturedArgs[0] != "solution.py" {
		t.Errorf("expected args[0]='solution.py' (relative), got %q", capturedArgs[0])
	}
	if capturedArgs[1] != "io_tests.json" {
		t.Errorf("expected args[1]='io_tests.json' (relative), got %q", capturedArgs[1])
	}
}

func TestExecute_Cases_ArgsUseRelativeFilenames_Java(t *testing.T) {
	// Verify that the Args passed to the sandbox use relative filenames for Java.
	var capturedArgs []string
	runner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		capturedArgs = req.Args
		return &sandbox.Result{Stdout: "[]", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(runner, metrics.NewNoop(), defaultConfig())

	body := `{"code":"public class Main {}","language":"java","cases":[{"name":"t1","type":"io","input":""}]}`
	w := doRequest(h, body)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(capturedArgs) < 2 {
		t.Fatalf("expected at least 2 args, got %d", len(capturedArgs))
	}
	if capturedArgs[0] != "Main.java" {
		t.Errorf("expected args[0]='Main.java' (relative), got %q", capturedArgs[0])
	}
	if capturedArgs[1] != "io_tests.json" {
		t.Errorf("expected args[1]='io_tests.json' (relative), got %q", capturedArgs[1])
	}
}
