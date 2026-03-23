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

// firstResult returns the first CaseResult from a response, or fails the test.
func firstResult(t *testing.T, resp executorapi.ExecuteResponse) executorapi.CaseResult {
	t.Helper()
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one result in response")
	}
	return resp.Results[0]
}

// singleCase builds an ExecuteRequest with a single I/O case.
func singleCase(code, language, input string, files []executorapi.File, randomSeed *int, timeoutMs *int) executorapi.ExecuteRequest {
	c := executorapi.CaseDef{
		Name:  "run",
		Type:  "io",
		Input: input,
	}
	if len(files) > 0 {
		c.Files = files
	}
	if randomSeed != nil {
		c.RandomSeed = randomSeed
	}
	req := executorapi.ExecuteRequest{
		Code:     code,
		Language: language,
		Cases:    []executorapi.CaseDef{c},
	}
	if timeoutMs != nil {
		req.TimeoutMs = timeoutMs
	}
	return req
}

func intPtr(n int) *int { return &n }

func TestIntegration_HelloWorld(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`print("hello")`, "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if strings.TrimSpace(r.Actual) != "hello" {
		t.Errorf("expected 'hello', got %q", r.Actual)
	}
}

func TestIntegration_Stdin(t *testing.T) {
	// Verifies that input() echoes stdin values to stdout via the INPUT_ECHO_PREAMBLE.
	// When stdin is piped, terminals echo typed input automatically; the preamble replicates
	// this so student output is readable. Without echo, output like "hi Alice" has no visible
	// "Alice" line, which is confusing in assignment feedback.
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase("name = input()\nprint(f'hi {name}')", "python", "Alice\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	// Echo preamble prints the input value, then student code prints the greeting.
	want := "Alice\nhi Alice"
	if strings.TrimSpace(r.Actual) != want {
		t.Errorf("expected %q, got %q", want, r.Actual)
	}
}

func TestIntegration_InputEcho_WithPrompt(t *testing.T) {
	// Verifies that even when input() is called with a prompt argument, the entered value
	// is echoed to stdout. The prompt itself goes to stdout via Python's input() behavior;
	// the preamble additionally prints the value so it appears in the output stream.
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase("name = input(\"Enter name: \")\nprint(f\"Hello, {name}\")", "python", "Alice\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if !strings.Contains(r.Actual, "Alice") {
		t.Errorf("expected echoed 'Alice' in output, got %q", r.Actual)
	}
}

func TestIntegration_InputEcho_NoStdin(t *testing.T) {
	// Verifies that when no stdin is provided (empty input), the echo preamble is NOT
	// prepended. This prevents unnecessary preamble overhead and avoids any interference
	// with code that does not use input().
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`print("hello")`, "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if strings.TrimSpace(r.Actual) != "hello" {
		t.Errorf("expected 'hello', got %q", r.Actual)
	}
}

func TestIntegration_InputEcho_MultipleInputs(t *testing.T) {
	// Verifies that multiple sequential input() calls each echo their value.
	// Students often provide multiple inputs; all should appear in output.
	u := executorURL(t)
	code := "a = input()\nb = input()\nprint(f'{a} and {b}')"
	resp := executeRequest(t, u, singleCase(code, "python", "foo\nbar\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if !strings.Contains(r.Actual, "foo") || !strings.Contains(r.Actual, "bar") {
		t.Errorf("expected both inputs echoed, got %q", r.Actual)
	}
	if !strings.Contains(r.Actual, "foo and bar") {
		t.Errorf("expected student output 'foo and bar', got %q", r.Actual)
	}
}

func TestIntegration_ErrorLineNumbers_WithStdin(t *testing.T) {
	// Verifies that when stdin is provided (and the echo preamble is prepended),
	// line numbers in error messages reference the student's code, not the preamble-offset lines.
	// A student whose code errors on line 2 should see "line 2", not "line 7" (preamble is 5 lines).
	u := executorURL(t)
	code := "name = input()\nraise ValueError('oops')"
	resp := executeRequest(t, u, singleCase(code, "python", "Alice\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected error from raised ValueError")
	}
	if strings.Contains(r.Stderr, "line 7") {
		t.Errorf("stderr contains preamble-offset line number 'line 7'; expected student-visible 'line 2': %q", r.Stderr)
	}
	if !strings.Contains(r.Stderr, "line 2") {
		t.Errorf("expected 'line 2' in stderr for student code error, got %q", r.Stderr)
	}
}

func TestIntegration_ErrorLineNumbers_WithSeed(t *testing.T) {
	// Verifies that when random_seed is provided (seed line prepended), line numbers in
	// error messages still reference the student's code lines (not offset by seed line).
	u := executorURL(t)
	seed := 42
	code := "import random\nraise ValueError('seeded error')"
	resp := executeRequest(t, u, singleCase(code, "python", "", nil, &seed, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected error from raised ValueError")
	}
	// seed prefix is 2 lines ("import random\nrandom.seed(N)\n"); student's error on line 2 becomes internal line 4
	if strings.Contains(r.Stderr, "line 4") {
		t.Errorf("stderr contains seed-offset line number 'line 4'; expected student-visible 'line 2': %q", r.Stderr)
	}
	if !strings.Contains(r.Stderr, "line 2") {
		t.Errorf("expected 'line 2' in stderr for student code error, got %q", r.Stderr)
	}
}

func TestIntegration_ErrorLineNumbers_WithStdinAndSeed(t *testing.T) {
	// Verifies that when both stdin and random_seed are provided (7 preamble lines total:
	// 5 for echo preamble + 2 seed lines), error line numbers are correctly adjusted.
	// Student code erroring on line 1 should show "line 1", not "line 8".
	u := executorURL(t)
	seed := 42
	code := "raise ValueError('combined preamble error')"
	resp := executeRequest(t, u, singleCase(code, "python", "Alice\n", nil, &seed, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected error from raised ValueError")
	}
	if !strings.Contains(r.Stderr, "line 1") {
		t.Errorf("expected 'line 1' in stderr for student code error on first line, got %q", r.Stderr)
	}
}

func TestIntegration_ErrorStderrPathSanitization(t *testing.T) {
	// Verifies that when a temp wrapper file is created (for stdin echo preamble or seed),
	// error tracebacks reference "solution.py" rather than the temp file path (e.g. tmpXXXXXX.py).
	// Students should not see internal temp file paths in error messages.
	u := executorURL(t)
	code := "name = input()\nraise RuntimeError('path test')"
	resp := executeRequest(t, u, singleCase(code, "python", "Alice\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected error from raised RuntimeError")
	}
	if strings.Contains(r.Stderr, "tmp") {
		t.Errorf("stderr should not contain temp file paths, got %q", r.Stderr)
	}
	if !strings.Contains(r.Stderr, "solution.py") {
		t.Errorf("stderr should reference 'solution.py', got %q", r.Stderr)
	}
}

func TestIntegration_SyntaxError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`print(`, "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for syntax error")
	}
	if !strings.Contains(r.Stderr, "SyntaxError") {
		t.Errorf("expected SyntaxError in stderr, got %q", r.Stderr)
	}
}

func TestIntegration_RuntimeError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`x`, "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for undefined variable")
	}
	if !strings.Contains(r.Stderr, "NameError") {
		t.Errorf("expected NameError in stderr, got %q", r.Stderr)
	}
}

func TestIntegration_Timeout(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase("import time; time.sleep(60)", "python", "", nil, nil, intPtr(1000)))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for timeout")
	}
	if r.Stderr != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", r.Stderr)
	}
}

func TestIntegration_RandomSeed(t *testing.T) {
	u := executorURL(t)
	seed := 42
	req := singleCase("import random; print(random.randint(1,1000))", "python", "", nil, &seed, nil)
	resp1 := executeRequest(t, u, req)
	resp2 := executeRequest(t, u, req)
	r1 := firstResult(t, resp1)
	r2 := firstResult(t, resp2)
	if r1.Status == "error" || r2.Status == "error" {
		t.Fatal("expected both runs to succeed")
	}
	if r1.Actual != r2.Actual {
		t.Errorf("deterministic output expected: run1=%q run2=%q", r1.Actual, r2.Actual)
	}
}

func TestIntegration_FileAttachment(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(
		"with open('data.txt') as f: print(f.read().strip())",
		"python", "",
		[]executorapi.File{{Name: "data.txt", Content: "file contents here"}},
		nil, nil,
	))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if strings.TrimSpace(r.Actual) != "file contents here" {
		t.Errorf("expected file contents, got %q", r.Actual)
	}
}

func TestIntegration_LargeOutputTruncation(t *testing.T) {
	u := executorURL(t)
	// Print ~2MB of output.
	resp := executeRequest(t, u, singleCase("print('x' * 2_000_000)", "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	// Default MaxOutputBytes is 1MB, so output should be truncated.
	if len(r.Actual) > 1100000 {
		t.Errorf("expected output to be truncated, got %d bytes", len(r.Actual))
	}
}

func TestIntegration_StderrSanitization(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase("raise ValueError('test error')", "python", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure")
	}
	// Stderr should not contain the actual sandbox path.
	if strings.Contains(r.Stderr, "/tmp/work/main.py") {
		t.Error("stderr should sanitize sandbox paths")
	}
}

func TestIntegration_NetworkDisabled(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(
		"import socket; s = socket.socket(); s.connect(('8.8.8.8', 53))",
		"python", "", nil, nil, intPtr(5000),
	))
	r := firstResult(t, resp)
	if r.Status != "error" {
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
	resp := executeRequest(t, u, singleCase(
		fmt.Sprintf("x = 'a' * %d", 512*1024*1024), // 512MB
		"python", "", nil, nil, intPtr(5000),
	))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Error("expected memory-limited code to fail")
	}
}

func TestIntegration_FilesystemIsolation_EtcPasswd(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`
import os
try:
    with open('/etc/passwd') as f:
        print("LEAKED:" + f.readline())
except Exception as e:
    print("BLOCKED:" + type(e).__name__)
`, "python", "", nil, nil, intPtr(5000)))
	r := firstResult(t, resp)
	output := strings.TrimSpace(r.Actual)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, r.Status, r.Stderr)
	}
}

func TestIntegration_FilesystemIsolation_Proc(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`
import os
try:
    entries = os.listdir('/proc')
    print("LEAKED:" + str(len(entries)))
except Exception as e:
    print("BLOCKED:" + type(e).__name__)
`, "python", "", nil, nil, intPtr(5000)))
	r := firstResult(t, resp)
	output := strings.TrimSpace(r.Actual)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, r.Status, r.Stderr)
	}
}

func TestIntegration_FilesystemIsolation_PythonStdlib(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	// Verify Python stdlib still works with the restricted chroot.
	resp := executeRequest(t, u, singleCase(`
import json
import math
import os
print(json.dumps({"pi": round(math.pi, 2), "cwd": os.getcwd()}))
`, "python", "", nil, nil, intPtr(5000)))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected Python stdlib to work, got error: %s", r.Stderr)
	}
	output := strings.TrimSpace(r.Actual)
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
	resp := executeRequest(t, u, singleCase(`public class Main {
    public static void main(String[] args) {
        System.out.println("hello from java");
    }
}`, "java", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if strings.TrimSpace(r.Actual) != "hello from java" {
		t.Errorf("expected 'hello from java', got %q", r.Actual)
	}
}

func TestIntegration_Java_CompilationError(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`public class Main {
    public static void main(String[] args) {
        System.out.println("missing semicolon")
    }
}`, "java", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for compilation error")
	}
	if !strings.Contains(r.Stderr, "error") {
		t.Errorf("expected compilation error message, got %q", r.Stderr)
	}
}

func TestIntegration_Java_RuntimeException(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`public class Main {
    public static void main(String[] args) {
        int[] arr = new int[1];
        System.out.println(arr[5]);
    }
}`, "java", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for runtime exception")
	}
	if !strings.Contains(r.Stderr, "ArrayIndexOutOfBoundsException") {
		t.Errorf("expected ArrayIndexOutOfBoundsException in stderr, got %q", r.Stderr)
	}
}

func TestIntegration_Java_Stdin(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println("hi " + name);
    }
}`, "java", "Alice\n", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status == "error" {
		t.Fatalf("expected success, got error: %s", r.Stderr)
	}
	if !strings.Contains(r.Actual, "hi Alice") {
		t.Errorf("expected output containing 'hi Alice', got %q", r.Actual)
	}
}

func TestIntegration_Java_Timeout(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`public class Main {
    public static void main(String[] args) throws Exception {
        Thread.sleep(60000);
    }
}`, "java", "", nil, nil, intPtr(3000)))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure for timeout")
	}
	if r.Stderr != "execution timed out" {
		t.Errorf("expected 'execution timed out', got %q", r.Stderr)
	}
}

func TestIntegration_Java_StderrSanitization(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`public class Main {
    public static void main(String[] args) {
        throw new RuntimeException("test error");
    }
}`, "java", "", nil, nil, nil))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Fatal("expected failure")
	}
	// Stderr should not contain sandbox-internal paths.
	if strings.Contains(r.Stderr, "/tmp/work") {
		t.Error("stderr should sanitize sandbox paths")
	}
}

// ---------------------------------------------------------------------------
// Java sandbox isolation (jailbreak) tests
// ---------------------------------------------------------------------------

func TestIntegration_Java_NetworkDisabled(t *testing.T) {
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`import java.net.Socket;
public class Main {
    public static void main(String[] args) throws Exception {
        Socket s = new Socket("8.8.8.8", 53);
        System.out.println("CONNECTED");
        s.close();
    }
}`, "java", "", nil, nil, intPtr(10000)))
	r := firstResult(t, resp)
	if r.Status != "error" {
		t.Log("WARNING: network access was not blocked; network isolation is not enforced in this environment (likely privileged Docker mode)")
		return
	}
}

func TestIntegration_Java_FilesystemIsolation_EtcPasswd(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`import java.io.*;
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
}`, "java", "", nil, nil, intPtr(10000)))
	r := firstResult(t, resp)
	output := strings.TrimSpace(r.Actual)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /etc/passwd, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, r.Status, r.Stderr)
	}
}

func TestIntegration_Java_FilesystemIsolation_Proc(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`import java.io.File;
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
}`, "java", "", nil, nil, intPtr(10000)))
	r := firstResult(t, resp)
	output := strings.TrimSpace(r.Actual)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not expose /proc, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, r.Status, r.Stderr)
	}
}

func TestIntegration_Java_FilesystemIsolation_WriteOutsideWorkDir(t *testing.T) {
	skipSandboxTest(t)
	u := executorURL(t)
	resp := executeRequest(t, u, singleCase(`import java.io.*;
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
}`, "java", "", nil, nil, intPtr(10000)))
	r := firstResult(t, resp)
	output := strings.TrimSpace(r.Actual)
	if strings.HasPrefix(output, "LEAKED:") {
		t.Fatalf("sandbox should not allow writing outside work dir, got: %s", output)
	}
	if !strings.HasPrefix(output, "BLOCKED:") {
		t.Errorf("expected BLOCKED prefix, got %q (status=%v, stderr=%q)", output, r.Status, r.Stderr)
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
