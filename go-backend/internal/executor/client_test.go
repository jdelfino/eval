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

	"github.com/jdelfino/eval/pkg/executorapi"
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
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "hello\n", TimeMs: 42}},
			Summary: executorapi.CaseSummary{Total: 1, Run: 1, TimeMs: 42},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:  "print('hello')",
		Cases: []executorapi.CaseDef{{Name: "run", Type: "io"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Results))
	}
	if resp.Results[0].Actual != "hello\n" {
		t.Errorf("unexpected actual: %q", resp.Results[0].Actual)
	}
	if resp.Results[0].TimeMs != 42 {
		t.Errorf("unexpected time_ms: %d", resp.Results[0].TimeMs)
	}
}

func TestExecute_FailedExecution(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := ExecuteResponse{
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "error", Stderr: "NameError: name 'foo' is not defined"}},
			Summary: executorapi.CaseSummary{Total: 1, Errors: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:  "foo",
		Cases: []executorapi.CaseDef{{Name: "run", Type: "io"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected results")
	}
	if resp.Results[0].Status != "error" {
		t.Errorf("expected status 'error', got %q", resp.Results[0].Status)
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
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok\n"}},
			Summary: executorapi.CaseSummary{Total: 1, Run: 1},
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
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok\n"}},
			Summary: executorapi.CaseSummary{Total: 1, Run: 1},
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
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok\n"}},
			Summary: executorapi.CaseSummary{Total: 1, Run: 1},
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
		if len(req.Cases) == 0 {
			t.Error("expected at least one case")
		}
		if req.Cases[0].Input != "input data" {
			t.Errorf("unexpected case input: %s", req.Cases[0].Input)
		}
		if len(req.Cases[0].Files) != 1 || req.Cases[0].Files[0].Name != "data.txt" {
			t.Errorf("unexpected case files: %+v", req.Cases[0].Files)
		}
		if req.Cases[0].RandomSeed == nil || *req.Cases[0].RandomSeed != 42 {
			t.Errorf("unexpected random_seed: %v", req.Cases[0].RandomSeed)
		}
		if req.TimeoutMs == nil || *req.TimeoutMs != 5000 {
			t.Errorf("unexpected timeout_ms: %v", req.TimeoutMs)
		}

		resp := ExecuteResponse{
			Results: []executorapi.CaseResult{{Name: "run", Type: "io", Status: "run", Actual: "ok\n"}},
			Summary: executorapi.CaseSummary{Total: 1, Run: 1},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code: "print('ok')",
		Cases: []executorapi.CaseDef{{
			Name:       "run",
			Type:       "io",
			Input:      "input data",
			Files:      []executorapi.File{{Name: "data.txt", Content: "hello"}},
			RandomSeed: &seed,
		}},
		TimeoutMs: intPtr(5000),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Results) == 0 {
		t.Error("expected results")
	}
}
