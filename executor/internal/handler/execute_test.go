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

// successRunner returns a successful sandbox result with stdout "hello\n".
func successRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return &sandbox.Result{
		Stdout:     "hello\n",
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 45,
	}, nil
}

// failRunner simulates a crash (non-zero exit code, stderr output).
func failRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return &sandbox.Result{
		Stdout:     "",
		Stderr:     "NameError: name 'x' is not defined",
		ExitCode:   1,
		TimedOut:   false,
		DurationMs: 30,
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
	return &sandbox.Result{Stdout: "ok\n", ExitCode: 0, DurationMs: 1}, nil
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
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
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
	if resp.Results[0].Actual != "hello\n" {
		t.Errorf("expected actual 'hello\\n', got %q", resp.Results[0].Actual)
	}
	if resp.Results[0].TimeMs != 45 {
		t.Errorf("expected 45ms, got %d", resp.Results[0].TimeMs)
	}
}

func TestExecute_CodeFailure(t *testing.T) {
	// When student code crashes (non-zero exit), the case result has status "error".
	h := newHandler(failRunner, metrics.NewNoop(), defaultConfig())
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
	m := newTestMetrics(t)
	h := newHandler(successRunner, m, defaultConfig())
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
	m := newTestMetrics(t)
	h := newHandler(failRunner, m, defaultConfig())
	doRequest(h, `{"code":"print(x)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)

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
		return &sandbox.Result{Stdout: "ok\n", ExitCode: 0, DurationMs: 1}, nil
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
	h := handler.NewExecuteHandler(noopLogger(), successRunner, metrics.NewNoop(), cfg)

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
	h := handler.NewExecuteHandler(noopLogger(), successRunner, metrics.NewNoop(), cfg)

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
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[{"name":"run","type":"io","input":""}]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for language=python, got %d", w.Code)
	}
}

func TestExecute_ValidateLanguage_JavaIsOk(t *testing.T) {
	// Java validation passes; captureRunner returns a simple result.
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

// --- Cases protocol tests ---

// TestExecute_Cases_EmptyCasesRejected verifies that an empty cases list returns 400.
// Catches: missing validation on required Cases field.
func TestExecute_Cases_EmptyCasesRejected(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python","cases":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty cases list, got %d", w.Code)
	}
}

func TestExecute_Cases_NoCasesRejected(t *testing.T) {
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
	w := doRequest(h, `{"code":"print(1)","language":"python"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when cases field is absent, got %d", w.Code)
	}
}

func TestExecute_Cases_SingleRunOnly(t *testing.T) {
	// A case with no expected_output should get status "run".
	h := newHandler(successRunner, metrics.NewNoop(), defaultConfig())
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

func TestExecute_Cases_MultipleCases(t *testing.T) {
	// Multiple cases each get their own sandbox call.
	callCount := 0
	multiRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		callCount++
		return &sandbox.Result{Stdout: "out\n", ExitCode: 0, DurationMs: 10}, nil
	}
	h := newHandler(multiRunner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[` +
		`{"name":"c1","type":"io","input":"1"},` +
		`{"name":"c2","type":"io","input":"2"},` +
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
	if callCount != 3 {
		t.Errorf("expected 3 sandbox calls (one per case), got %d", callCount)
	}
	if resp.Summary.Total != 3 {
		t.Errorf("expected total=3, got %d", resp.Summary.Total)
	}
}

// TestExecute_Cases_StdinForwardedFromInput verifies that case.Input is forwarded
// as Stdin to the sandbox. Catches: CaseDef.Input not mapped to sandbox Stdin.
func TestExecute_Cases_StdinForwardedFromInput(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[{"name":"run","type":"io","input":"test input"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.Stdin != "test input" {
		t.Errorf("expected sandbox Stdin='test input', got %q", cap.req.Stdin)
	}
}

func TestExecute_Cases_CaseFilesForwardedToSandbox(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	body := `{"code":"x=1","language":"python","cases":[{"name":"run","type":"io","input":"","files":[{"name":"data.csv","content":"a,b"}]}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(cap.req.Files) != 1 {
		t.Fatalf("expected 1 file in sandbox request, got %d", len(cap.req.Files))
	}
	if cap.req.Files[0].Name != "data.csv" {
		t.Errorf("expected file name 'data.csv', got %q", cap.req.Files[0].Name)
	}
}

func TestExecute_Cases_RandomSeedForwardedToSandbox(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	body := `{"code":"import random; print(random.randint(1,100))","language":"python","cases":[{"name":"seed-test","type":"io","input":"","random_seed":42}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.RandomSeed == nil || *cap.req.RandomSeed != 42 {
		t.Errorf("expected random_seed=42 forwarded to sandbox, got %v", cap.req.RandomSeed)
	}
}

func TestExecute_Cases_SandboxTimeout(t *testing.T) {
	// When sandbox times out, the case result should have status "error".
	h := newHandler(timeoutRunner, metrics.NewNoop(), defaultConfig())
	body := `{"code":"while True: pass","language":"python","cases":[{"name":"t1","type":"io","input":""}]}`
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
	if resp.Results[0].Status != "error" {
		t.Errorf("expected status 'error' for timed-out case, got %q", resp.Results[0].Status)
	}
}
