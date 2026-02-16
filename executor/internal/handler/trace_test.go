package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jdelfino/eval/executor/internal/handler"
	"github.com/jdelfino/eval/executor/internal/metrics"
	"github.com/jdelfino/eval/executor/internal/sandbox"
	"github.com/jdelfino/eval/pkg/executorapi"
)

func defaultTraceConfig() handler.TraceHandlerConfig {
	return handler.TraceHandlerConfig{
		NsjailPath:       "/usr/bin/nsjail",
		PythonPath:       "/usr/bin/python3",
		MaxOutputBytes:   1048576,
		MaxCodeBytes:     102400,
		MaxStdinBytes:    1048576,
	}
}

func newTraceHandler(runner handler.SandboxRunner, m *metrics.Metrics, cfg handler.TraceHandlerConfig) http.HandlerFunc {
	h := handler.NewTraceHandler(noopLogger(), runner, m, cfg)
	return h.ServeHTTP
}

func doTraceRequest(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/trace", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// traceSuccessRunner returns a sandbox result with valid tracer JSON output on stdout.
func traceSuccessRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	output := `{"steps":[{"line":1,"event":"line","locals":{"x":5},"globals":{},"call_stack":[],"stdout":""}],"total_steps":1,"exit_code":0,"error":null,"truncated":false}`
	return &sandbox.Result{
		Stdout:     output,
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 50,
	}, nil
}

// traceMultiStepRunner returns trace output with multiple steps.
func traceMultiStepRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	output := `{"steps":[` +
		`{"line":1,"event":"line","locals":{},"globals":{},"call_stack":[{"function_name":"<module>","filename":"<string>","line":1}],"stdout":""},` +
		`{"line":2,"event":"line","locals":{"x":5},"globals":{},"call_stack":[{"function_name":"<module>","filename":"<string>","line":2}],"stdout":""},` +
		`{"line":3,"event":"line","locals":{"x":5,"y":10},"globals":{},"call_stack":[{"function_name":"<module>","filename":"<string>","line":3}],"stdout":"15\n"}` +
		`],"total_steps":3,"exit_code":0,"error":null,"truncated":false}`
	return &sandbox.Result{
		Stdout:     output,
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 80,
	}, nil
}

// traceErrorRunner returns trace output with an error.
func traceErrorRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	output := `{"steps":[{"line":1,"event":"line","locals":{},"globals":{},"call_stack":[],"stdout":""}],"total_steps":1,"exit_code":1,"error":"NameError: name 'x' is not defined","truncated":false}`
	return &sandbox.Result{
		Stdout:     output,
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 30,
	}, nil
}

// traceTruncatedRunner returns trace output that was truncated at max steps.
func traceTruncatedRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	output := `{"steps":[{"line":1,"event":"line","locals":{},"globals":{},"call_stack":[],"stdout":""}],"total_steps":1,"exit_code":0,"error":null,"truncated":true}`
	return &sandbox.Result{
		Stdout:     output,
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 100,
	}, nil
}

// traceInvalidOutputRunner returns invalid JSON on stdout.
func traceInvalidOutputRunner(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
	return &sandbox.Result{
		Stdout:     "not valid json",
		Stderr:     "",
		ExitCode:   0,
		TimedOut:   false,
		DurationMs: 20,
	}, nil
}

// traceCaptureRunner records the sandbox request and returns valid trace JSON.
type traceCaptureRunner struct {
	req sandbox.Request
	cfg sandbox.Config
}

func (c *traceCaptureRunner) run(_ context.Context, cfg sandbox.Config, req sandbox.Request) (*sandbox.Result, error) {
	c.req = req
	c.cfg = cfg
	return &sandbox.Result{
		Stdout:     `{"steps":[],"total_steps":0,"exit_code":0,"truncated":false}`,
		ExitCode:   0,
		DurationMs: 1,
	}, nil
}

func TestTrace_Success(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x = 5"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp executorapi.TraceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Steps) != 1 {
		t.Fatalf("expected 1 step, got %d", len(resp.Steps))
	}
	if resp.Steps[0].Line != 1 {
		t.Errorf("expected line 1, got %d", resp.Steps[0].Line)
	}
	if resp.Steps[0].Event != "line" {
		t.Errorf("expected event 'line', got %q", resp.Steps[0].Event)
	}
	if resp.TotalSteps != 1 {
		t.Errorf("expected total_steps=1, got %d", resp.TotalSteps)
	}
	if resp.ExitCode != 0 {
		t.Errorf("expected exit_code=0, got %d", resp.ExitCode)
	}
	if resp.Truncated {
		t.Error("expected truncated=false")
	}
}

func TestTrace_MultiStep(t *testing.T) {
	h := newTraceHandler(traceMultiStepRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=5\ny=10\nprint(x+y)"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TraceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Steps) != 3 {
		t.Fatalf("expected 3 steps, got %d", len(resp.Steps))
	}
	// Check call stack is populated.
	if len(resp.Steps[0].CallStack) != 1 {
		t.Errorf("expected 1 call frame, got %d", len(resp.Steps[0].CallStack))
	}
	if resp.Steps[0].CallStack[0].FunctionName != "<module>" {
		t.Errorf("expected function_name '<module>', got %q", resp.Steps[0].CallStack[0].FunctionName)
	}
	// Check stdout accumulates.
	if resp.Steps[2].Stdout != "15\n" {
		t.Errorf("expected stdout '15\\n', got %q", resp.Steps[2].Stdout)
	}
}

func TestTrace_WithError(t *testing.T) {
	h := newTraceHandler(traceErrorRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"print(x)"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TraceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.ExitCode != 1 {
		t.Errorf("expected exit_code=1, got %d", resp.ExitCode)
	}
	if resp.Error == "" {
		t.Error("expected non-empty error")
	}
}

func TestTrace_Truncated(t *testing.T) {
	h := newTraceHandler(traceTruncatedRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"while True: pass"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TraceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Truncated {
		t.Error("expected truncated=true")
	}
}

func TestTrace_Timeout(t *testing.T) {
	h := newTraceHandler(timeoutRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"while True: pass"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp executorapi.TraceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.ExitCode != -1 {
		t.Errorf("expected exit_code=-1, got %d", resp.ExitCode)
	}
	if resp.Error != "trace execution timed out" {
		t.Errorf("expected timeout error, got %q", resp.Error)
	}
	if !resp.Truncated {
		t.Error("expected truncated=true for timeout")
	}
}

func TestTrace_InternalError(t *testing.T) {
	h := newTraceHandler(errorRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1"}`)

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

func TestTrace_InvalidTracerOutput(t *testing.T) {
	h := newTraceHandler(traceInvalidOutputRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1"}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTrace_EmptyCode(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":""}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_MissingCode(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_InvalidJSON(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `not json`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_CodeTooLarge(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxCodeBytes = 10
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"print('this is way too long')"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_StdinTooLarge(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxStdinBytes = 5
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","stdin":"toolarge"}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_MaxStepsNegative(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1","max_steps":-1}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_MaxStepsTooLarge(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1","max_steps":999999}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestTrace_WithStdinAndMaxSteps(t *testing.T) {
	cap := &traceCaptureRunner{}
	h := newTraceHandler(cap.run, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1","stdin":"hello","max_steps":100}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify args passed to sandbox: [code, stdin, maxSteps]
	if len(cap.req.Args) != 3 {
		t.Fatalf("expected 3 args, got %d", len(cap.req.Args))
	}
	if cap.req.Args[0] != "x=1" {
		t.Errorf("expected arg[0]='x=1', got %q", cap.req.Args[0])
	}
	if cap.req.Args[1] != "hello" {
		t.Errorf("expected arg[1]='hello', got %q", cap.req.Args[1])
	}
	if cap.req.Args[2] != "100" {
		t.Errorf("expected arg[2]='100', got %q", cap.req.Args[2])
	}
}

func TestTrace_ConcurrencyLimit(t *testing.T) {
	entryCh := make(chan struct{})
	blockCh := make(chan struct{})
	blockingRunner := func(_ context.Context, _ sandbox.Config, _ sandbox.Request) (*sandbox.Result, error) {
		close(entryCh)
		<-blockCh
		return &sandbox.Result{Stdout: `{"steps":[],"total_steps":0,"exit_code":0,"truncated":false}`, ExitCode: 0, DurationMs: 1}, nil
	}

	cfg := defaultTraceConfig()
	cfg.MaxConcurrentExecutions = 1
	h := handler.NewTraceHandler(noopLogger(), blockingRunner, metrics.NewNoop(), cfg)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		doTraceRequest(h.ServeHTTP, `{"code":"x=1"}`)
	}()

	// Wait for first request to enter runner.
	<-entryCh

	// Second request should be rejected.
	w := doTraceRequest(h.ServeHTTP, `{"code":"x=1"}`)
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

	close(blockCh)
	wg.Wait()
}

func TestTrace_MetricsSuccess(t *testing.T) {
	m := newTestMetrics(t)
	h := newTraceHandler(traceSuccessRunner, m, defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=5"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if v := getCounterValue(t, m.ExecutionsTotal, "success"); v != 1 {
		t.Errorf("expected executions_total{status=success}=1, got %v", v)
	}
	if v := getGaugeValue(t, m.ActiveExecutions); v != 0 {
		t.Errorf("expected active_executions=0, got %v", v)
	}
}

func TestTrace_MetricsTimeout(t *testing.T) {
	m := newTestMetrics(t)
	h := newTraceHandler(timeoutRunner, m, defaultTraceConfig())
	doTraceRequest(h, `{"code":"while True: pass"}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "timeout"); v != 1 {
		t.Errorf("expected executions_total{status=timeout}=1, got %v", v)
	}
}

func TestTrace_MetricsError(t *testing.T) {
	m := newTestMetrics(t)
	h := newTraceHandler(errorRunner, m, defaultTraceConfig())
	doTraceRequest(h, `{"code":"x=1"}`)

	if v := getCounterValue(t, m.ExecutionsTotal, "error"); v != 1 {
		t.Errorf("expected executions_total{status=error}=1, got %v", v)
	}
}

func TestTrace_MetricsValidationEmpty(t *testing.T) {
	m := newTestMetrics(t)
	h := newTraceHandler(traceSuccessRunner, m, defaultTraceConfig())
	doTraceRequest(h, `{"code":""}`)

	if v := getCounterValue(t, m.ValidationErrorsTotal, "invalid_request"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=invalid_request}=1, got %v", v)
	}
}

func TestTrace_MetricsValidationCodeTooLarge(t *testing.T) {
	m := newTestMetrics(t)
	cfg := defaultTraceConfig()
	cfg.MaxCodeBytes = 10
	h := newTraceHandler(traceSuccessRunner, m, cfg)
	doTraceRequest(h, fmt.Sprintf(`{"code":"%s"}`, strings.Repeat("x", 20)))

	if v := getCounterValue(t, m.ValidationErrorsTotal, "code_too_large"); v != 1 {
		t.Errorf("expected validation_errors_total{reason=code_too_large}=1, got %v", v)
	}
}
