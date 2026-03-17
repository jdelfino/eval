package executor

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func intPtr(n int) *int { return &n }

func TestExecute_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/execute" {
			t.Errorf("expected /execute, got %s", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected application/json, got %s", ct)
		}

		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Code != "print('hello')" {
			t.Errorf("unexpected code: %s", req.Code)
		}

		resp := ExecuteResponse{
			Results: []CaseResult{
				{Name: "run", Type: "io", Status: "run", Actual: "hello\n", TimeMs: 42},
			},
			Summary: CaseSummary{Total: 1, Run: 1, TimeMs: 42},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code: "print('hello')",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result")
	}
	if resp.Results[0].Actual != "hello\n" {
		t.Errorf("unexpected output: %q", resp.Results[0].Actual)
	}
	if resp.Results[0].TimeMs != 42 {
		t.Errorf("unexpected execution time: %d", resp.Results[0].TimeMs)
	}
}

func TestExecute_FailedExecution(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := ExecuteResponse{
			Results: []CaseResult{
				{Name: "run", Type: "io", Status: "error", Stderr: "NameError: name 'foo' is not defined"},
			},
			Summary: CaseSummary{Total: 1, Errors: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{Code: "foo"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result")
	}
	if resp.Results[0].Status != "error" {
		t.Errorf("expected status=error, got %s", resp.Results[0].Status)
	}
	if resp.Results[0].Stderr != "NameError: name 'foo' is not defined" {
		t.Errorf("unexpected error message: %s", resp.Results[0].Stderr)
	}
}

func TestExecute_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, "internal server error")
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected error")
	}

	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		t.Fatal("expected StatusError")
	}
	if statusErr.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", statusErr.Code)
	}
}

func TestExecute_429ReturnsStatusError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":"rate limit exceeded"}`)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected error")
	}

	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		t.Fatal("expected StatusError")
	}
	if statusErr.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", statusErr.Code)
	}
}

func TestTrace_429ReturnsStatusError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":"rate limit exceeded"}`)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Trace(context.Background(), TraceRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected error")
	}

	var statusErr *StatusError
	if !errors.As(err, &statusErr) {
		t.Fatal("expected StatusError")
	}
	if statusErr.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", statusErr.Code)
	}
}

func TestExecute_Timeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 100*time.Millisecond)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestExecute_ConnectionRefused(t *testing.T) {
	client := NewClient("http://127.0.0.1:1", 1*time.Second)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected connection error")
	}
}

func TestExecute_ContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 10*time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := client.Execute(ctx, ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected context cancelled error")
	}
}

func TestExecute_MalformedJSONResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "{not valid json")
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "x"})
	if err == nil {
		t.Fatal("expected error for malformed JSON response")
	}
}

// TestExecute_PropagatesRequestID verifies that the X-Request-ID header is
// forwarded to the executor when a request ID is present in the context.
func TestExecute_PropagatesRequestID(t *testing.T) {
	const reqID = "test-request-id-123"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Request-ID")
		if got != reqID {
			t.Errorf("X-Request-ID = %q, want %q", got, reqID)
		}
		resp := ExecuteResponse{
			Results: []CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok"}},
			Summary: CaseSummary{Total: 1, Run: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ctx := context.WithValue(context.Background(), chimiddleware.RequestIDKey, reqID)
	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(ctx, ExecuteRequest{Code: "print('ok')"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestExecute_NoRequestIDHeader verifies that no X-Request-ID header is sent
// when no request ID is present in the context.
func TestExecute_NoRequestIDHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Request-ID"); got != "" {
			t.Errorf("unexpected X-Request-ID header: %q", got)
		}
		resp := ExecuteResponse{
			Results: []CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok"}},
			Summary: CaseSummary{Total: 1, Run: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(context.Background(), ExecuteRequest{Code: "print('ok')"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestTrace_PropagatesRequestID verifies that the X-Request-ID header is
// forwarded to the executor trace endpoint when a request ID is in the context.
func TestTrace_PropagatesRequestID(t *testing.T) {
	const reqID = "trace-request-id-456"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Request-ID")
		if got != reqID {
			t.Errorf("X-Request-ID = %q, want %q", got, reqID)
		}
		resp := TraceResponse{}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ctx := context.WithValue(context.Background(), chimiddleware.RequestIDKey, reqID)
	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Trace(ctx, TraceRequest{Code: "x = 1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestExecute_InjectsTraceContext verifies that when an active OTel span is in
// the context, Execute injects W3C traceparent headers into the outbound request.
func TestExecute_InjectsTraceContext(t *testing.T) {
	var receivedTraceparent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedTraceparent = r.Header.Get("traceparent")
		resp := ExecuteResponse{
			Results: []CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok"}},
			Summary: CaseSummary{Total: 1, Run: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	// Set up a real SDK tracer provider with W3C propagator so span context is injected.
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)
	defer func() { _ = tp.Shutdown(context.Background()) }()
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer := tp.Tracer("test")
	ctx, span := tracer.Start(context.Background(), "test-span")
	defer span.End()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(ctx, ExecuteRequest{Code: "print('ok')"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedTraceparent == "" {
		t.Fatal("Execute() did not inject traceparent header into outbound request")
	}
	if !strings.HasPrefix(receivedTraceparent, "00-") {
		t.Errorf("traceparent %q does not look like W3C format", receivedTraceparent)
	}
}

// TestTrace_InjectsTraceContext verifies that Trace() also propagates trace context.
func TestTrace_InjectsTraceContext(t *testing.T) {
	var receivedTraceparent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedTraceparent = r.Header.Get("traceparent")
		resp := TraceResponse{}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)
	defer func() { _ = tp.Shutdown(context.Background()) }()
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer := tp.Tracer("test")
	ctx, span := tracer.Start(context.Background(), "test-span")
	defer span.End()

	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Trace(ctx, TraceRequest{Code: "x = 1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedTraceparent == "" {
		t.Fatal("Trace() did not inject traceparent header into outbound request")
	}
	if !strings.HasPrefix(receivedTraceparent, "00-") {
		t.Errorf("traceparent %q does not look like W3C format", receivedTraceparent)
	}
}

func TestExecute_RequestFields(t *testing.T) {
	seed := 42
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(req.Cases) != 1 {
			t.Fatalf("expected 1 case, got %d", len(req.Cases))
		}
		if req.Cases[0].Input != "input data" {
			t.Errorf("unexpected case input: %s", req.Cases[0].Input)
		}
		if req.Cases[0].RandomSeed == nil || *req.Cases[0].RandomSeed != 42 {
			t.Errorf("unexpected random_seed: %v", req.Cases[0].RandomSeed)
		}
		if len(req.Cases[0].Files) != 1 || req.Cases[0].Files[0].Name != "data.txt" {
			t.Errorf("unexpected case files: %+v", req.Cases[0].Files)
		}
		if req.TimeoutMs == nil || *req.TimeoutMs != 5000 {
			t.Errorf("unexpected timeout_ms: %v", req.TimeoutMs)
		}

		resp := ExecuteResponse{
			Results: []CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok"}},
			Summary: CaseSummary{Total: 1, Run: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:      "print('ok')",
		TimeoutMs: intPtr(5000),
		Cases: []CaseDef{
			{
				Name:       "run",
				Type:       "io",
				Input:      "input data",
				RandomSeed: &seed,
				Files:      []File{{Name: "data.txt", Content: "hello"}},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Error("expected at least one result")
	}
}

// --- Execute with Cases tests (replaces the removed RunTests/test-endpoint tests) ---

func TestExecute_WithCases_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/execute" {
			t.Errorf("expected /execute (not /test), got %s", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected application/json content-type, got %s", ct)
		}

		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Code != "print(input())" {
			t.Errorf("unexpected code: %q", req.Code)
		}
		if req.Language != "python" {
			t.Errorf("unexpected language: %q", req.Language)
		}
		if len(req.Cases) != 1 || req.Cases[0].Name != "case1" {
			t.Errorf("unexpected cases: %+v", req.Cases)
		}
		if req.Cases[0].Type != "io" {
			t.Errorf("unexpected case type: %q", req.Cases[0].Type)
		}

		resp := ExecuteResponse{
			Results: []CaseResult{
				{Name: "case1", Type: "io", Status: "passed", TimeMs: 12},
			},
			Summary: CaseSummary{Total: 1, Passed: 1, TimeMs: 12},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:     "print(input())",
		Language: "python",
		Cases: []CaseDef{
			{Name: "case1", Type: "io", Input: "hello\n", ExpectedOutput: "hello", MatchType: "exact"},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Summary.Total != 1 {
		t.Errorf("expected total=1, got %d", resp.Summary.Total)
	}
	if resp.Summary.Passed != 1 {
		t.Errorf("expected passed=1, got %d", resp.Summary.Passed)
	}
	if len(resp.Results) != 1 || resp.Results[0].Status != "passed" {
		t.Errorf("unexpected results: %+v", resp.Results)
	}
}

func TestExecute_WithCases_SomeFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := ExecuteResponse{
			Results: []CaseResult{
				{Name: "case1", Type: "io", Status: "passed", TimeMs: 10},
				{Name: "case2", Type: "io", Status: "failed", Expected: "2", Actual: "3", TimeMs: 11},
			},
			Summary: CaseSummary{Total: 2, Passed: 1, Failed: 1, TimeMs: 21},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:     "print(input())",
		Language: "python",
		Cases: []CaseDef{
			{Name: "case1", Type: "io", Input: "1\n", ExpectedOutput: "1", MatchType: "exact"},
			{Name: "case2", Type: "io", Input: "2\n", ExpectedOutput: "2", MatchType: "exact"},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Summary.Total != 2 {
		t.Errorf("expected total=2, got %d", resp.Summary.Total)
	}
	if resp.Summary.Failed != 1 {
		t.Errorf("expected failed=1, got %d", resp.Summary.Failed)
	}
}

func TestExecute_WithCases_PropagatesRequestID(t *testing.T) {
	const reqID = "test-run-request-id"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Request-ID")
		if got != reqID {
			t.Errorf("X-Request-ID = %q, want %q", got, reqID)
		}
		resp := ExecuteResponse{
			Results: []CaseResult{{Name: "case1", Type: "io", Status: "passed"}},
			Summary: CaseSummary{Total: 1, Passed: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ctx := context.WithValue(context.Background(), chimiddleware.RequestIDKey, reqID)
	client := NewClient(srv.URL, 5*time.Second)
	_, err := client.Execute(ctx, ExecuteRequest{
		Code:     "x",
		Language: "python",
		Cases:    []CaseDef{{Name: "case1", Type: "io"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
