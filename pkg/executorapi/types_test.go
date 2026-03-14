package executorapi

import (
	"encoding/json"
	"testing"
)

// ---------------------------------------------------------------------------
// TestRequest / TestResponse / IOTestDef / TestResult / TestSummary
// ---------------------------------------------------------------------------

func TestTestRequest_JSON(t *testing.T) {
	timeout := 5000
	req := TestRequest{
		Code:     "print(input())",
		Language: "python",
		IOTests: []IOTestDef{
			{Name: "basic", Input: "hello", ExpectedOutput: "hello", MatchType: "exact"},
		},
		TimeoutMs: &timeout,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded TestRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Code != req.Code {
		t.Errorf("code: got %q, want %q", decoded.Code, req.Code)
	}
	if decoded.Language != req.Language {
		t.Errorf("language: got %q, want %q", decoded.Language, req.Language)
	}
	if len(decoded.IOTests) != 1 {
		t.Fatalf("io_tests length: got %d, want 1", len(decoded.IOTests))
	}
	if decoded.IOTests[0].Name != "basic" {
		t.Errorf("io_tests[0].name: got %q, want %q", decoded.IOTests[0].Name, "basic")
	}
	if decoded.IOTests[0].Input != "hello" {
		t.Errorf("io_tests[0].input: got %q, want %q", decoded.IOTests[0].Input, "hello")
	}
	if decoded.IOTests[0].ExpectedOutput != "hello" {
		t.Errorf("io_tests[0].expected_output: got %q, want %q", decoded.IOTests[0].ExpectedOutput, "hello")
	}
	if decoded.IOTests[0].MatchType != "exact" {
		t.Errorf("io_tests[0].match_type: got %q, want %q", decoded.IOTests[0].MatchType, "exact")
	}
	if decoded.TimeoutMs == nil || *decoded.TimeoutMs != 5000 {
		t.Errorf("timeout_ms: got %v", decoded.TimeoutMs)
	}
}

func TestTestRequest_OmitsEmptyFields(t *testing.T) {
	req := TestRequest{
		Code:     "print('hello')",
		Language: "python",
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"timeout_ms", "io_tests"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}
}

func TestIOTestDef_OptionalExpectedOutput(t *testing.T) {
	// ExpectedOutput is optional (run-only case — no expected output means "just run")
	def := IOTestDef{
		Name:      "run-only",
		Input:     "5",
		MatchType: "exact",
		// ExpectedOutput intentionally omitted
	}
	data, err := json.Marshal(def)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal to raw: %v", err)
	}
	if _, ok := raw["expected_output"]; ok {
		t.Errorf("expected expected_output to be omitted when empty")
	}

	var decoded IOTestDef
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.ExpectedOutput != "" {
		t.Errorf("expected empty ExpectedOutput, got %q", decoded.ExpectedOutput)
	}
}

func TestTestResponse_JSON(t *testing.T) {
	resp := TestResponse{
		Results: []TestResult{
			{
				Name:     "test1",
				Type:     "io",
				Status:   "passed",
				Input:    "hello",
				Expected: "hello",
				Actual:   "hello",
				TimeMs:   12,
			},
			{
				Name:     "test2",
				Type:     "io",
				Status:   "failed",
				Input:    "world",
				Expected: "world",
				Actual:   "WORLD",
				TimeMs:   8,
			},
		},
		Summary: TestSummary{
			Total:   2,
			Passed:  1,
			Failed:  1,
			Errors:  0,
			TimeMs:  20,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded TestResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(decoded.Results) != 2 {
		t.Fatalf("results length: got %d, want 2", len(decoded.Results))
	}
	if decoded.Results[0].Status != "passed" {
		t.Errorf("results[0].status: got %q, want %q", decoded.Results[0].Status, "passed")
	}
	if decoded.Results[1].Status != "failed" {
		t.Errorf("results[1].status: got %q, want %q", decoded.Results[1].Status, "failed")
	}
	if decoded.Summary.Total != 2 {
		t.Errorf("summary.total: got %d, want 2", decoded.Summary.Total)
	}
	if decoded.Summary.Passed != 1 {
		t.Errorf("summary.passed: got %d, want 1", decoded.Summary.Passed)
	}
	if decoded.Summary.Failed != 1 {
		t.Errorf("summary.failed: got %d, want 1", decoded.Summary.Failed)
	}
}

func TestTestResult_OmitsEmptyFields(t *testing.T) {
	result := TestResult{
		Name:   "error-test",
		Type:   "io",
		Status: "error",
		TimeMs: 5,
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"input", "expected", "actual", "stderr"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}

	// Required fields must be present
	for _, field := range []string{"name", "type", "status", "time_ms"} {
		if _, ok := raw[field]; !ok {
			t.Errorf("expected field %q to be present, but it was missing", field)
		}
	}
}

func TestExecuteRequest_JSON(t *testing.T) {
	seed := 42
	timeout := 5000
	req := ExecuteRequest{
		Code:       "print('hello')",
		Stdin:      "input",
		Files:      []File{{Name: "data.txt", Content: "hello"}},
		RandomSeed: &seed,
		TimeoutMs:  &timeout,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Code != req.Code {
		t.Errorf("code: got %q, want %q", decoded.Code, req.Code)
	}
	if decoded.Stdin != req.Stdin {
		t.Errorf("stdin: got %q, want %q", decoded.Stdin, req.Stdin)
	}
	if len(decoded.Files) != 1 || decoded.Files[0].Name != "data.txt" {
		t.Errorf("files: got %+v", decoded.Files)
	}
	if decoded.RandomSeed == nil || *decoded.RandomSeed != 42 {
		t.Errorf("random_seed: got %v", decoded.RandomSeed)
	}
	if decoded.TimeoutMs == nil || *decoded.TimeoutMs != 5000 {
		t.Errorf("timeout_ms: got %v", decoded.TimeoutMs)
	}
}

func TestExecuteRequest_OmitsEmptyFields(t *testing.T) {
	req := ExecuteRequest{Code: "x=1"}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"stdin", "files", "random_seed", "timeout_ms"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}
}

func TestExecuteResponse_OmitsEmptyFields(t *testing.T) {
	resp := ExecuteResponse{
		Success:         true,
		ExecutionTimeMs: 42,
	}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"error", "output", "stdin"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}

	// Verify required fields are still present
	for _, field := range []string{"success", "execution_time_ms"} {
		if _, ok := raw[field]; !ok {
			t.Errorf("expected field %q to be present, but it was missing", field)
		}
	}
}

func TestExecuteResponse_JSON(t *testing.T) {
	resp := ExecuteResponse{
		Success:         true,
		Output:          "hello\n",
		Error:           "",
		ExecutionTimeMs: 42,
		Stdin:           "input",
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Success != resp.Success {
		t.Errorf("success: got %v, want %v", decoded.Success, resp.Success)
	}
	if decoded.Output != resp.Output {
		t.Errorf("output: got %q, want %q", decoded.Output, resp.Output)
	}
	if decoded.ExecutionTimeMs != resp.ExecutionTimeMs {
		t.Errorf("execution_time_ms: got %d, want %d", decoded.ExecutionTimeMs, resp.ExecutionTimeMs)
	}
}
