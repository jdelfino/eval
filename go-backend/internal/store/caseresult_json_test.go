package store

import (
	"encoding/json"
	"testing"
)

// TestCaseResultIO_RoundTrip verifies that CaseResultIO marshals and unmarshals symmetrically.
//
// Contract: Marshal(CaseResultIO) → bytes → Unmarshal → identical struct.
// Catches: custom marshal/unmarshal asymmetry that would silently corrupt execution results.
func TestCaseResultIO_RoundTrip(t *testing.T) {
	original := &CaseResultIO{
		name:           "test-case",
		passed:         true,
		durationMs:     42,
		stdout:         "hello\n",
		stderr:         "",
		exitCode:       0,
		expectedOutput: "hello\n",
		matchPassed:    true,
		input:          "stdin data",
		status:         "passed",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got, err := UnmarshalCaseResult(data)
	if err != nil {
		t.Fatalf("UnmarshalCaseResult failed: %v", err)
	}

	cr, ok := got.(*CaseResultIO)
	if !ok {
		t.Fatalf("expected *CaseResultIO, got %T", got)
	}

	if cr.Kind() != "io" {
		t.Errorf("Kind: got %q, want %q", cr.Kind(), "io")
	}
	if cr.Name() != original.name {
		t.Errorf("Name: got %q, want %q", cr.Name(), original.name)
	}
	if cr.Passed() != original.passed {
		t.Errorf("Passed: got %v, want %v", cr.Passed(), original.passed)
	}
	if cr.DurationMs() != original.durationMs {
		t.Errorf("DurationMs: got %d, want %d", cr.DurationMs(), original.durationMs)
	}
	if cr.stdout != original.stdout {
		t.Errorf("stdout: got %q, want %q", cr.stdout, original.stdout)
	}
	if cr.expectedOutput != original.expectedOutput {
		t.Errorf("expectedOutput: got %q, want %q", cr.expectedOutput, original.expectedOutput)
	}
	if cr.input != original.input {
		t.Errorf("input: got %q, want %q", cr.input, original.input)
	}
	if cr.status != original.status {
		t.Errorf("status: got %q, want %q", cr.status, original.status)
	}
}

// TestCaseResultPytest_RoundTrip verifies that CaseResultPytest marshals and unmarshals symmetrically.
//
// Contract: Marshal(CaseResultPytest) → bytes → Unmarshal → identical struct.
// Catches: pytest variant not registered in dispatch or field mapping errors.
func TestCaseResultPytest_RoundTrip(t *testing.T) {
	original := &CaseResultPytest{
		name:       "pytest-case",
		passed:     false,
		durationMs: 123,
		stderr:     "collection error",
		assertions: []PytestAssertion{
			{
				Name:           "test_add",
				Passed:         false,
				FailureMessage: "AssertionError: 5 != 6",
				Traceback:      "Traceback ...",
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got, err := UnmarshalCaseResult(data)
	if err != nil {
		t.Fatalf("UnmarshalCaseResult failed: %v", err)
	}

	cr, ok := got.(*CaseResultPytest)
	if !ok {
		t.Fatalf("expected *CaseResultPytest, got %T", got)
	}

	if cr.Kind() != "pytest" {
		t.Errorf("Kind: got %q, want %q", cr.Kind(), "pytest")
	}
	if cr.Name() != original.name {
		t.Errorf("Name: got %q, want %q", cr.Name(), original.name)
	}
	if cr.Passed() != original.passed {
		t.Errorf("Passed: got %v, want %v", cr.Passed(), original.passed)
	}
	if cr.DurationMs() != original.durationMs {
		t.Errorf("DurationMs: got %d, want %d", cr.DurationMs(), original.durationMs)
	}
	if cr.stderr != original.stderr {
		t.Errorf("stderr: got %q, want %q", cr.stderr, original.stderr)
	}
	if len(cr.assertions) != 1 {
		t.Fatalf("expected 1 assertion, got %d", len(cr.assertions))
	}
	a := cr.assertions[0]
	if a.Name != "test_add" {
		t.Errorf("assertion.Name: got %q, want %q", a.Name, "test_add")
	}
	if a.Passed {
		t.Errorf("assertion.Passed: got true, want false")
	}
	if a.FailureMessage != "AssertionError: 5 != 6" {
		t.Errorf("assertion.FailureMessage: got %q, want %q", a.FailureMessage, "AssertionError: 5 != 6")
	}
}

// TestCaseResult_UnmarshalRejectsNoKind verifies that JSON without a "kind" field returns an error.
//
// Contract: every result must be tagged with a kind discriminator.
func TestCaseResult_UnmarshalRejectsNoKind(t *testing.T) {
	noKindJSON := `{"name":"test","status":"passed","time_ms":10}`
	_, err := UnmarshalCaseResult([]byte(noKindJSON))
	if err == nil {
		t.Fatal("expected error for JSON with no kind field, got nil")
	}
}

// TestCaseResult_UnmarshalRejectsUnknownKind verifies that an unknown kind value returns an error.
func TestCaseResult_UnmarshalRejectsUnknownKind(t *testing.T) {
	unknownKindJSON := `{"kind":"junit","name":"test"}`
	_, err := UnmarshalCaseResult([]byte(unknownKindJSON))
	if err == nil {
		t.Fatal("expected error for unknown kind 'junit', got nil")
	}
}

// TestCaseResultIO_JSONContainsKind verifies that marshaling a CaseResultIO includes "kind" in the JSON output.
//
// Contract: the kind field must be present in the wire format so consumers can discriminate.
// Catches: handler emitting un-tagged results (test case #7 from the issue).
func TestCaseResultIO_JSONContainsKind(t *testing.T) {
	cr := &CaseResultIO{
		name:   "test",
		passed: true,
		status: "passed",
	}

	data, err := json.Marshal(cr)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}

	kindVal, ok := raw["kind"]
	if !ok {
		t.Fatal("expected 'kind' field in CaseResultIO JSON output")
	}

	var kind string
	if err := json.Unmarshal(kindVal, &kind); err != nil {
		t.Fatalf("unmarshal kind: %v", err)
	}
	if kind != "io" {
		t.Errorf("expected kind='io', got %q", kind)
	}
}

// TestCaseResultPytest_JSONContainsKind verifies that marshaling a CaseResultPytest includes "kind" in JSON output.
func TestCaseResultPytest_JSONContainsKind(t *testing.T) {
	cr := &CaseResultPytest{
		name:   "pytest-test",
		passed: true,
	}

	data, err := json.Marshal(cr)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}

	kindVal, ok := raw["kind"]
	if !ok {
		t.Fatal("expected 'kind' field in CaseResultPytest JSON output")
	}

	var kind string
	if err := json.Unmarshal(kindVal, &kind); err != nil {
		t.Fatalf("unmarshal kind: %v", err)
	}
	if kind != "pytest" {
		t.Errorf("expected kind='pytest', got %q", kind)
	}
}

// TestCaseResultIO_InterfaceMethods verifies the interface contract for CaseResultIO.
func TestCaseResultIO_InterfaceMethods(t *testing.T) {
	cr := &CaseResultIO{
		name:       "io-case",
		passed:     true,
		durationMs: 55,
	}

	var iface CaseResult = cr
	if iface.Kind() != "io" {
		t.Errorf("Kind: got %q, want io", iface.Kind())
	}
	if iface.Name() != "io-case" {
		t.Errorf("Name: got %q, want io-case", iface.Name())
	}
	if !iface.Passed() {
		t.Error("Passed: expected true")
	}
	if iface.DurationMs() != 55 {
		t.Errorf("DurationMs: got %d, want 55", iface.DurationMs())
	}
}

// TestCaseResultPytest_InterfaceMethods verifies the interface contract for CaseResultPytest.
func TestCaseResultPytest_InterfaceMethods(t *testing.T) {
	cr := &CaseResultPytest{
		name:       "pytest-case",
		passed:     false,
		durationMs: 99,
	}

	var iface CaseResult = cr
	if iface.Kind() != "pytest" {
		t.Errorf("Kind: got %q, want pytest", iface.Kind())
	}
	if iface.Name() != "pytest-case" {
		t.Errorf("Name: got %q, want pytest-case", iface.Name())
	}
	if iface.Passed() {
		t.Error("Passed: expected false")
	}
	if iface.DurationMs() != 99 {
		t.Errorf("DurationMs: got %d, want 99", iface.DurationMs())
	}
}
