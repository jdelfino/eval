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
	"github.com/jdelfino/eval/executor/internal/tracer"
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

// --- Language validation tests for trace handler ---

func TestTrace_ValidateLanguage_EmptyIsOk(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for empty language, got %d", w.Code)
	}
}

func TestTrace_ValidateLanguage_PythonIsOk(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1","language":"python"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for language=python, got %d", w.Code)
	}
}

func TestTrace_ValidateLanguage_JavaIsOk(t *testing.T) {
	cap := &traceCaptureRunner{}
	h := newTraceHandler(cap.run, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"public class Main {}","language":"java"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for language=java (validation passes), got %d", w.Code)
	}
}

func TestTrace_ValidateLanguage_InvalidRejected(t *testing.T) {
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=1","language":"ruby"}`)
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

func TestTrace_JavaPathPassedToSandboxConfig(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.JavaPath = "/usr/bin/java"
	cfg.JavacPath = "/usr/bin/javac"
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1"}`)

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

// --- Language routing tests ---

// TestTrace_PythonLanguage_UsesPythonTracer verifies that an explicit python
// language request routes through the embedded Python tracer (tracer.Script).
func TestTrace_PythonLanguage_UsesPythonTracer(t *testing.T) {
	cap := &traceCaptureRunner{}
	h := newTraceHandler(cap.run, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=5","language":"python"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// Python path: sandbox Code must be the embedded tracer script (not student code).
	if cap.req.Code != tracer.Script {
		t.Errorf("expected sandbox Code to be tracer.Script for python, got something else (len=%d)", len(cap.req.Code))
	}
	// Language must be empty (or "python") — Python tracer runs as python.
	if cap.req.Language != "" && cap.req.Language != "python" {
		t.Errorf("expected sandbox Language to be '' or 'python', got %q", cap.req.Language)
	}
	// Args: [student_code, stdin, maxSteps]
	if len(cap.req.Args) != 3 {
		t.Fatalf("expected 3 args for python trace, got %d", len(cap.req.Args))
	}
	if cap.req.Args[0] != "x=5" {
		t.Errorf("expected arg[0] to be student code, got %q", cap.req.Args[0])
	}
}

// TestTrace_EmptyLanguage_UsesPythonTracer verifies that an omitted language
// also routes through the Python tracer (default behavior).
func TestTrace_EmptyLanguage_UsesPythonTracer(t *testing.T) {
	cap := &traceCaptureRunner{}
	h := newTraceHandler(cap.run, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=5"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.Code != tracer.Script {
		t.Errorf("expected sandbox Code to be tracer.Script for empty language, got len=%d", len(cap.req.Code))
	}
}

// TestTrace_JavaLanguage_UsesJavaTracerInvocation verifies that a java language
// request builds a sandbox.Request with Language="java", the jar invocation as
// Code, and [student_code, stdin, maxSteps] as Args.
func TestTrace_JavaLanguage_UsesJavaTracerInvocation(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.TracerJarPath = "/usr/lib/java-tracer.jar"
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"public class Main { public static void main(String[] a) {} }","language":"java","stdin":"hello","max_steps":200}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Sandbox Language must be "java" so the sandbox uses Java-appropriate settings.
	if cap.req.Language != "java" {
		t.Errorf("expected sandbox Language='java', got %q", cap.req.Language)
	}

	// Args must be [student_code, stdin, maxSteps] — same convention as Python.
	if len(cap.req.Args) != 3 {
		t.Fatalf("expected 3 args for java trace, got %d: %v", len(cap.req.Args), cap.req.Args)
	}
	if cap.req.Args[0] != "public class Main { public static void main(String[] a) {} }" {
		t.Errorf("expected arg[0] to be student code, got %q", cap.req.Args[0])
	}
	if cap.req.Args[1] != "hello" {
		t.Errorf("expected arg[1] to be stdin 'hello', got %q", cap.req.Args[1])
	}
	if cap.req.Args[2] != "200" {
		t.Errorf("expected arg[2] to be '200', got %q", cap.req.Args[2])
	}
}

// TestTrace_JavaLanguage_DefaultMaxSteps verifies default maxSteps is used
// when max_steps is not specified for Java.
func TestTrace_JavaLanguage_DefaultMaxSteps(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.TracerJarPath = "/usr/lib/java-tracer.jar"
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"public class Main {}","language":"java"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(cap.req.Args) != 3 {
		t.Fatalf("expected 3 args, got %d", len(cap.req.Args))
	}
	// Default is 5000 steps.
	if cap.req.Args[2] != "5000" {
		t.Errorf("expected arg[2]='5000' (default max_steps), got %q", cap.req.Args[2])
	}
}

// TestTrace_JavaLanguage_SetsIsCommand verifies that the Java trace path sets
// IsCommand=true on the sandbox request, so the sandbox dispatches the JAR
// invocation directly rather than trying to compile the Code field as Java source.
func TestTrace_JavaLanguage_SetsIsCommand(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.TracerJarPath = "/usr/lib/java-tracer.jar"
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"public class Main {}","language":"java"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !cap.req.IsCommand {
		t.Errorf("expected sandbox Request.IsCommand=true for java trace, got false")
	}
}

// TestTrace_PythonLanguage_DoesNotSetIsCommand verifies that Python trace does not
// set IsCommand (since the tracer.Script is real Python source, not a command).
func TestTrace_PythonLanguage_DoesNotSetIsCommand(t *testing.T) {
	cap := &traceCaptureRunner{}
	h := newTraceHandler(cap.run, metrics.NewNoop(), defaultTraceConfig())
	w := doTraceRequest(h, `{"code":"x=5","language":"python"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.IsCommand {
		t.Errorf("expected sandbox Request.IsCommand=false for python trace, got true")
	}
}

// TestTrace_FilesForwardedToSandbox verifies that files from the request
// are converted to sandbox.File and included in the sandbox request.
func TestTrace_FilesForwardedToSandbox(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 5
	cfg.MaxFileBytes = 10000
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","files":[{"name":"data.txt","content":"hello"}]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if len(cap.req.Files) != 1 {
		t.Fatalf("expected 1 file in sandbox request, got %d", len(cap.req.Files))
	}
	if cap.req.Files[0].Name != "data.txt" {
		t.Errorf("expected file name 'data.txt', got %q", cap.req.Files[0].Name)
	}
	if cap.req.Files[0].Content != "hello" {
		t.Errorf("expected file content 'hello', got %q", cap.req.Files[0].Content)
	}
}

// TestTrace_RandomSeedForwardedToSandbox verifies that random_seed from the
// request is forwarded to the sandbox request.
func TestTrace_RandomSeedForwardedToSandbox(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 5
	cfg.MaxFileBytes = 10000
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"import random\nprint(random.random())","random_seed":42}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if cap.req.RandomSeed == nil {
		t.Fatal("expected RandomSeed to be set, got nil")
	}
	if *cap.req.RandomSeed != 42 {
		t.Errorf("expected RandomSeed=42, got %d", *cap.req.RandomSeed)
	}
}

// TestTrace_TooManyFilesRejected verifies that exceeding MaxFiles is rejected.
func TestTrace_TooManyFilesRejected(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 1
	cfg.MaxFileBytes = 10000
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","files":[{"name":"a.txt","content":"a"},{"name":"b.txt","content":"b"}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestTrace_FileTooLargeRejected verifies that a file exceeding MaxFileBytes is rejected.
func TestTrace_FileTooLargeRejected(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 5
	cfg.MaxFileBytes = 5
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","files":[{"name":"a.txt","content":"toolarge"}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestTrace_EmptyFileNameRejected verifies that a file with empty name is rejected.
func TestTrace_EmptyFileNameRejected(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 5
	cfg.MaxFileBytes = 10000
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","files":[{"name":"","content":"data"}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestTrace_EmptyFileContentRejected verifies that a file with empty content is rejected.
func TestTrace_EmptyFileContentRejected(t *testing.T) {
	cfg := defaultTraceConfig()
	cfg.MaxFiles = 5
	cfg.MaxFileBytes = 10000
	h := newTraceHandler(traceSuccessRunner, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"x=1","files":[{"name":"a.txt","content":""}]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// TestTrace_JavaLanguage_TracerJarPathInCode verifies the tracer JAR path is
// encoded in the Code/invocation sent to the sandbox.
func TestTrace_JavaLanguage_TracerJarPathInCode(t *testing.T) {
	cap := &traceCaptureRunner{}
	cfg := defaultTraceConfig()
	cfg.TracerJarPath = "/custom/path/tracer.jar"
	h := newTraceHandler(cap.run, metrics.NewNoop(), cfg)
	w := doTraceRequest(h, `{"code":"public class Main {}","language":"java"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// The sandbox Code must reference the JAR path so the sandbox knows what to run.
	if !strings.Contains(cap.req.Code, "/custom/path/tracer.jar") {
		t.Errorf("expected sandbox Code to contain jar path '/custom/path/tracer.jar', got: %q", cap.req.Code)
	}
}
