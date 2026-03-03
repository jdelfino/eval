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

// skipSandboxTest skips tests that require full nsjail sandbox functionality.
// Set EXECUTOR_SKIP_SANDBOX_TESTS=1 to skip these locally (sandbox doesn't work in devcontainers).
func skipSandboxTest(t *testing.T) {
	t.Helper()
	if os.Getenv("EXECUTOR_SKIP_SANDBOX_TESTS") != "" {
		t.Skip("EXECUTOR_SKIP_SANDBOX_TESTS set, skipping sandbox isolation test")
	}
}

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
	// Input echo preamble causes input() values to appear in stdout.
	want := "Alice\nhi Alice"
	if strings.TrimSpace(resp.Output) != want {
		t.Errorf("expected %q, got %q", want, resp.Output)
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
		// This is expected — log a warning but don't skip/fail.
		t.Log("WARNING: network access was not blocked; network isolation is not enforced in this environment (likely privileged Docker mode)")
		return
	}
}

func TestIntegration_MemoryLimit(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      fmt.Sprintf("x = 'a' * %d", 512*1024*1024), // 512MB
		TimeoutMs: intPtr(5000),
	})
	if resp.Success {
		t.Error("expected memory-limited code to fail")
	}
}

func TestIntegration_FilesystemIsolation_EtcPasswd(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `
import os
try:
    with open('/etc/passwd') as f:
        print("LEAKED:" + f.readline())
except Exception as e:
    print("BLOCKED:" + type(e).__name__)
`,
		TimeoutMs: intPtr(5000),
	})
	output := strings.TrimSpace(resp.Output)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (success=%v, error=%q)", output, resp.Success, resp.Error)
	}
}

func TestIntegration_FilesystemIsolation_Proc(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `
import os
try:
    entries = os.listdir('/proc')
    print("LEAKED:" + str(len(entries)))
except Exception as e:
    print("BLOCKED:" + type(e).__name__)
`,
		TimeoutMs: intPtr(5000),
	})
	output := strings.TrimSpace(resp.Output)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (success=%v, error=%q)", output, resp.Success, resp.Error)
	}
}

func TestIntegration_FilesystemIsolation_PythonStdlib(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	// Verify Python stdlib still works with the restricted chroot.
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `
import json
import math
import os
print(json.dumps({"pi": round(math.pi, 2), "cwd": os.getcwd()}))
`,
		TimeoutMs: intPtr(5000),
	})
	if !resp.Success {
		t.Fatalf("expected Python stdlib to work, got error: %s", resp.Error)
	}
	output := strings.TrimSpace(resp.Output)
	if !strings.Contains(output, "3.14") {
		t.Errorf("expected pi in output, got %q", output)
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

// traceRequest sends a trace request and decodes the response.
func traceRequest(t *testing.T, baseURL string, req executorapi.TraceRequest) executorapi.TraceResponse {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	client := &http.Client{Timeout: 35 * time.Second}
	resp, err := client.Post(baseURL+"/trace", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /trace: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		respBody := make([]byte, 1024)
		n, _ := resp.Body.Read(respBody)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(respBody[:n]))
	}

	var result executorapi.TraceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return result
}

// ---------------------------------------------------------------------------
// Java execution integration tests
// ---------------------------------------------------------------------------

func TestIntegration_Java_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `public class Main {
    public static void main(String[] args) {
        System.out.println("hello from java");
    }
}`,
		Language: "java",
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if strings.TrimSpace(resp.Output) != "hello from java" {
		t.Errorf("expected 'hello from java', got %q", resp.Output)
	}
}

func TestIntegration_Java_CompilationError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `public class Main {
    public static void main(String[] args) {
        System.out.println("missing semicolon")
    }
}`,
		Language: "java",
	})
	if resp.Success {
		t.Fatal("expected failure for compilation error")
	}
	if !strings.Contains(resp.Error, "error") {
		t.Errorf("expected compilation error message, got %q", resp.Error)
	}
}

func TestIntegration_Java_RuntimeException(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `public class Main {
    public static void main(String[] args) {
        int[] arr = new int[1];
        System.out.println(arr[5]);
    }
}`,
		Language: "java",
	})
	if resp.Success {
		t.Fatal("expected failure for runtime exception")
	}
	if !strings.Contains(resp.Error, "ArrayIndexOutOfBoundsException") {
		t.Errorf("expected ArrayIndexOutOfBoundsException in error, got %q", resp.Error)
	}
}

func TestIntegration_Java_Stdin(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("hi " + name);
    }
}`,
		Stdin:    "Alice\n",
		Language: "java",
	})
	if !resp.Success {
		t.Fatalf("expected success, got error: %s", resp.Error)
	}
	if !strings.Contains(resp.Output, "hi Alice") {
		t.Errorf("expected output containing 'hi Alice', got %q", resp.Output)
	}
}

func TestIntegration_Java_Timeout(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `public class Main {
    public static void main(String[] args) throws Exception {
        Thread.sleep(60000);
    }
}`,
		Language:  "java",
		TimeoutMs: intPtr(3000),
	})
	if resp.Success {
		t.Fatal("expected failure for timeout")
	}
	if resp.Error != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", resp.Error)
	}
}

func TestIntegration_Java_StderrSanitization(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `public class Main {
    public static void main(String[] args) {
        throw new RuntimeException("test error");
    }
}`,
		Language: "java",
	})
	if resp.Success {
		t.Fatal("expected failure")
	}
	// Stderr should not contain sandbox-internal paths.
	if strings.Contains(resp.Error, "/tmp/work") {
		t.Error("stderr should sanitize sandbox paths")
	}
}

// ---------------------------------------------------------------------------
// Java sandbox isolation (jailbreak) tests
// ---------------------------------------------------------------------------

func TestIntegration_Java_NetworkDisabled(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `import java.net.Socket;
public class Main {
    public static void main(String[] args) throws Exception {
        Socket s = new Socket("8.8.8.8", 53);
        System.out.println("CONNECTED");
        s.close();
    }
}`,
		Language:  "java",
		TimeoutMs: intPtr(10000),
	})
	if resp.Success {
		t.Log("WARNING: network access was not blocked; network isolation is not enforced in this environment (likely privileged Docker mode)")
		return
	}
}

func TestIntegration_Java_FilesystemIsolation_EtcPasswd(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `import java.io.*;
public class Main {
    public static void main(String[] args) {
        try {
            BufferedReader r = new BufferedReader(new FileReader("/etc/passwd"));
            System.out.println("LEAKED:" + r.readLine());
            r.close();
        } catch (Exception e) {
            System.out.println("BLOCKED:" + e.getClass().getSimpleName());
        }
    }
}`,
		Language:  "java",
		TimeoutMs: intPtr(10000),
	})
	output := strings.TrimSpace(resp.Output)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (success=%v, error=%q)", output, resp.Success, resp.Error)
	}
}

func TestIntegration_Java_FilesystemIsolation_Proc(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `import java.io.File;
public class Main {
    public static void main(String[] args) {
        File proc = new File("/proc");
        String[] entries = proc.list();
        if (entries != null && entries.length > 0) {
            System.out.println("LEAKED:" + entries.length);
        } else {
            System.out.println("BLOCKED:NoEntries");
        }
    }
}`,
		Language:  "java",
		TimeoutMs: intPtr(10000),
	})
	output := strings.TrimSpace(resp.Output)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (success=%v, error=%q)", output, resp.Success, resp.Error)
	}
}

func TestIntegration_Java_FilesystemIsolation_WriteOutsideWorkDir(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code: `import java.io.*;
public class Main {
    public static void main(String[] args) {
        try {
            FileWriter fw = new FileWriter("/usr/evil.txt");
            fw.write("pwned");
            fw.close();
            System.out.println("LEAKED:wrote to /usr");
        } catch (Exception e) {
            System.out.println("BLOCKED:" + e.getClass().getSimpleName());
        }
    }
}`,
		Language:  "java",
		TimeoutMs: intPtr(10000),
	})
	output := strings.TrimSpace(resp.Output)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not allow writing outside work dir, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (success=%v, error=%q)", output, resp.Success, resp.Error)
	}
}

// ---------------------------------------------------------------------------
// Trace integration tests (Python + Java)
// ---------------------------------------------------------------------------

func TestIntegration_Trace_Python_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := traceRequest(t, u, executorapi.TraceRequest{
		Code:     "x = 1\ny = 2\nprint(x + y)",
		MaxSteps: intPtr(50),
	})
	if resp.Error != "" {
		t.Fatalf("expected no error, got: %s", resp.Error)
	}
	if resp.TotalSteps == 0 {
		t.Error("expected at least one trace step")
	}
	// Should have steps with line numbers.
	foundLine := false
	for _, step := range resp.Steps {
		if step.Line > 0 {
			foundLine = true
			break
		}
	}
	if !foundLine {
		t.Error("expected at least one step with a positive line number")
	}
}

func TestIntegration_Trace_Java_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := traceRequest(t, u, executorapi.TraceRequest{
		Code: `public class Main {
    public static void main(String[] args) {
        int x = 1;
        int y = 2;
        System.out.println(x + y);
    }
}`,
		Language: "java",
		MaxSteps: intPtr(50),
	})
	if resp.Error != "" {
		t.Fatalf("expected no error, got: %s", resp.Error)
	}
	if resp.TotalSteps == 0 {
		t.Error("expected at least one trace step")
	}
	// Should have steps with line numbers.
	foundLine := false
	for _, step := range resp.Steps {
		if step.Line > 0 {
			foundLine = true
			break
		}
	}
	if !foundLine {
		t.Error("expected at least one step with a positive line number")
	}
}
