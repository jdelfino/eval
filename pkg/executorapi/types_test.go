package executorapi

import (
	"encoding/json"
	"testing"
)

func TestExecuteRequest_JSON(t *testing.T) {
	timeout := 5000
	req := ExecuteRequest{
		Code:      "print('hello')",
		Language:  "python",
		TimeoutMs: &timeout,
		Cases: []CaseDef{
			{Name: "run", Type: "io", Input: "hello"},
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
	if len(decoded.Cases) != 1 || decoded.Cases[0].Name != "run" {
		t.Errorf("cases: got %+v", decoded.Cases)
	}
	if decoded.TimeoutMs == nil || *decoded.TimeoutMs != 5000 {
		t.Errorf("timeout_ms: got %v", decoded.TimeoutMs)
	}
}

func TestExecuteRequest_OmitsEmptyFields(t *testing.T) {
	req := ExecuteRequest{Code: "x=1", Language: "python", Cases: []CaseDef{{Name: "run", Type: "io"}}}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"timeout_ms"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}
}

func TestExecuteResponse_JSON(t *testing.T) {
	resp := ExecuteResponse{
		Results: []CaseResult{
			{Name: "run", Type: "io", Status: "passed", TimeMs: 42},
		},
		Summary: CaseSummary{Total: 1, Passed: 1, TimeMs: 42},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(decoded.Results) != 1 {
		t.Fatalf("results: got %d, want 1", len(decoded.Results))
	}
	if decoded.Results[0].Status != "passed" {
		t.Errorf("status: got %q, want 'passed'", decoded.Results[0].Status)
	}
	if decoded.Summary.Total != 1 {
		t.Errorf("summary.total: got %d, want 1", decoded.Summary.Total)
	}
}

// TestPytestCaseResult_JSON verifies that PytestCaseResult round-trips through JSON
// with all fields preserved, including nested PytestAssertion entries.
//
// Contract: the pytest case result wire format must be stable. F2.3 deserializes
// this shape from the executor response — any field name drift causes silent data loss.
func TestPytestCaseResult_JSON(t *testing.T) {
	result := PytestCaseResult{
		Kind:       "pytest",
		Name:       "test_add",
		Passed:     false,
		DurationMs: 123,
		Assertions: []PytestAssertion{
			{
				Name:           "test_add",
				Passed:         false,
				FailureMessage: "AssertionError: assert 5 == 6",
				Traceback:      "  File test_add.py line 4\n    assert add(2,3) == 6",
			},
		},
		Stderr: "",
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded PytestCaseResult
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Kind != "pytest" {
		t.Errorf("kind: got %q, want 'pytest'", decoded.Kind)
	}
	if decoded.Name != "test_add" {
		t.Errorf("name: got %q, want 'test_add'", decoded.Name)
	}
	if decoded.Passed {
		t.Errorf("passed: got true, want false")
	}
	if decoded.DurationMs != 123 {
		t.Errorf("duration_ms: got %d, want 123", decoded.DurationMs)
	}
	if len(decoded.Assertions) != 1 {
		t.Fatalf("assertions: got %d, want 1", len(decoded.Assertions))
	}
	a := decoded.Assertions[0]
	if a.Name != "test_add" {
		t.Errorf("assertion.name: got %q, want 'test_add'", a.Name)
	}
	if a.Passed {
		t.Errorf("assertion.passed: got true, want false")
	}
	if a.FailureMessage != "AssertionError: assert 5 == 6" {
		t.Errorf("assertion.failure_message: got %q", a.FailureMessage)
	}
	if a.Traceback == "" {
		t.Errorf("assertion.traceback: expected non-empty")
	}
}

// TestCaseDef_PytestKind verifies that a pytest CaseDef with Kind, TestCode, and
// TargetPath fields round-trips correctly through JSON.
//
// Contract: F2.3's handler reads Kind to dispatch cases. If Kind is lost in JSON
// round-trip, all pytest cases fall through to the io runner silently.
func TestCaseDef_PytestKind(t *testing.T) {
	def := CaseDef{
		Name:       "test_add",
		Kind:       "pytest",
		TestCode:   "from student_module import add\ndef test_add(): assert add(1,2)==3",
		TargetPath: "tests/test_add.py",
	}

	data, err := json.Marshal(def)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded CaseDef
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Kind != "pytest" {
		t.Errorf("kind: got %q, want 'pytest'", decoded.Kind)
	}
	if decoded.TestCode == "" {
		t.Errorf("test_code: expected non-empty, got empty")
	}
	if decoded.TargetPath != "tests/test_add.py" {
		t.Errorf("target_path: got %q, want 'tests/test_add.py'", decoded.TargetPath)
	}
}
