package executor

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
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
			Success:         true,
			Output:          "hello\n",
			ExecutionTimeMs: 42,
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
	if !resp.Success {
		t.Error("expected success=true")
	}
	if resp.Output != "hello\n" {
		t.Errorf("unexpected output: %q", resp.Output)
	}
	if resp.ExecutionTimeMs != 42 {
		t.Errorf("unexpected execution time: %d", resp.ExecutionTimeMs)
	}
}

func TestExecute_FailedExecution(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := ExecuteResponse{
			Success: false,
			Error:   "NameError: name 'foo' is not defined",
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
	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "NameError: name 'foo' is not defined" {
		t.Errorf("unexpected error message: %s", resp.Error)
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

func TestExecute_RequestFields(t *testing.T) {
	seed := 42
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req ExecuteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.Stdin != "input data" {
			t.Errorf("unexpected stdin: %s", req.Stdin)
		}
		if len(req.Files) != 1 || req.Files[0].Name != "data.txt" {
			t.Errorf("unexpected files: %+v", req.Files)
		}
		if req.RandomSeed == nil || *req.RandomSeed != 42 {
			t.Errorf("unexpected random_seed: %v", req.RandomSeed)
		}
		if req.TimeoutMs == nil || *req.TimeoutMs != 5000 {
			t.Errorf("unexpected timeout_ms: %v", req.TimeoutMs)
		}

		resp := ExecuteResponse{Success: true, Output: "ok"}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, 5*time.Second)
	resp, err := client.Execute(context.Background(), ExecuteRequest{
		Code:       "print('ok')",
		Stdin:      "input data",
		Files:      []File{{Name: "data.txt", Content: "hello"}},
		RandomSeed: &seed,
		TimeoutMs:  intPtr(5000),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Success {
		t.Error("expected success")
	}
}
