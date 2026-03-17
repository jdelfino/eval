package executorapi

import (
	"encoding/json"
	"testing"
)

// ---------------------------------------------------------------------------
// ExecuteRequest
// ---------------------------------------------------------------------------

func TestExecuteRequest_JSON(t *testing.T) {
	timeout := 5000
	seed := 42
	req := ExecuteRequest{
		Code:      "print('hello')",
		Language:  "python",
		TimeoutMs: &timeout,
		Cases: []CaseDef{
			{Name: "basic", Input: "hello", ExpectedOutput: "hello", MatchType: "exact", RandomSeed: &seed},
		},
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
	if decoded.Language != req.Language {
		t.Errorf("language: got %q, want %q", decoded.Language, req.Language)
	}
	if decoded.TimeoutMs == nil || *decoded.TimeoutMs != 5000 {
		t.Errorf("timeout_ms: got %v", decoded.TimeoutMs)
	}
	if len(decoded.Cases) != 1 {
		t.Fatalf("cases length: got %d, want 1", len(decoded.Cases))
	}
	if decoded.Cases[0].Name != "basic" {
		t.Errorf("cases[0].name: got %q, want %q", decoded.Cases[0].Name, "basic")
	}
	if decoded.Cases[0].Input != "hello" {
		t.Errorf("cases[0].input: got %q, want %q", decoded.Cases[0].Input, "hello")
	}
	if decoded.Cases[0].ExpectedOutput != "hello" {
		t.Errorf("cases[0].expected_output: got %q, want %q", decoded.Cases[0].ExpectedOutput, "hello")
	}
	if decoded.Cases[0].MatchType != "exact" {
		t.Errorf("cases[0].match_type: got %q, want %q", decoded.Cases[0].MatchType, "exact")
	}
	if decoded.Cases[0].RandomSeed == nil || *decoded.Cases[0].RandomSeed != 42 {
		t.Errorf("cases[0].random_seed: got %v", decoded.Cases[0].RandomSeed)
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

	for _, field := range []string{"timeout_ms", "cases", "language"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}
}

// ---------------------------------------------------------------------------
// ExecuteResponse
// ---------------------------------------------------------------------------

func TestExecuteResponse_JSON(t *testing.T) {
	resp := ExecuteResponse{
		Results: []CaseResult{
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
		Summary: CaseSummary{
			Total:  2,
			Passed: 1,
			Failed: 1,
			Errors: 0,
			TimeMs: 20,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteResponse
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

func TestExecuteResponse_OmitsEmptyFields(t *testing.T) {
	resp := ExecuteResponse{
		Results: []CaseResult{},
		Summary: CaseSummary{Total: 0},
	}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Verify required fields are present
	for _, field := range []string{"results", "summary"} {
		if _, ok := raw[field]; !ok {
			t.Errorf("expected field %q to be present, but it was missing", field)
		}
	}
}

// ---------------------------------------------------------------------------
// CaseDef
// ---------------------------------------------------------------------------

func TestCaseDef_OptionalExpectedOutput(t *testing.T) {
	// ExpectedOutput is optional (run-only case — no expected output means "just run")
	def := CaseDef{
		Name:      "run-only",
		Type:      "io",
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

	var decoded CaseDef
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.ExpectedOutput != "" {
		t.Errorf("expected empty ExpectedOutput, got %q", decoded.ExpectedOutput)
	}
}

func TestCaseDef_RandomSeedOmittedWhenNil(t *testing.T) {
	def := CaseDef{
		Name:  "no-seed",
		Type:  "io",
		Input: "5",
	}
	data, err := json.Marshal(def)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := raw["random_seed"]; ok {
		t.Errorf("expected random_seed to be omitted when nil")
	}
}

// ---------------------------------------------------------------------------
// CaseResult
// ---------------------------------------------------------------------------

func TestCaseResult_OmitsEmptyFields(t *testing.T) {
	result := CaseResult{
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
