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
	"testing"

	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
	"github.com/prometheus/client_golang/prometheus"
	io_prometheus_client "github.com/prometheus/client_model/go"
)

func defaultCfg() *config.Config {
	return &config.Config{
		Port:             8081,
		NsjailPath:       "/usr/bin/nsjail",
		PythonPath:       "/usr/bin/python3",
		DefaultTimeoutMS: 10000,
		MaxCodeBytes:     102400,
		MaxStdinBytes:    1048576,
		MaxOutputBytes:   1048576,
		MaxFiles:         5,
		MaxFileBytes:     10240,
	}
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
	return &sandbox.Result{Stdout: "ok", ExitCode: 0, DurationMs: 1}, nil
}

func doRequest(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/execute", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestExecute_Success(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"print('hello')"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Success {
		t.Error("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Errorf("expected output 'hello\\n', got %q", resp.Output)
	}
	if resp.ExecutionTimeMs != 45 {
		t.Errorf("expected 45ms, got %d", resp.ExecutionTimeMs)
	}
}

func TestExecute_CodeFailure(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), failRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"print(x)"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error == "" {
		t.Error("expected non-empty error")
	}
}

func TestExecute_Timeout(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), timeoutRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"while True: pass"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Success {
		t.Error("expected success=false for timeout")
	}
	if resp.Error != "execution timed out" {
		t.Errorf("expected timeout error, got %q", resp.Error)
	}
}

func TestExecute_InternalError(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), errorRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"print(1)"}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", w.Code)
	}
}

func TestExecute_EmptyCode(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":""}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_MissingCode(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_InvalidJSON(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `not json`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_CodeTooLarge(t *testing.T) {
	cfg := defaultCfg()
	cfg.MaxCodeBytes = 10
	h := handler.Execute(cfg, noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"print('this is way too long')"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_StdinTooLarge(t *testing.T) {
	cfg := defaultCfg()
	cfg.MaxStdinBytes = 5
	h := handler.Execute(cfg, noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1","stdin":"toolarge"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_TooManyFiles(t *testing.T) {
	cfg := defaultCfg()
	cfg.MaxFiles = 1
	h := handler.Execute(cfg, noopLogger(), successRunner, metrics.NewNoop())
	body := `{"code":"x=1","files":[{"name":"a.txt","content":"a"},{"name":"b.txt","content":"b"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_FileTooLarge(t *testing.T) {
	cfg := defaultCfg()
	cfg.MaxFileBytes = 5
	h := handler.Execute(cfg, noopLogger(), successRunner, metrics.NewNoop())
	body := `{"code":"x=1","files":[{"name":"a.txt","content":"toolarge"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_EmptyFileName(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	body := `{"code":"x=1","files":[{"name":"","content":"data"}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_EmptyFileContent(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	body := `{"code":"x=1","files":[{"name":"a.txt","content":""}]}`
	w := doRequest(h, body)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_NegativeTimeout(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1","timeout_ms":-1}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_TimeoutTooLarge(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1","timeout_ms":99999}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestExecute_StdinEchoed(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1","stdin":"my input"}`)

	var resp executorapi.ExecuteResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Stdin != "my input" {
		t.Errorf("expected stdin echoed, got %q", resp.Stdin)
	}
}

func TestExecute_CustomTimeout(t *testing.T) {
	cap := &captureRunner{}
	h := handler.Execute(defaultCfg(), noopLogger(), cap.run, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1","timeout_ms":5000}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.req.TimeoutMs != 5000 {
		t.Errorf("expected timeout 5000, got %d", cap.req.TimeoutMs)
	}
}

func TestExecute_DefaultTimeout(t *testing.T) {
	cap := &captureRunner{}
	h := handler.Execute(defaultCfg(), noopLogger(), cap.run, metrics.NewNoop())
	w := doRequest(h, `{"code":"x=1"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cap.req.TimeoutMs != 10000 {
		t.Errorf("expected default timeout 10000, got %d", cap.req.TimeoutMs)
	}
}

func TestExecute_FilesPassedToSandbox(t *testing.T) {
	cap := &captureRunner{}
	h := handler.Execute(defaultCfg(), noopLogger(), cap.run, metrics.NewNoop())
	body := `{"code":"x=1","files":[{"name":"data.txt","content":"hello"}],"random_seed":42}`
	w := doRequest(h, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if len(cap.req.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(cap.req.Files))
	}
	if cap.req.Files[0].Name != "data.txt" {
		t.Errorf("expected file name data.txt, got %q", cap.req.Files[0].Name)
	}
	if cap.req.RandomSeed == nil || *cap.req.RandomSeed != 42 {
		t.Error("expected random_seed 42")
	}
}

func TestExecute_BodyTooLarge(t *testing.T) {
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, metrics.NewNoop())
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
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, m)
	w := doRequest(h, `{"code":"print('hello')"}`)

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
	h := handler.Execute(defaultCfg(), noopLogger(), failRunner, m)
	doRequest(h, `{"code":"print(x)"}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "failure"); v != 1 {
		t.Errorf("expected executions_total{status=failure}=1, got %v", v)
	}
}

func TestExecute_MetricsTimeout(t *testing.T) {
	m := newTestMetrics(t)
	h := handler.Execute(defaultCfg(), noopLogger(), timeoutRunner, m)
	doRequest(h, `{"code":"while True: pass"}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "timeout"); v != 1 {
		t.Errorf("expected executions_total{status=timeout}=1, got %v", v)
	}
}

func TestExecute_MetricsError(t *testing.T) {
	m := newTestMetrics(t)
	h := handler.Execute(defaultCfg(), noopLogger(), errorRunner, m)
	doRequest(h, `{"code":"print(1)"}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "error"); v != 1 {
		t.Errorf("expected executions_total{status=error}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationCodeTooLarge(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultCfg()
	cfg.MaxCodeBytes = 10
	h := handler.Execute(cfg, noopLogger(), successRunner, m)
	doRequest(h, `{"code":"print('this is way too long')"}`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "code_too_large"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=code_too_large}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationInvalidJSON(t *testing.T) {
	m := newTestMetrics(t)
	h := handler.Execute(defaultCfg(), noopLogger(), successRunner, m)
	doRequest(h, `not json`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "invalid_request"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=invalid_request}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationStdinTooLarge(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultCfg()
	cfg.MaxStdinBytes = 5
	h := handler.Execute(cfg, noopLogger(), successRunner, m)
	doRequest(h, `{"code":"x=1","stdin":"toolarge"}`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "stdin_too_large"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=stdin_too_large}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationTooManyFiles(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultCfg()
	cfg.MaxFiles = 1
	h := handler.Execute(cfg, noopLogger(), successRunner, m)
	body := `{"code":"x=1","files":[{"name":"a.txt","content":"a"},{"name":"b.txt","content":"b"}]}`
	doRequest(h, body)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "too_many_files"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=too_many_files}=1, got %v", v)
	}
}

func TestExecute_MetricsValidationFileTooLarge(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultCfg()
	cfg.MaxFileBytes = 5
	h := handler.Execute(cfg, noopLogger(), successRunner, m)
	body := `{"code":"x=1","files":[{"name":"a.txt","content":"toolarge"}]}`
	doRequest(h, body)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "file_too_large"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=file_too_large}=1, got %v", v)
	}
}
