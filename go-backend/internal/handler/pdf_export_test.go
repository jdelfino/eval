package handler

import (
	"encoding/json"
	"testing"
	"time"
)

// TestRenderProblemsPDF_PopulatedProblems verifies that renderProblemsPDF returns
// valid PDF bytes for problems with all fields set. This is the happy path - it
// ensures the renderer can process fully populated problems and produce a valid
// PDF document with the magic header %PDF-.
func TestRenderProblemsPDF_PopulatedProblems(t *testing.T) {
	// Build test problems with all fields populated
	desc1 := "Write a function that adds two numbers"
	starterCode1 := "def add(a, b):\n    pass"
	solution1 := "def add(a, b):\n    return a + b"
	testCases1 := json.RawMessage(`[{"name":"t1","input":"1 2","expected_output":"3","match_type":"exact"}]`)

	desc2 := "Write a function that multiplies two numbers"
	starterCode2 := "def multiply(a, b):\n    pass"
	solution2 := "def multiply(a, b):\n    return a * b"
	testCases2 := json.RawMessage(`[{"name":"t1","input":"3 4","expected_output":"12","match_type":"exact"}]`)

	problems := []ExportProblem{
		{
			Title:       "Add Two Numbers",
			Description: &desc1,
			StarterCode: &starterCode1,
			TestCases:   testCases1,
			Tags:        []string{"math", "easy"},
			Solution:    &solution1,
			Language:    "python",
			CreatedAt:   time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC),
		},
		{
			Title:       "Multiply Two Numbers",
			Description: &desc2,
			StarterCode: &starterCode2,
			TestCases:   testCases2,
			Tags:        []string{"math", "medium"},
			Solution:    &solution2,
			Language:    "python",
			CreatedAt:   time.Date(2024, 1, 3, 0, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2024, 1, 4, 0, 0, 0, 0, time.UTC),
		},
	}

	exportedAt := time.Date(2024, 1, 10, 12, 0, 0, 0, time.UTC)
	pdfBytes, err := renderProblemsPDF(problems, exportedAt)

	if err != nil {
		t.Fatalf("renderProblemsPDF returned error: %v", err)
	}

	if len(pdfBytes) == 0 {
		t.Fatal("renderProblemsPDF returned empty bytes")
	}

	// Check for PDF magic header: %PDF-
	expectedHeader := []byte{0x25, 0x50, 0x44, 0x46, 0x2D}
	if len(pdfBytes) < len(expectedHeader) {
		t.Fatalf("PDF bytes too short: got %d bytes, need at least %d", len(pdfBytes), len(expectedHeader))
	}

	for i, b := range expectedHeader {
		if pdfBytes[i] != b {
			t.Errorf("PDF magic header mismatch at byte %d: got %#x, want %#x", i, pdfBytes[i], b)
		}
	}
}

// TestRenderProblemsPDF_NilOptionalFields verifies that renderProblemsPDF handles
// nil optional fields (Description, StarterCode, Solution) gracefully without
// panicking. This catches nil pointer dereferences when optional fields are not set.
func TestRenderProblemsPDF_NilOptionalFields(t *testing.T) {
	// Problem with only required fields set
	testCases := json.RawMessage(`[{"name":"t1","input":"","match_type":"exact"}]`)

	problems := []ExportProblem{
		{
			Title:       "Minimal Problem",
			Description: nil, // Optional
			StarterCode: nil, // Optional
			TestCases:   testCases,
			Tags:        []string{"test"},
			Solution:    nil, // Optional
			Language:    "python",
			CreatedAt:   time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		},
	}

	exportedAt := time.Date(2024, 1, 10, 12, 0, 0, 0, time.UTC)
	pdfBytes, err := renderProblemsPDF(problems, exportedAt)

	if err != nil {
		t.Fatalf("renderProblemsPDF returned error: %v", err)
	}

	if len(pdfBytes) == 0 {
		t.Fatal("renderProblemsPDF returned empty bytes")
	}

	// Check for PDF magic header: %PDF-
	expectedHeader := []byte{0x25, 0x50, 0x44, 0x46, 0x2D}
	if len(pdfBytes) < len(expectedHeader) {
		t.Fatalf("PDF bytes too short: got %d bytes, need at least %d", len(pdfBytes), len(expectedHeader))
	}

	for i, b := range expectedHeader {
		if pdfBytes[i] != b {
			t.Errorf("PDF magic header mismatch at byte %d: got %#x, want %#x", i, pdfBytes[i], b)
		}
	}
}

// TestRenderProblemsPDF_EmptySlice verifies that renderProblemsPDF handles an
// empty problem slice gracefully, returning a valid (possibly blank) PDF document
// rather than panicking or returning an error. This catches edge cases where
// no problems are exported.
func TestRenderProblemsPDF_EmptySlice(t *testing.T) {
	problems := []ExportProblem{}
	exportedAt := time.Date(2024, 1, 10, 12, 0, 0, 0, time.UTC)

	pdfBytes, err := renderProblemsPDF(problems, exportedAt)

	if err != nil {
		t.Fatalf("renderProblemsPDF returned error: %v", err)
	}

	if len(pdfBytes) == 0 {
		t.Fatal("renderProblemsPDF returned empty bytes")
	}

	// Check for PDF magic header: %PDF-
	expectedHeader := []byte{0x25, 0x50, 0x44, 0x46, 0x2D}
	if len(pdfBytes) < len(expectedHeader) {
		t.Fatalf("PDF bytes too short: got %d bytes, need at least %d", len(pdfBytes), len(expectedHeader))
	}

	for i, b := range expectedHeader {
		if pdfBytes[i] != b {
			t.Errorf("PDF magic header mismatch at byte %d: got %#x, want %#x", i, pdfBytes[i], b)
		}
	}
}
