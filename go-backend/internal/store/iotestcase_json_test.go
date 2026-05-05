package store

import (
	"encoding/json"
	"testing"
)

// TestIOTestCaseIO_RoundTrip verifies that IOTestCaseIO marshals and unmarshals symmetrically.
//
// Contract: Marshal(IOTestCaseIO) → bytes → Unmarshal → identical struct.
// Catches: custom marshal/unmarshal asymmetry that would silently corrupt test case data.
func TestIOTestCaseIO_RoundTrip(t *testing.T) {
	seed := 42
	original := &IOTestCaseIO{
		Name:           "test1",
		Input:          "hello stdin",
		ExpectedOutput: "hello output",
		MatchType:      "exact",
		RandomSeed:     &seed,
		AttachedFiles:  []File{{Name: "data.txt", Content: "contents"}},
		Order:          3,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Unmarshal as IOTestCase interface.
	got, err := UnmarshalIOTestCase(data)
	if err != nil {
		t.Fatalf("UnmarshalIOTestCase failed: %v", err)
	}

	io, ok := got.(*IOTestCaseIO)
	if !ok {
		t.Fatalf("expected *IOTestCaseIO, got %T", got)
	}

	if io.Name != original.Name {
		t.Errorf("Name: got %q, want %q", io.Name, original.Name)
	}
	if io.Input != original.Input {
		t.Errorf("Input: got %q, want %q", io.Input, original.Input)
	}
	if io.ExpectedOutput != original.ExpectedOutput {
		t.Errorf("ExpectedOutput: got %q, want %q", io.ExpectedOutput, original.ExpectedOutput)
	}
	if io.MatchType != original.MatchType {
		t.Errorf("MatchType: got %q, want %q", io.MatchType, original.MatchType)
	}
	if io.RandomSeed == nil || *io.RandomSeed != seed {
		t.Errorf("RandomSeed: got %v, want %d", io.RandomSeed, seed)
	}
	if len(io.AttachedFiles) != 1 || io.AttachedFiles[0].Name != "data.txt" {
		t.Errorf("AttachedFiles: got %v, want [{data.txt contents}]", io.AttachedFiles)
	}
	if io.Order != original.Order {
		t.Errorf("Order: got %d, want %d", io.Order, original.Order)
	}
	if io.Kind() != "io" {
		t.Errorf("Kind: got %q, want %q", io.Kind(), "io")
	}
}

// TestIOTestCasePytest_RoundTrip verifies that IOTestCasePytest marshals and unmarshals symmetrically.
//
// Contract: Marshal(IOTestCasePytest) → bytes → Unmarshal → identical struct.
// Catches: pytest variant not registered in kind dispatch, or field mapping errors.
func TestIOTestCasePytest_RoundTrip(t *testing.T) {
	original := &IOTestCasePytest{
		Name:       "pytest-case-1",
		TargetPath: "tests/test_foo.py::test_bar",
		TestCode:   "def test_bar():\n    assert True",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	got, err := UnmarshalIOTestCase(data)
	if err != nil {
		t.Fatalf("UnmarshalIOTestCase failed: %v", err)
	}

	pytest, ok := got.(*IOTestCasePytest)
	if !ok {
		t.Fatalf("expected *IOTestCasePytest, got %T", got)
	}

	if pytest.Name != original.Name {
		t.Errorf("Name: got %q, want %q", pytest.Name, original.Name)
	}
	if pytest.TargetPath != original.TargetPath {
		t.Errorf("TargetPath: got %q, want %q", pytest.TargetPath, original.TargetPath)
	}
	if pytest.TestCode != original.TestCode {
		t.Errorf("TestCode: got %q, want %q", pytest.TestCode, original.TestCode)
	}
	if pytest.Kind() != "pytest" {
		t.Errorf("Kind: got %q, want %q", pytest.Kind(), "pytest")
	}
}

// TestIOTestCase_UnmarshalRejectsNoKind verifies that unmarshaling a test case with no
// "kind" field returns an error.
//
// Contract: post-migration, every JSONB row must have an explicit kind. Silently accepting
// untagged rows would re-introduce the flat-struct ambiguity we're eliminating.
func TestIOTestCase_UnmarshalRejectsNoKind(t *testing.T) {
	noKindJSON := `{"name":"test","input":"stdin","match_type":"exact","order":0}`
	_, err := UnmarshalIOTestCase([]byte(noKindJSON))
	if err == nil {
		t.Fatal("expected error for JSON with no kind field, got nil")
	}
}

// TestIOTestCase_UnmarshalRejectsUnknownKind verifies that an unknown kind value returns an error.
func TestIOTestCase_UnmarshalRejectsUnknownKind(t *testing.T) {
	unknownKindJSON := `{"kind":"junit","name":"test"}`
	_, err := UnmarshalIOTestCase([]byte(unknownKindJSON))
	if err == nil {
		t.Fatal("expected error for unknown kind 'junit', got nil")
	}
}

// TestIOTestCase_UnmarshalRejectsMixedFields verifies that a JSON object tagged
// kind='io' but containing pytest-specific fields is rejected (strict mode).
//
// Contract: kind/fields mismatch must not silently produce invalid state.
// Reject-not-ignore matches the no-optional-fields preference.
func TestIOTestCase_UnmarshalRejectsMixedFields(t *testing.T) {
	// kind=io with pytest fields (target_path, test_code) — reject
	mixedJSON := `{"kind":"io","name":"test","input":"stdin","match_type":"exact","order":0,"target_path":"tests/test.py","test_code":"def test(): pass"}`
	_, err := UnmarshalIOTestCase([]byte(mixedJSON))
	if err == nil {
		t.Fatal("expected error for kind=io with pytest fields, got nil")
	}
}

// TestUnmarshalIOTestCases verifies the plural slice helper handles mixed arrays.
func TestUnmarshalIOTestCases(t *testing.T) {
	seed := 7
	ioCase := &IOTestCaseIO{
		Name:      "io-case",
		Input:     "input",
		MatchType: "exact",
		Order:     0,
		RandomSeed: &seed,
	}
	pytestCase := &IOTestCasePytest{
		Name:       "pytest-case",
		TargetPath: "tests/test_x.py::test_y",
		TestCode:   "def test_y(): pass",
	}

	ioData, _ := json.Marshal(ioCase)
	pytestData, _ := json.Marshal(pytestCase)
	arrayJSON := append(append([]byte("["), append(ioData, append([]byte(","), pytestData...)...)...), ']')

	cases, err := UnmarshalIOTestCases(arrayJSON)
	if err != nil {
		t.Fatalf("UnmarshalIOTestCases failed: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("expected 2 cases, got %d", len(cases))
	}
	if cases[0].Kind() != "io" {
		t.Errorf("cases[0].Kind(): got %q, want %q", cases[0].Kind(), "io")
	}
	if cases[1].Kind() != "pytest" {
		t.Errorf("cases[1].Kind(): got %q, want %q", cases[1].Kind(), "pytest")
	}
}

// TestMarshalIOTestCases verifies the plural slice marshal helper.
func TestMarshalIOTestCases(t *testing.T) {
	cases := []IOTestCase{
		&IOTestCaseIO{Name: "io1", Input: "x", MatchType: "exact", Order: 0},
		&IOTestCasePytest{Name: "pytest1", TargetPath: "t.py::f", TestCode: "def f(): pass"},
	}

	data, err := MarshalIOTestCases(cases)
	if err != nil {
		t.Fatalf("MarshalIOTestCases failed: %v", err)
	}

	// Round-trip
	roundTripped, err := UnmarshalIOTestCases(data)
	if err != nil {
		t.Fatalf("UnmarshalIOTestCases after marshal failed: %v", err)
	}
	if len(roundTripped) != 2 {
		t.Fatalf("expected 2 cases after round-trip, got %d", len(roundTripped))
	}
}
