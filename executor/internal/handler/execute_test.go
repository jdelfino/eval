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
	"github.com/jdelfino/eval/executor/internal/pytestrunner"
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

// successRunner returns JSON case results representing one "run" case with actual="hello\n".
// The iotestrunner protocol requires sandbox Stdout to be a JSON array of CaseResult objects.
func successRunner(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
	cases := parseCasesFromFiles(req.Files)
	results := make([]map[string]any, len(cases))
	for i, name := range cases {
		results[i] = map[string]any{
			"name":    name,
			"status":  "run",
			"actual":  "hello\n",
			"time_ms": 45,
			"type":    "io",
		}
	}
	out, _ := json.Marshal(results)
	return &sandbox.Result{
		Stdout:     string(out),
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 45,
	}, nil
}

// failRunner simulates student code crashing; returns JSON case results with status "error".
func failRunner(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
	cases := parseCasesFromFiles(req.Files)
	results := make([]map[string]any, len(cases))
	for i, name := range cases {
		results[i] = map[string]any{
			"name":   name,
			"status": "error",
			"stderr": "NameError: name 'x' is not defined",
			"type":   "io",
		}
	}
	out, _ := json.Marshal(results)
	return &sandbox.Result{
		Stdout:     string(out),
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

// captureRunner records the sandbox request for inspection and returns JSON case results.
type captureRunner struct {
	req sandbox.Request
	cfg sandbox.Config
}

func (c *captureRunner) run(_ context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
	c.req = req
	c.cfg = cfg
	cases := parseCasesFromFiles(req.Files)
	results := make([]map[string]any, len(cases))
	for i, name := range cases {
		results[i] = map[string]any{
			"name":    name,
			"status":  "run",
			"actual":  "ok\n",
			"time_ms": 1,
			"type":    "io",
		}
	}
	out, _ := json.Marshal(results)
	return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 1}, nil
}

// parseCasesFromFiles extracts case names from the io_tests.json attached file.
// This lets mock runners return the correct number of results.
func parseCasesFromFiles(files []sandbox.File) []string {
	for _, f := range files {
		if f.Name == "io_tests.json" {
			var defs []struct {
				Name string `json:"name"`
			}
			if err := json.Unmarshal([]byte(f.Content), &defs); err == nil {
				names := make([]string, len(defs))
				for i, d := range defs {
					names[i] = d.Name
				}
				return names
			}
		}
	}
	return []string{"run"}
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
	r := resp.Results[0]
	if r.Kind != "io" || r.IO == nil {
		t.Fatalf("expected io result, got kind=%q", r.Kind)
	}
	if r.IO.Status != "run" {
		t.Errorf("expected status 'run', got %q", r.IO.Status)
	}
	if r.IO.Actual != "hello\n" {
		t.Errorf("expected actual 'hello\\n', got %q", r.IO.Actual)
	}
	if r.IO.TimeMs != 45 {
		t.Errorf("expected 45ms, got %d", r.IO.TimeMs)
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
	r := resp.Results[0]
	if r.Kind != "io" || r.IO == nil {
		t.Fatalf("expected io result, got kind=%q", r.Kind)
	}
	if r.IO.Status != "error" {
		t.Errorf("expected status 'error', got %q", r.IO.Status)
	}
	if r.IO.Stderr == "" {
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
	r := resp.Results[0]
	if r.Kind != "io" || r.IO == nil {
		t.Fatalf("expected io result, got kind=%q", r.Kind)
	}
	if r.IO.Status != "error" {
		t.Errorf("expected status 'error' for timeout, got %q", r.IO.Status)
	}
	if r.IO.Stderr != "execution timed out" {
		t.Errorf("expected timeout error in Stderr, got %q", r.IO.Stderr)
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
	blockingRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		close(entryCh)
		<-blockCh
		cases := parseCasesFromFiles(req.Files)
		results := make([]map[string]any, len(cases))
		for i, name := range cases {
			results[i] = map[string]any{"name": name, "status": "run", "actual": "ok\n", "time_ms": 1, "type": "io"}
		}
		out, _ := json.Marshal(results)
		return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 1}, nil
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
	r := resp.Results[0]
	if r.Kind != "io" || r.IO == nil {
		t.Fatalf("expected io result, got kind=%q", r.Kind)
	}
	if r.IO.Status != "run" {
		t.Errorf("expected status 'run' for case without expected_output, got %q", r.IO.Status)
	}
}

func TestExecute_Cases_MultipleCases(t *testing.T) {
	// All cases are dispatched in a single sandbox call to the iotestrunner.
	callCount := 0
	multiRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		callCount++
		cases := parseCasesFromFiles(req.Files)
		results := make([]map[string]any, len(cases))
		for i, name := range cases {
			results[i] = map[string]any{"name": name, "status": "run", "actual": "out\n", "time_ms": 10, "type": "io"}
		}
		out, _ := json.Marshal(results)
		return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 30}, nil
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
	if callCount != 1 {
		t.Errorf("expected 1 sandbox call (all cases in single iotestrunner invocation), got %d", callCount)
	}
	if resp.Summary.Total != 3 {
		t.Errorf("expected total=3, got %d", resp.Summary.Total)
	}
	for i, r := range resp.Results {
		if r.Kind != "io" || r.IO == nil {
			t.Errorf("results[%d]: expected io result, got kind=%q", i, r.Kind)
		}
	}
}

// TestExecute_Cases_InputInTestsJSON verifies that case.Input is included in
// the io_tests.json attached file passed to the iotestrunner sandbox.
// Input is no longer forwarded as sandbox Stdin — the iotestrunner script
// reads cases from the JSON file and pipes each input to the student process.
func TestExecute_Cases_InputInTestsJSON(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	body := `{"code":"print(input())","language":"python","cases":[{"name":"run","type":"io","input":"test input"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// Find io_tests.json in the attached files.
	var ioTestsJSON string
	for _, f := range cap.req.Files {
		if f.Name == "io_tests.json" {
			ioTestsJSON = f.Content
			break
		}
	}
	if ioTestsJSON == "" {
		t.Fatal("expected io_tests.json to be in sandbox files")
	}
	if !strings.Contains(ioTestsJSON, "test input") {
		t.Errorf("expected io_tests.json to contain 'test input', got %q", ioTestsJSON)
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
	// The iotestrunner design attaches: solution.py, io_tests.json, plus any case files.
	// Verify data.csv is present among the files.
	var found bool
	for _, f := range cap.req.Files {
		if f.Name == "data.csv" {
			found = true
			if f.Content != "a,b" {
				t.Errorf("expected data.csv content 'a,b', got %q", f.Content)
			}
		}
	}
	if !found {
		names := make([]string, len(cap.req.Files))
		for i, f := range cap.req.Files {
			names[i] = f.Name
		}
		t.Errorf("expected data.csv in sandbox files, got: %v", names)
	}
}

func TestExecute_Cases_RandomSeedInTestsJSON(t *testing.T) {
	cap := &captureRunner{}
	h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())
	body := `{"code":"import random; print(random.randint(1,100))","language":"python","cases":[{"name":"seed-test","type":"io","input":"","random_seed":42}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// random_seed is passed inside io_tests.json, not as a sandbox-level field.
	var ioTestsJSON string
	for _, f := range cap.req.Files {
		if f.Name == "io_tests.json" {
			ioTestsJSON = f.Content
			break
		}
	}
	if ioTestsJSON == "" {
		t.Fatal("expected io_tests.json in sandbox files")
	}
	if !strings.Contains(ioTestsJSON, "42") {
		t.Errorf("expected io_tests.json to contain random_seed=42, got %q", ioTestsJSON)
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
	r := resp.Results[0]
	if r.Kind != "io" || r.IO == nil {
		t.Fatalf("expected io result, got kind=%q", r.Kind)
	}
	if r.IO.Status != "error" {
		t.Errorf("expected status 'error' for timed-out case, got %q", r.IO.Status)
	}
}

// TestExecute_Cases_TimeoutProducesErrorForAllCases verifies that when the sandbox
// times out, all requested cases get an error result with "execution timed out".
// With the iotestrunner design, all cases run in one sandbox call, so a timeout
// affects all cases simultaneously rather than stopping a per-case loop.
func TestExecute_Cases_TimeoutProducesErrorForAllCases(t *testing.T) {
	callCount := 0
	timeoutRunner2 := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		callCount++
		return &sandbox.Result{TimedOut: true, ExitCode: 137, DurationMs: 10000}, nil
	}
	h := newHandler(timeoutRunner2, metrics.NewNoop(), defaultConfig())
	body := `{"code":"while True: pass","language":"python","cases":[` +
		`{"name":"c1","type":"io","input":""},` +
		`{"name":"c2","type":"io","input":""}` +
		`]}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if callCount != 1 {
		t.Errorf("expected sandbox called exactly once (all cases in one call), got %d calls", callCount)
	}
	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	// Both cases get error results when sandbox times out.
	if len(resp.Results) != 2 {
		t.Errorf("expected 2 error results (one per case), got %d", len(resp.Results))
	}
	for _, u := range resp.Results {
		if u.Kind != "io" || u.IO == nil {
			t.Errorf("expected io result, got kind=%q", u.Kind)
			continue
		}
		if u.IO.Status != "error" {
			t.Errorf("expected status 'error' for timed-out case %q, got %q", u.IO.Name, u.IO.Status)
		}
	}
}

// Per-case stdin/file size limits are enforced by the iotestrunner script,
// not by the Go handler. The handler only validates code size, language, and
// that cases is non-empty.

// TestExecute_Cases_ReservedFilenameRejected verifies that submitting a case
// file with a name that collides with a reserved sandbox file (solution.py,
// Main.java, io_tests.json) returns HTTP 400 with a descriptive error.
//
// Without this check the student's file is silently dropped, causing confusing
// failures where the file appears missing even though the request succeeds.
// --- Pytest dispatch tests ---

// TestExecute_Pytest_DispatchesToPytestRunner verifies that a case with kind="pytest"
// is dispatched to the pytest sandbox runner (not the io runner).
//
// Contract: the handler must use kind to dispatch cases. If kind is ignored,
// pytest cases fall through to the io runner which produces wrong/empty results.
func TestExecute_Pytest_DispatchesToPytestRunner(t *testing.T) {
	pytestCallCount := 0
	ioCallCount := 0

	// The runner that tracks which kind of case was received by checking
	// if the sandbox code is the pytestrunner script (pytest) or the iotestrunner (io).
	trackingRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		if req.Code == pytestrunner.Script {
			pytestCallCount++
			out, _ := json.Marshal([]map[string]any{{
				"kind":        "pytest",
				"name":        "test_add",
				"passed":      true,
				"duration_ms": 100,
				"assertions":  []map[string]any{{"name": "test_add", "passed": true}},
			}})
			return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 100}, nil
		}
		ioCallCount++
		out, _ := json.Marshal([]map[string]any{{
			"name": "run", "status": "run", "actual": "ok\n", "time_ms": 1, "type": "io",
		}})
		return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 1}, nil
	}

	h := newHandler(trackingRunner, metrics.NewNoop(), defaultConfig())
	body := `{
		"code": "def add(a,b): return a+b",
		"language": "python",
		"cases": [{"name": "test_add", "kind": "pytest", "test_code": "def test_add(): assert True", "target_path": "tests/test_add.py"}]
	}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if pytestCallCount != 1 {
		t.Errorf("expected pytest runner called once, got %d", pytestCallCount)
	}
	if ioCallCount != 0 {
		t.Errorf("expected io runner not called, got %d", ioCallCount)
	}
}

// TestExecute_Pytest_ResultShapeInResponse verifies that the handler returns
// PytestCaseResult-shaped results in resp.Results for pytest cases.
//
// Contract: results[] is a unified discriminated union — pytest results appear
// with kind="pytest" and the full PytestCaseResult payload.
func TestExecute_Pytest_ResultShapeInResponse(t *testing.T) {
	pytestRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		// Return a pytest result shaped like what script.py emits.
		out, _ := json.Marshal([]map[string]any{{
			"kind":        "pytest",
			"name":        "test_add",
			"passed":      true,
			"duration_ms": 55,
			"assertions":  []map[string]any{{"name": "test_add", "passed": true, "failure_message": "", "traceback": ""}},
			"stderr":      "",
		}})
		return &sandbox.Result{Stdout: string(out), ExitCode: 0, DurationMs: 55}, nil
	}

	h := newHandler(pytestRunner, metrics.NewNoop(), defaultConfig())
	body := `{
		"code": "def add(a,b): return a+b",
		"language": "python",
		"cases": [{"name": "test_add", "kind": "pytest", "test_code": "def test_add(): assert True", "target_path": "tests/test_add.py"}]
	}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result in Results, got %d", len(resp.Results))
	}
	u := resp.Results[0]
	if u.Kind != "pytest" || u.Pytest == nil {
		t.Fatalf("expected pytest result, got kind=%q", u.Kind)
	}
	if u.Pytest.Kind != "pytest" {
		t.Errorf("expected kind='pytest', got %q", u.Pytest.Kind)
	}
	if !u.Pytest.Passed {
		t.Errorf("expected passed=true, got false")
	}
	if len(u.Pytest.Assertions) == 0 {
		t.Errorf("expected assertions in result, got none")
	}
}

// TestExecute_Pytest_MixedCasesDispatch verifies that a request with both io and pytest
// cases dispatches each case to its correct runner and returns results in a unified slice.
//
// Contract: the handler must process each case independently by kind.
// Without this, mixed requests send all cases to the wrong runner.
func TestExecute_Pytest_MixedCasesDispatch(t *testing.T) {
	callLog := []string{}

	mixedRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		// Detect by whether the runner code is the pytestrunner script.
		if req.Code == pytestrunner.Script {
			callLog = append(callLog, "pytest")
			out, _ := json.Marshal([]map[string]any{{
				"kind": "pytest", "name": "test_x", "passed": true,
				"duration_ms": 10,
				"assertions":  []map[string]any{{"name": "test_x", "passed": true}},
			}})
			return &sandbox.Result{Stdout: string(out), ExitCode: 0}, nil
		}
		callLog = append(callLog, "io")
		cases := parseCasesFromFiles(req.Files)
		results := make([]map[string]any, len(cases))
		for i, name := range cases {
			results[i] = map[string]any{"name": name, "status": "run", "actual": "ok\n", "time_ms": 1, "type": "io"}
		}
		out, _ := json.Marshal(results)
		return &sandbox.Result{Stdout: string(out), ExitCode: 0}, nil
	}

	h := newHandler(mixedRunner, metrics.NewNoop(), defaultConfig())
	body := `{
		"code": "def add(a,b): return a+b",
		"language": "python",
		"cases": [
			{"name": "io_case", "kind": "io", "input": ""},
			{"name": "pytest_case", "kind": "pytest", "test_code": "def test_x(): pass", "target_path": "tests/test_x.py"}
		]
	}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Both cases in unified Results[] slice.
	if len(resp.Results) != 2 {
		t.Errorf("expected 2 unified results, got %d", len(resp.Results))
	}
	ioCount := 0
	pytestCount := 0
	for _, u := range resp.Results {
		switch u.Kind {
		case "io":
			ioCount++
		case "pytest":
			pytestCount++
		}
	}
	if ioCount != 1 {
		t.Errorf("expected 1 io result in unified Results, got %d", ioCount)
	}
	if pytestCount != 1 {
		t.Errorf("expected 1 pytest result in unified Results, got %d", pytestCount)
	}
	// Verify we had both dispatch types.
	ioDispatch := 0
	pytestDispatch := 0
	for _, k := range callLog {
		if k == "io" {
			ioDispatch++
		} else {
			pytestDispatch++
		}
	}
	if ioDispatch == 0 {
		t.Errorf("expected io runner to be called, callLog=%v", callLog)
	}
	if pytestDispatch == 0 {
		t.Errorf("expected pytest runner to be called, callLog=%v", callLog)
	}
}

// TestExecute_InterleavedCasesOrderPreserved verifies that when cases are submitted in
// interleaved order (e.g. pytest, io, pytest, io), the results array preserves submission
// order — result[i] corresponds to cases[i] regardless of kind.
//
// Contract: dispatch must not reorder results. If io results come first and pytest
// results come last regardless of submission order, position-based result↔case
// correspondence breaks and callers get wrong results for wrong cases.
func TestExecute_InterleavedCasesOrderPreserved(t *testing.T) {
	mixedRunner := func(_ context.Context, _ sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
		if req.Code == pytestrunner.Script {
			// Return pytest results in order of cases arg.
			var cases []struct {
				Name string `json:"name"`
			}
			if len(req.Args) >= 2 {
				_ = json.Unmarshal([]byte(req.Args[1]), &cases)
			}
			results := make([]map[string]any, len(cases))
			for i, c := range cases {
				results[i] = map[string]any{
					"kind":        "pytest",
					"name":        c.Name,
					"passed":      true,
					"duration_ms": 10,
					"assertions":  []map[string]any{{"name": c.Name, "passed": true}},
				}
			}
			out, _ := json.Marshal(results)
			return &sandbox.Result{Stdout: string(out), ExitCode: 0}, nil
		}
		// io: return results for each case in the io_tests.json file.
		cases := parseCasesFromFiles(req.Files)
		results := make([]map[string]any, len(cases))
		for i, name := range cases {
			results[i] = map[string]any{
				"name": name, "status": "run", "actual": "ok\n", "time_ms": 1, "type": "io",
			}
		}
		out, _ := json.Marshal(results)
		return &sandbox.Result{Stdout: string(out), ExitCode: 0}, nil
	}

	h := newHandler(mixedRunner, metrics.NewNoop(), defaultConfig())
	// Submit: pytest1, io1, pytest2, io2 — interleaved.
	body := `{
		"code": "def f(): pass",
		"language": "python",
		"cases": [
			{"name": "pytest1", "kind": "pytest", "test_code": "def test_p1(): pass", "target_path": "t.py"},
			{"name": "io1",     "kind": "io",     "input": "a"},
			{"name": "pytest2", "kind": "pytest", "test_code": "def test_p2(): pass", "target_path": "t.py"},
			{"name": "io2",     "kind": "io",     "input": "b"}
		]
	}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(resp.Results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(resp.Results))
	}

	// Assert per-position kind and name correspondence with submission order.
	expected := []struct {
		kind string
		name string
	}{
		{"pytest", "pytest1"},
		{"io", "io1"},
		{"pytest", "pytest2"},
		{"io", "io2"},
	}
	for i, e := range expected {
		u := resp.Results[i]
		if u.Kind != e.kind {
			t.Errorf("results[%d].kind: expected %q, got %q", i, e.kind, u.Kind)
			continue
		}
		var gotName string
		switch e.kind {
		case "io":
			if u.IO == nil {
				t.Errorf("results[%d]: IO is nil", i)
				continue
			}
			gotName = u.IO.Name
		case "pytest":
			if u.Pytest == nil {
				t.Errorf("results[%d]: Pytest is nil", i)
				continue
			}
			gotName = u.Pytest.Name
		}
		if gotName != e.name {
			t.Errorf("results[%d].name: expected %q, got %q", i, e.name, gotName)
		}
	}
}

func TestExecute_Cases_ReservedFilenameRejected(t *testing.T) {
	tests := []struct {
		name         string
		language     string
		reservedFile string
	}{
		{
			name:         "solution.py is reserved for python",
			language:     "python",
			reservedFile: "solution.py",
		},
		{
			name:         "io_tests.json is reserved for python",
			language:     "python",
			reservedFile: "io_tests.json",
		},
		{
			name:         "Main.java is reserved for java",
			language:     "java",
			reservedFile: "Main.java",
		},
		{
			name:         "io_tests.json is reserved for java",
			language:     "java",
			reservedFile: "io_tests.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cap := &captureRunner{}
			h := newHandler(cap.run, metrics.NewNoop(), defaultConfig())

			code := `print("hello")`
			if tt.language == "java" {
				code = `public class Main { public static void main(String[] a) {} }`
			}

			body, _ := json.Marshal(map[string]any{
				"code":     code,
				"language": tt.language,
				"cases": []map[string]any{
					{
						"name":  "test",
						"type":  "io",
						"input": "",
						"files": []map[string]any{
							{"name": tt.reservedFile, "content": "overwrite attempt"},
						},
					},
				},
			})

			w := doRequest(h, string(body))

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for reserved file name %q, got %d (body: %s)",
					tt.reservedFile, w.Code, w.Body.String())
			}

			var errResp map[string]string
			if err := json.NewDecoder(w.Body).Decode(&errResp); err != nil {
				t.Fatalf("failed to decode error response: %v", err)
			}
			if got := errResp["error"]; !strings.Contains(got, "reserved") {
				t.Errorf("expected error message to mention 'reserved', got %q", got)
			}
			if !strings.Contains(errResp["error"], tt.reservedFile) {
				t.Errorf("expected error message to contain file name %q, got %q",
					tt.reservedFile, errResp["error"])
			}
		})
	}
}
