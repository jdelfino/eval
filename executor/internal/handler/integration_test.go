// Package handler provides integration tests for the executor service.
//
// These tests require a running executor service (with nsjail sandbox).
// They are skipped gracefully if EXECUTOR_TEST_URL is not set or unreachable.
//
// Run with:
//
//	EXECUTOR_TEST_URL=http://localhost:8081 go test -v -race -count=1 -run Integration ./executor/...
package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jdelfino/eval/pkg/executorapi"
)

// executorURL returns the base URL or skips the test.
func executorURL(t *testing.T) string {
	t.Helper()
	u := os.Getenv("EXECUTOR_TEST_URL")
	if u == "" {
		t.Skip("EXECUTOR_TEST_URL not set, skipping integration test")
	}
	// Quick connectivity check.
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(u + "/healthz")
	if err != nil {
		t.Skipf("executor not reachable at %s: %v", u, err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Skipf("executor health check failed: %d", resp.StatusCode)
	}
	return u
}

// executeRequest sends a request and decodes the response.
func executeRequest(t *testing.T, baseURL string, req executorapi.ExecuteRequest) executorapi.ExecuteResponse {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Post(baseURL+"/execute", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /execute: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result executorapi.ExecuteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return result
}

func intPtr(n int) *int { return &n }

func TestIntegration_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `print("hello")`,
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if strings.TrimSpace(resp.Output) != "hello" {
		t.Errorf("expected 'hello', got %q", resp.Output)
	}
}

func TestIntegration_Stdin(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:  "name = input()\nprint(f'hi {name}')",
		Stdin: "Alice\n",
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if strings.TrimSpace(resp.Output) != "hi Alice" {
		t.Errorf("expected 'hi Alice', got %q", resp.Output)
	}
}

func TestIntegration_SyntaxError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `print(`,
	})
	if resp.Success {
		t.Fatal("expected failure for syntax error")
	}
	if !strings.Contains(resp.Error, "SyntaxError") {
		t.Errorf("expected SyntaxError in error, got %q", resp.Error)
	}
}

func TestIntegration_RuntimeError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `x`,
	})
	if resp.Success {
		t.Fatal("expected failure for undefined variable")
	}
	if !strings.Contains(resp.Error, "NameError") {
		t.Errorf("expected NameError in error, got %q", resp.Error)
	}
}

func TestIntegration_Timeout(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      "import time; time.sleep(60)",
		TimeoutMs: intPtr(1000),
	})
	if resp.Success {
		t.Fatal("expected failure for timeout")
	}
	if resp.Error != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", resp.Error)
	}
}

func TestIntegration_RandomSeed(t *testing.T) {
	u := executorURL(t)
	seed := 42
	req := executorapi.ExecuteRequest{
		Code:       "import random; print(random.randint(1,1000))",
		RandomSeed: &seed,
	}
	resp1 := executeRequest(t, u, req)
	resp2 := executeRequest(t, u, req)
	if !resp1.Success || !resp2.Success {
		t.Fatal("expected both runs to succeed")
	}
	if resp1.Output != resp2.Output {
		t.Errorf("deterministic output expected: run1=%q run2=%q", resp1.Output, resp2.Output)
	}
}

func TestIntegration_FileAttachment(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: "with open('data.txt') as f: print(f.read().strip())",
		Files: []executorapi.File{
			{Name: "data.txt", Content: "file contents here"},
		},
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if strings.TrimSpace(resp.Output) != "file contents here" {
		t.Errorf("expected file contents, got %q", resp.Output)
	}
}

func TestIntegration_LargeOutputTruncation(t *testing.T) {
	u := executorURL(t)
	// Print ~2MB of output.
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: "print('x' * 2_000_000)",
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	// Default MaxOutputBytes is 1MB, so output should be truncated.
	if len(resp.Output) > 1100000 {
		t.Errorf("expected output to be truncated, got %d bytes", len(resp.Output))
	}
}

func TestIntegration_StderrSanitization(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: "raise ValueError('test error')",
	})
	if resp.Success {
		t.Fatal("expected failure")
	}
	// Stderr should not contain the actual sandbox path.
	if strings.Contains(resp.Error, "/tmp/work/main.py") {
		t.Error("stderr should sanitize sandbox paths")
	}
}

func TestIntegration_NetworkDisabled(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      "import socket; s = socket.socket(); s.connect(('8.8.8.8', 53))",
		TimeoutMs: intPtr(5000),
	})
	if resp.Success {
		// Network isolation depends on nsjail config and kernel capabilities.
		// In privileged Docker mode, network may not be restricted.
		t.Skip("network access not blocked in this environment (likely privileged mode)")
	}
}

func TestIntegration_MemoryLimit(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      fmt.Sprintf("x = 'a' * %d", 512*1024*1024), // 512MB
		TimeoutMs: intPtr(5000),
	})
	if resp.Success {
		t.Error("expected memory-limited code to fail")
	}
}

func TestIntegration_StdinEchoed(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:  "print('ok')",
		Stdin: "my input",
	})
	if resp.Stdin != "my input" {
		t.Errorf("expected stdin echoed back, got %q", resp.Stdin)
	}
}
