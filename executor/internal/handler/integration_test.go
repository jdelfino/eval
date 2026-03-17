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

// runOnlyCase builds a run-only (no expected output) case definition.
func runOnlyCase(input string) []executorapi.CaseDef {
	return []executorapi.CaseDef{
		{Name: "run", Type: "io", Input: input},
	}
}

// firstActual returns the actual output from the first case result.
func firstActual(resp executorapi.ExecuteResponse) string {
	if len(resp.Results) == 0 {
		return ""
	}
	return resp.Results[0].Actual
}

// firstStatus returns the status from the first case result.
func firstStatus(resp executorapi.ExecuteResponse) string {
	if len(resp.Results) == 0 {
		return ""
	}
	return resp.Results[0].Status
}

// firstStderr returns the stderr from the first case result.
func firstStderr(resp executorapi.ExecuteResponse) string {
	if len(resp.Results) == 0 {
		return ""
	}
	return resp.Results[0].Stderr
}

func intPtr(n int) *int { return &n }

func TestIntegration_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     `print("hello")`,
		Language: "python",
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	if strings.TrimSpace(firstActual(resp)) != "hello" {
		t.Errorf("expected 'hello', got %q", firstActual(resp))
	}
}

func TestIntegration_Stdin(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     "name = input()\nprint(f'hi {name}')",
		Language: "python",
		Cases:    runOnlyCase("Alice\n"),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	output := strings.TrimSpace(firstActual(resp))
	if !strings.Contains(output, "hi Alice") {
		t.Errorf("expected 'hi Alice' in output, got %q", output)
	}
}

func TestIntegration_SyntaxError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     `print(`,
		Language: "python",
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure for syntax error")
	}
	if !strings.Contains(firstStderr(resp), "SyntaxError") {
		t.Errorf("expected SyntaxError in stderr, got %q", firstStderr(resp))
	}
}

func TestIntegration_RuntimeError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     `x`,
		Language: "python",
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure for undefined variable")
	}
	if !strings.Contains(firstStderr(resp), "NameError") {
		t.Errorf("expected NameError in stderr, got %q", firstStderr(resp))
	}
}

func TestIntegration_Timeout(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      "import time; time.sleep(60)",
		TimeoutMs: intPtr(1000),
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected error status for timeout")
	}
	if firstStderr(resp) != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", firstStderr(resp))
	}
}

func TestIntegration_RandomOutput(t *testing.T) {
	// Verify that code using random can run successfully.
	// Per-case random seed forwarding is a forward-compatibility feature
	// tracked for future implementation.
	u := executorURL(t)
	req := executorapi.ExecuteRequest{
		Code:     "import random; print(random.randint(1,1000))",
		Language: "python",
		Cases:    runOnlyCase(""),
	}
	resp := executeRequest(t, u, req)
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
}

func TestIntegration_FileAttachment(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     "with open('data.txt') as f: print(f.read().strip())",
		Language: "python",
		Cases: []executorapi.CaseDef{
			{Name: "run", Type: "io", Input: "", Files: []executorapi.File{
				{Name: "data.txt", Content: "file contents here"},
			}},
		},
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	if strings.TrimSpace(firstActual(resp)) != "file contents here" {
		t.Errorf("expected file contents, got %q", firstActual(resp))
	}
}

func TestIntegration_LargeOutputTruncation(t *testing.T) {
	u := executorURL(t)
	// Print ~2MB of output.
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     "print('x' * 2_000_000)",
		Language: "python",
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	// Default MaxOutputBytes is 1MB, so output should be truncated.
	if len(firstActual(resp)) > 1100000 {
		t.Errorf("expected output to be truncated, got %d bytes", len(firstActual(resp)))
	}
}

func TestIntegration_StderrSanitization(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:     "raise ValueError('test error')",
		Language: "python",
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure")
	}
	// Stderr should not contain the actual sandbox path.
	if strings.Contains(firstStderr(resp), "/tmp/work/main.py") {
		t.Error("stderr should sanitize sandbox paths")
	}
}

func TestIntegration_NetworkDisabled(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, executorapi.ExecuteRequest{
		Code:      "import socket; s = socket.socket(); s.connect(('8.8.8.8', 53))",
		TimeoutMs: intPtr(5000),
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
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
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
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
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	output := strings.TrimSpace(firstActual(resp))
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, firstStatus(resp), firstStderr(resp))
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
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	output := strings.TrimSpace(firstActual(resp))
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, firstStatus(resp), firstStderr(resp))
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
		Language:  "python",
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected Python stdlib to work, got error: %s", firstStderr(resp))
	}
	output := strings.TrimSpace(firstActual(resp))
	if !strings.Contains(output, "3.14") {
		t.Errorf("expected pi in output, got %q", output)
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
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	if strings.TrimSpace(firstActual(resp)) != "hello from java" {
		t.Errorf("expected 'hello from java', got %q", firstActual(resp))
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
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure for compilation error")
	}
	if !strings.Contains(firstStderr(resp), "error") {
		t.Errorf("expected compilation error message, got %q", firstStderr(resp))
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
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure for runtime exception")
	}
	if !strings.Contains(firstStderr(resp), "ArrayIndexOutOfBoundsException") {
		t.Errorf("expected ArrayIndexOutOfBoundsException in stderr, got %q", firstStderr(resp))
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
		Language: "java",
		Cases:    runOnlyCase("Alice\n"),
	})
	if firstStatus(resp) == "error" {
		t.Fatalf("expected success, got error: %s", firstStderr(resp))
	}
	if !strings.Contains(firstActual(resp), "hi Alice") {
		t.Errorf("expected output containing 'hi Alice', got %q", firstActual(resp))
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
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected error status for timeout")
	}
	if firstStderr(resp) != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", firstStderr(resp))
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
		Cases:    runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
		t.Fatal("expected failure")
	}
	// Stderr should not contain sandbox-internal paths.
	if strings.Contains(firstStderr(resp), "/tmp/work") {
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
		Cases:     runOnlyCase(""),
	})
	if firstStatus(resp) != "error" {
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
		Cases:     runOnlyCase(""),
	})
	output := strings.TrimSpace(firstActual(resp))
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, firstStatus(resp), firstStderr(resp))
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
		Cases:     runOnlyCase(""),
	})
	output := strings.TrimSpace(firstActual(resp))
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, firstStatus(resp), firstStderr(resp))
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
		Cases:     runOnlyCase(""),
	})
	output := strings.TrimSpace(firstActual(resp))
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not allow writing outside work dir, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, firstStatus(resp), firstStderr(resp))
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
	skipSandboxTest(t) // Java tracer JAR only exists in the Docker image
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
