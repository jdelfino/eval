package iotestrunner

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// caseResult mirrors the JSON output of script.py for a single test case.
type caseResult struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Input  string `json:"input"`
	Actual string `json:"actual"`
	Stderr string `json:"stderr"`
}

// runScript invokes script.py with the given student code and test cases.
// Returns parsed results from the JSON output.
func runScript(t *testing.T, studentCode string, tests []map[string]any) []caseResult {
	t.Helper()

	pythonPath, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not found")
	}

	dir := t.TempDir()

	// Write the runner script.
	scriptPath := filepath.Join(dir, "runner.py")
	if err := os.WriteFile(scriptPath, []byte(Script), 0644); err != nil {
		t.Fatal(err)
	}

	// Write student code.
	codePath := filepath.Join(dir, "solution.py")
	if err := os.WriteFile(codePath, []byte(studentCode), 0644); err != nil {
		t.Fatal(err)
	}

	// Write test definitions.
	testsJSON, _ := json.Marshal(tests)
	testsPath := filepath.Join(dir, "tests.json")
	if err := os.WriteFile(testsPath, testsJSON, 0644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(pythonPath, scriptPath, codePath, testsPath)
	out, err := cmd.Output()
	if err != nil {
		// script.py itself shouldn't crash; if it does, fail hard.
		if exitErr, ok := err.(*exec.ExitError); ok {
			t.Fatalf("script.py crashed: %s", exitErr.Stderr)
		}
		t.Fatal(err)
	}

	var results []caseResult
	if err := json.Unmarshal(out, &results); err != nil {
		t.Fatalf("failed to parse script output: %v\nraw: %s", err, out)
	}
	return results
}

func TestStudentError_LineNumbersWithStdin(t *testing.T) {
	// Student code: line 1 reads input, line 2 raises an error.
	// The echo preamble (5 lines) is prepended internally, so Python sees
	// the error at line 7. The student should see line 2.
	code := "name = input()\nraise ValueError('oops')\n"
	tests := []map[string]any{{
		"name":  "crash",
		"input": "Alice\n",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if !strings.Contains(r.Stderr, "line 2") {
		t.Errorf("expected 'line 2' in stderr, got:\n%s", r.Stderr)
	}
	if strings.Contains(r.Stderr, "line 7") {
		t.Errorf("stderr has preamble-offset line number 'line 7':\n%s", r.Stderr)
	}
}

func TestStudentError_LineNumbersWithSeed(t *testing.T) {
	// Seed prefix is 2 lines. Student error on line 2 becomes internal line 4.
	code := "import random\nraise ValueError('seeded')\n"
	tests := []map[string]any{{
		"name":        "crash",
		"input":       "",
		"random_seed": 42,
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if !strings.Contains(r.Stderr, "line 2") {
		t.Errorf("expected 'line 2' in stderr, got:\n%s", r.Stderr)
	}
	if strings.Contains(r.Stderr, "line 4") {
		t.Errorf("stderr has seed-offset line number 'line 4':\n%s", r.Stderr)
	}
}

func TestStudentError_LineNumbersWithStdinAndSeed(t *testing.T) {
	// 5 echo preamble + 2 seed = 7 preamble lines. Student error on line 1
	// becomes internal line 8.
	code := "raise ValueError('both')\n"
	tests := []map[string]any{{
		"name":        "crash",
		"input":       "Alice\n",
		"random_seed": 42,
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if !strings.Contains(r.Stderr, "line 1") {
		t.Errorf("expected 'line 1' in stderr, got:\n%s", r.Stderr)
	}
}

func TestStudentError_NoTempFilePaths(t *testing.T) {
	// When preamble is injected, a temp file is created. The student should
	// see "solution.py" in tracebacks, not any temp file path.
	code := "x = input()\nraise RuntimeError('path test')\n"
	tests := []map[string]any{{
		"name":  "crash",
		"input": "hello\n",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if strings.Contains(r.Stderr, "tmp") {
		t.Errorf("stderr contains temp file path:\n%s", r.Stderr)
	}
	if !strings.Contains(r.Stderr, "solution.py") {
		t.Errorf("expected 'solution.py' in stderr, got:\n%s", r.Stderr)
	}
}

func TestStudentError_NoPrefix_ShowsRawLineNumbers(t *testing.T) {
	// No stdin, no seed — no preamble. Line numbers should be unmodified.
	code := "x = 1\ny = 2\nraise ValueError('line 3')\n"
	tests := []map[string]any{{
		"name":  "crash",
		"input": "",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if !strings.Contains(r.Stderr, "line 3") {
		t.Errorf("expected 'line 3' in stderr, got:\n%s", r.Stderr)
	}
	// Should reference solution.py (the actual filename) since no temp wrapper.
	if !strings.Contains(r.Stderr, "solution.py") {
		t.Errorf("expected 'solution.py' in stderr, got:\n%s", r.Stderr)
	}
}

func TestInputEcho_BasicBehavior(t *testing.T) {
	code := "name = input()\nprint(f'hi {name}')\n"
	tests := []map[string]any{{
		"name":            "echo",
		"input":           "Alice\n",
		"expected_output": "Alice\nhi Alice",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "passed" {
		t.Errorf("expected passed, got %q; actual=%q stderr=%q", r.Status, r.Actual, r.Stderr)
	}
}

func TestInputEcho_WithPrompt(t *testing.T) {
	code := `name = input("Enter name: ")
print(f"Hello, {name}")
`
	tests := []map[string]any{{
		"name":            "echo-prompt",
		"input":           "Alice\n",
		"expected_output": "Enter name: Alice\nHello, Alice",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "passed" {
		t.Errorf("expected passed, got %q; actual=%q stderr=%q", r.Status, r.Actual, r.Stderr)
	}
}

func TestInputEcho_MultipleInputs(t *testing.T) {
	code := "a = input()\nb = input()\nprint(f'{a} and {b}')\n"
	tests := []map[string]any{{
		"name":            "multi",
		"input":           "foo\nbar\n",
		"expected_output": "foo\nbar\nfoo and bar",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "passed" {
		t.Errorf("expected passed, got %q; actual=%q stderr=%q", r.Status, r.Actual, r.Stderr)
	}
}

func TestInputEcho_NoStdin_NoPreamble(t *testing.T) {
	code := "print('hello')\n"
	tests := []map[string]any{{
		"name":            "no-stdin",
		"input":           "",
		"expected_output": "hello",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "passed" {
		t.Errorf("expected passed, got %q; actual=%q stderr=%q", r.Status, r.Actual, r.Stderr)
	}
}

func TestStudentError_ErrnoSanitized(t *testing.T) {
	// Opening a nonexistent file produces [Errno 2]. Students should see [Error].
	code := "open('/nonexistent/file.txt')\n"
	tests := []map[string]any{{
		"name":  "errno",
		"input": "",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if strings.Contains(r.Stderr, "[Errno") {
		t.Errorf("stderr contains raw errno:\n%s", r.Stderr)
	}
	if !strings.Contains(r.Stderr, "[Error]") {
		t.Errorf("expected [Error] in stderr, got:\n%s", r.Stderr)
	}
}

func TestStudentError_EOFErrorRewritten(t *testing.T) {
	// Calling input() with no stdin triggers EOFError. Students should see
	// a friendly message instead of a raw traceback.
	code := "x = input()\n"
	tests := []map[string]any{{
		"name":  "eof",
		"input": "",
	}}

	results := runScript(t, code, tests)
	r := results[0]

	if r.Status != "error" {
		t.Fatalf("expected error status, got %q", r.Status)
	}
	if !strings.Contains(r.Stderr, "waiting for input") {
		t.Errorf("expected friendly EOFError message, got:\n%s", r.Stderr)
	}
}
