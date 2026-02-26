package ai

import (
	"testing"
)

// TestNewGeminiClient_RejectsEmptyAPIKey verifies that NewGeminiClient returns
// an error when the API key is empty.
func TestNewGeminiClient_RejectsEmptyAPIKey(t *testing.T) {
	_, err := NewGeminiClient("")
	if err == nil {
		t.Error("expected error when API key is empty, got nil")
	}
}

// TestNewGeminiClient_AcceptsValidAPIKey verifies that NewGeminiClient succeeds
// when a non-empty API key is provided.
func TestNewGeminiClient_AcceptsValidAPIKey(t *testing.T) {
	client, err := NewGeminiClient("fake-api-key-for-testing")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if client == nil {
		t.Error("expected non-nil client")
	}
}

// TestConvertGeminiResponse_CountEnforced verifies that convertGeminiResponse
// enforces Count == len(StudentIDs), ignoring what the model returned for Count.
func TestConvertGeminiResponse_CountEnforced(t *testing.T) {
	raw := geminiResponse{
		Issues: []geminiIssue{
			{
				Title:                      "Test issue",
				Explanation:                "Some explanation",
				Count:                      999, // deliberately wrong — must be overridden
				StudentIDs:                 []string{"u1", "u2", "u3"},
				RepresentativeStudentID:    "u1",
				RepresentativeStudentLabel: "Alice",
				Severity:                   "error",
			},
		},
		FinishedStudentIDs: []string{"u4"},
		OverallNote:        "Good work",
		Summary: geminiSummary{
			TotalSubmissions:    4,
			FilteredOut:         0,
			AnalyzedSubmissions: 4,
			CompletionEstimate: geminiCompletionEstimate{
				Finished:   1,
				InProgress: 2,
				NotStarted: 1,
			},
		},
	}

	resp := convertGeminiResponse(raw)

	if len(resp.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(resp.Issues))
	}
	issue := resp.Issues[0]
	if issue.Count != 3 {
		t.Errorf("Count = %d, want 3 (len(StudentIDs))", issue.Count)
	}
	if len(issue.StudentIDs) != 3 {
		t.Errorf("len(StudentIDs) = %d, want 3", len(issue.StudentIDs))
	}
}

// TestConvertGeminiResponse_NilStudentIDsBecomesEmpty verifies that nil StudentIDs
// in the raw response are converted to an empty slice (not nil).
func TestConvertGeminiResponse_NilStudentIDsBecomesEmpty(t *testing.T) {
	raw := geminiResponse{
		Issues: []geminiIssue{
			{
				Title:                      "Empty issue",
				Explanation:                "Test",
				Count:                      0,
				StudentIDs:                 nil, // nil from JSON
				RepresentativeStudentID:    "",
				RepresentativeStudentLabel: "",
				Severity:                   "style",
			},
		},
		FinishedStudentIDs: nil,
		Summary:            geminiSummary{},
	}

	resp := convertGeminiResponse(raw)

	if resp.Issues[0].StudentIDs == nil {
		t.Error("expected non-nil StudentIDs slice, got nil")
	}
	if resp.FinishedStudentIDs == nil {
		t.Error("expected non-nil FinishedStudentIDs slice, got nil")
	}
}

// TestConvertGeminiResponse_SeverityPreserved verifies that severity strings
// from the raw response are correctly converted to IssueSeverity values.
func TestConvertGeminiResponse_SeverityPreserved(t *testing.T) {
	cases := []struct {
		raw      string
		expected IssueSeverity
	}{
		{"error", IssueSeverityError},
		{"misconception", IssueSeverityMisconception},
		{"style", IssueSeverityStyle},
		{"good-pattern", IssueSeverityGoodPattern},
	}

	for _, tc := range cases {
		raw := geminiResponse{
			Issues: []geminiIssue{
				{
					Title:                      "Test",
					Explanation:                "Test",
					StudentIDs:                 []string{"u1"},
					RepresentativeStudentID:    "u1",
					RepresentativeStudentLabel: "Alice",
					Severity:                   tc.raw,
				},
			},
		}
		resp := convertGeminiResponse(raw)
		if resp.Issues[0].Severity != tc.expected {
			t.Errorf("severity %q: got %q, want %q", tc.raw, resp.Issues[0].Severity, tc.expected)
		}
	}
}

// TestConvertGeminiResponse_SummaryFields verifies all summary fields are mapped correctly.
func TestConvertGeminiResponse_SummaryFields(t *testing.T) {
	raw := geminiResponse{
		Summary: geminiSummary{
			TotalSubmissions:    10,
			FilteredOut:         2,
			AnalyzedSubmissions: 8,
			CompletionEstimate: geminiCompletionEstimate{
				Finished:   5,
				InProgress: 2,
				NotStarted: 1,
			},
			Warning: "3 submissions were empty",
		},
	}

	resp := convertGeminiResponse(raw)

	s := resp.Summary
	if s.TotalSubmissions != 10 {
		t.Errorf("TotalSubmissions = %d, want 10", s.TotalSubmissions)
	}
	if s.FilteredOut != 2 {
		t.Errorf("FilteredOut = %d, want 2", s.FilteredOut)
	}
	if s.AnalyzedSubmissions != 8 {
		t.Errorf("AnalyzedSubmissions = %d, want 8", s.AnalyzedSubmissions)
	}
	if s.CompletionEstimate.Finished != 5 {
		t.Errorf("Finished = %d, want 5", s.CompletionEstimate.Finished)
	}
	if s.CompletionEstimate.InProgress != 2 {
		t.Errorf("InProgress = %d, want 2", s.CompletionEstimate.InProgress)
	}
	if s.CompletionEstimate.NotStarted != 1 {
		t.Errorf("NotStarted = %d, want 1", s.CompletionEstimate.NotStarted)
	}
	if s.Warning != "3 submissions were empty" {
		t.Errorf("Warning = %q, unexpected", s.Warning)
	}
}
