package store

import (
	"encoding/json"
	"fmt"
)

// CaseResult is the discriminated union interface for case execution results.
//
// The "kind" field determines the concrete type:
//   - "io"     → *CaseResultIO     (stdout/stderr/exit_code/match result)
//   - "pytest" → *CaseResultPytest (per-assertion pytest results)
//
// Use UnmarshalCaseResult to deserialize from JSON. The concrete types embed
// the kind field in their MarshalJSON output.
type CaseResult interface {
	// Kind returns the discriminator value ("io" or "pytest").
	Kind() string
	// Name returns the case name (common across kinds).
	Name() string
	// Passed returns whether this case passed overall.
	Passed() bool
	// DurationMs returns the wall-clock time in milliseconds.
	DurationMs() int

	caseresult() // unexported marker; prevents external implementations
}

// PytestAssertion represents the outcome of a single pytest test function (or
// a single parametrize combination) within a pytest case.
type PytestAssertion struct {
	Name           string `json:"name"`
	Passed         bool   `json:"passed"`
	FailureMessage string `json:"failure_message,omitempty"`
	Traceback      string `json:"traceback,omitempty"`
}

// CaseResultIO is the I/O case result variant.
// It carries stdout, stderr, exit_code, and match assertion fields.
type CaseResultIO struct {
	name           string
	passed         bool
	durationMs     int
	stdout         string
	stderr         string
	exitCode       int
	expectedOutput string
	matchPassed    bool
	input          string
	status         string // "passed" | "failed" | "error" | "run"
}

// Kind implements CaseResult.
func (r *CaseResultIO) Kind() string { return "io" }

// Name implements CaseResult.
func (r *CaseResultIO) Name() string { return r.name }

// Passed implements CaseResult.
func (r *CaseResultIO) Passed() bool { return r.passed }

// DurationMs implements CaseResult.
func (r *CaseResultIO) DurationMs() int { return r.durationMs }

// caseresult implements CaseResult marker.
func (r *CaseResultIO) caseresult() {}

// Status returns the execution status string ("passed", "failed", "error", "run").
func (r *CaseResultIO) Status() string { return r.status }

// Stdout returns the captured stdout output.
func (r *CaseResultIO) Stdout() string { return r.stdout }

// Stderr returns the captured stderr output.
func (r *CaseResultIO) Stderr() string { return r.stderr }

// Input returns the stdin that was sent.
func (r *CaseResultIO) Input() string { return r.input }

// Expected returns the expected output.
func (r *CaseResultIO) Expected() string { return r.expectedOutput }

// caseResultIOJSON is the JSON wire shape for CaseResultIO.
type caseResultIOJSON struct {
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Input    string `json:"input,omitempty"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	TimeMs   int64  `json:"time_ms"`
}

// MarshalJSON encodes CaseResultIO to JSON with the "kind" discriminator.
func (r *CaseResultIO) MarshalJSON() ([]byte, error) {
	return json.Marshal(&caseResultIOJSON{
		Kind:     "io",
		Name:     r.name,
		Status:   r.status,
		Input:    r.input,
		Expected: r.expectedOutput,
		Actual:   r.stdout,
		Stderr:   r.stderr,
		TimeMs:   int64(r.durationMs),
	})
}

// UnmarshalJSON decodes CaseResultIO from JSON.
func (r *CaseResultIO) UnmarshalJSON(data []byte) error {
	var wire caseResultIOJSON
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	r.name = wire.Name
	r.status = wire.Status
	r.input = wire.Input
	r.expectedOutput = wire.Expected
	r.stdout = wire.Actual
	r.stderr = wire.Stderr
	r.durationMs = int(wire.TimeMs)
	r.passed = wire.Status == "passed"
	return nil
}

// CaseResultPytest is the pytest case result variant.
// It carries per-assertion results and optional stderr for collection errors.
type CaseResultPytest struct {
	name       string
	passed     bool
	durationMs int
	stderr     string
	assertions []PytestAssertion
}

// Kind implements CaseResult.
func (r *CaseResultPytest) Kind() string { return "pytest" }

// Name implements CaseResult.
func (r *CaseResultPytest) Name() string { return r.name }

// Passed implements CaseResult.
func (r *CaseResultPytest) Passed() bool { return r.passed }

// DurationMs implements CaseResult.
func (r *CaseResultPytest) DurationMs() int { return r.durationMs }

// caseresult implements CaseResult marker.
func (r *CaseResultPytest) caseresult() {}

// Stderr returns the stderr output (populated on collection errors or import errors).
func (r *CaseResultPytest) Stderr() string { return r.stderr }

// Assertions returns the per-test-function assertion results.
func (r *CaseResultPytest) Assertions() []PytestAssertion { return r.assertions }

// caseResultPytestJSON is the JSON wire shape for CaseResultPytest.
type caseResultPytestJSON struct {
	Kind       string            `json:"kind"`
	Name       string            `json:"name"`
	Passed     bool              `json:"passed"`
	DurationMs int               `json:"duration_ms"`
	Assertions []PytestAssertion `json:"assertions"`
	Stderr     string            `json:"stderr,omitempty"`
}

// MarshalJSON encodes CaseResultPytest to JSON with the "kind" discriminator.
func (r *CaseResultPytest) MarshalJSON() ([]byte, error) {
	assertions := r.assertions
	if assertions == nil {
		assertions = []PytestAssertion{}
	}
	return json.Marshal(&caseResultPytestJSON{
		Kind:       "pytest",
		Name:       r.name,
		Passed:     r.passed,
		DurationMs: r.durationMs,
		Assertions: assertions,
		Stderr:     r.stderr,
	})
}

// UnmarshalJSON decodes CaseResultPytest from JSON.
func (r *CaseResultPytest) UnmarshalJSON(data []byte) error {
	var wire caseResultPytestJSON
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	r.name = wire.Name
	r.passed = wire.Passed
	r.durationMs = wire.DurationMs
	r.stderr = wire.Stderr
	r.assertions = wire.Assertions
	return nil
}

// NewCaseResultIO constructs a CaseResultIO from its component fields.
// Used by the handler layer to create typed results from executor responses.
func NewCaseResultIO(name string, passed bool, durationMs int, stdout, stderr string, exitCode int, expectedOutput string, matchPassed bool, input, status string) *CaseResultIO {
	return &CaseResultIO{
		name:           name,
		passed:         passed,
		durationMs:     durationMs,
		stdout:         stdout,
		stderr:         stderr,
		exitCode:       exitCode,
		expectedOutput: expectedOutput,
		matchPassed:    matchPassed,
		input:          input,
		status:         status,
	}
}

// NewCaseResultPytest constructs a CaseResultPytest from its component fields.
// Used by the handler layer to create typed results from executor pytest responses.
func NewCaseResultPytest(name string, passed bool, durationMs int, stderr string, assertions []PytestAssertion) *CaseResultPytest {
	return &CaseResultPytest{
		name:       name,
		passed:     passed,
		durationMs: durationMs,
		stderr:     stderr,
		assertions: assertions,
	}
}

// UnmarshalCaseResult deserializes a single CaseResult from JSON.
//
// It reads the "kind" discriminator field, dispatches to the correct concrete type,
// and rejects:
//   - JSON with no "kind" field
//   - JSON with an unknown kind value
func UnmarshalCaseResult(data []byte) (CaseResult, error) {
	var envelope struct {
		Kind *string `json:"kind"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("CaseResult: unmarshal envelope: %w", err)
	}
	if envelope.Kind == nil {
		return nil, fmt.Errorf("CaseResult: missing required field \"kind\"")
	}

	switch *envelope.Kind {
	case "io":
		var cr CaseResultIO
		if err := json.Unmarshal(data, &cr); err != nil {
			return nil, fmt.Errorf("CaseResult: unmarshal io: %w", err)
		}
		return &cr, nil

	case "pytest":
		var cr CaseResultPytest
		if err := json.Unmarshal(data, &cr); err != nil {
			return nil, fmt.Errorf("CaseResult: unmarshal pytest: %w", err)
		}
		return &cr, nil

	default:
		return nil, fmt.Errorf("CaseResult: unknown kind %q", *envelope.Kind)
	}
}

// UnmarshalCaseResults deserializes a JSON array of CaseResult objects.
func UnmarshalCaseResults(data []byte) ([]CaseResult, error) {
	var raws []json.RawMessage
	if err := json.Unmarshal(data, &raws); err != nil {
		return nil, fmt.Errorf("CaseResults: unmarshal array: %w", err)
	}
	results := make([]CaseResult, len(raws))
	for i, raw := range raws {
		cr, err := UnmarshalCaseResult(raw)
		if err != nil {
			return nil, fmt.Errorf("CaseResults[%d]: %w", i, err)
		}
		results[i] = cr
	}
	return results, nil
}
