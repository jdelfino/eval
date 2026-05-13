package store

import (
	"encoding/json"
	"fmt"
)

// IOTestCase is the discriminated union interface for test cases stored as JSONB.
//
// The "kind" field determines the concrete type:
//   - "io"     → *IOTestCaseIO     (stdin/stdout matching)
//   - "pytest" → *IOTestCasePytest (pytest-based testing)
//
// Use UnmarshalIOTestCase to deserialize from JSON, and json.Marshal on the
// concrete type to serialize. The concrete types embed the kind field in their
// MarshalJSON output.
type IOTestCase interface {
	// Kind returns the discriminator value ("io" or "pytest").
	Kind() string

	iotestcase() // unexported marker; prevents external implementations
}

// IOTestCaseIO is the I/O test case variant.
// It matches a program's stdout against an expected output string.
type IOTestCaseIO struct {
	Name           string  `json:"name"`
	Input          string  `json:"input"`
	ExpectedOutput string  `json:"expected_output,omitempty"`
	MatchType      string  `json:"match_type"`
	RandomSeed     *int    `json:"random_seed,omitempty"`
	AttachedFiles  []File  `json:"attached_files,omitempty"`
	Order          int     `json:"order"`
}

// Kind implements IOTestCase.
func (c *IOTestCaseIO) Kind() string { return "io" }

// iotestcase implements IOTestCase marker.
func (c *IOTestCaseIO) iotestcase() {}

// MarshalJSON injects the "kind" discriminator field.
func (c *IOTestCaseIO) MarshalJSON() ([]byte, error) {
	type Alias IOTestCaseIO
	return json.Marshal(&struct {
		Kind string `json:"kind"`
		*Alias
	}{
		Kind:  "io",
		Alias: (*Alias)(c),
	})
}

// IOTestCasePytest is the pytest test case variant.
// It runs a pytest test file against the student's submitted code.
type IOTestCasePytest struct {
	Name       string `json:"name,omitempty"`
	TargetPath string `json:"target_path"`
	TestCode   string `json:"test_code"`
}

// Kind implements IOTestCase.
func (c *IOTestCasePytest) Kind() string { return "pytest" }

// iotestcase implements IOTestCase marker.
func (c *IOTestCasePytest) iotestcase() {}

// MarshalJSON injects the "kind" discriminator field.
func (c *IOTestCasePytest) MarshalJSON() ([]byte, error) {
	type Alias IOTestCasePytest
	return json.Marshal(&struct {
		Kind string `json:"kind"`
		*Alias
	}{
		Kind:  "pytest",
		Alias: (*Alias)(c),
	})
}

// ioWireFields are the known fields for kind=io. Used to detect mixed-kind objects.
var ioWireFields = map[string]struct{}{
	"kind": {}, "name": {}, "input": {}, "expected_output": {},
	"match_type": {}, "random_seed": {}, "attached_files": {}, "order": {},
}

// pytestWireFields are the known fields for kind=pytest.
var pytestWireFields = map[string]struct{}{
	"kind": {}, "name": {}, "target_path": {}, "test_code": {},
}

// UnmarshalIOTestCase deserializes a single IOTestCase from JSON.
//
// It reads the "kind" discriminator field, dispatches to the correct
// concrete type, and rejects:
//   - JSON with no "kind" field (error: all rows must be tagged post-migration)
//   - JSON with an unknown kind value
//   - JSON tagged kind=io but containing pytest-specific fields (strict mode)
//   - JSON tagged kind=pytest but containing io-specific fields (strict mode)
func UnmarshalIOTestCase(data []byte) (IOTestCase, error) {
	// First pass: extract the kind discriminator.
	var envelope struct {
		Kind *string `json:"kind"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("IOTestCase: unmarshal envelope: %w", err)
	}
	if envelope.Kind == nil {
		return nil, fmt.Errorf("IOTestCase: missing required field \"kind\" — all rows must be tagged post-migration 021")
	}

	// Second pass: validate field set matches the declared kind (strict mode).
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("IOTestCase: unmarshal fields: %w", err)
	}

	switch *envelope.Kind {
	case "io":
		// Reject any pytest-specific fields present in an io-tagged object.
		for field := range raw {
			if _, isIO := ioWireFields[field]; !isIO {
				return nil, fmt.Errorf("IOTestCase: kind=%q contains unknown field %q (possible kind/field mismatch)", *envelope.Kind, field)
			}
		}
		var tc IOTestCaseIO
		if err := json.Unmarshal(data, &tc); err != nil {
			return nil, fmt.Errorf("IOTestCase: unmarshal io: %w", err)
		}
		return &tc, nil

	case "pytest":
		// Reject any io-specific fields present in a pytest-tagged object.
		for field := range raw {
			if _, isPytest := pytestWireFields[field]; !isPytest {
				return nil, fmt.Errorf("IOTestCase: kind=%q contains unknown field %q (possible kind/field mismatch)", *envelope.Kind, field)
			}
		}
		var tc IOTestCasePytest
		if err := json.Unmarshal(data, &tc); err != nil {
			return nil, fmt.Errorf("IOTestCase: unmarshal pytest: %w", err)
		}
		return &tc, nil

	default:
		return nil, fmt.Errorf("IOTestCase: unknown kind %q", *envelope.Kind)
	}
}

// UnmarshalIOTestCases deserializes a JSONB array of IOTestCase objects.
// Each element is dispatched by its kind discriminator.
func UnmarshalIOTestCases(data []byte) ([]IOTestCase, error) {
	var raws []json.RawMessage
	if err := json.Unmarshal(data, &raws); err != nil {
		return nil, fmt.Errorf("IOTestCases: unmarshal array: %w", err)
	}
	cases := make([]IOTestCase, len(raws))
	for i, raw := range raws {
		tc, err := UnmarshalIOTestCase(raw)
		if err != nil {
			return nil, fmt.Errorf("IOTestCases[%d]: %w", i, err)
		}
		cases[i] = tc
	}
	return cases, nil
}

// MarshalIOTestCases serializes a slice of IOTestCase to a JSONB array.
func MarshalIOTestCases(cases []IOTestCase) ([]byte, error) {
	out := make([]interface{}, len(cases))
	for i, c := range cases {
		out[i] = c
	}
	return json.Marshal(out)
}
