package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestNewGeminiClient_StoresGenaiClient verifies that NewGeminiClient creates and
// stores the genai.Client on the struct so it can be reused across AnalyzeCode calls
// (connection pooling — no new HTTP client per call).
func TestNewGeminiClient_StoresGenaiClient(t *testing.T) {
	g, err := NewGeminiClient("fake-api-key-for-testing")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	// The struct must store the genai.Client (not nil) so AnalyzeCode can reuse it.
	if g.client == nil {
		t.Error("expected GeminiClient.client to be non-nil after NewGeminiClient; client must be created once and stored")
	}
}

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

// TestValidateResponse_CountEnforced verifies that validateResponse enforces
// Count == len(StudentIDs), ignoring what the model returned for Count.
func TestValidateResponse_CountEnforced(t *testing.T) {
	raw := &AnalyzeResponse{
		Issues: []AnalysisIssue{
			{
				Title:                      "Test issue",
				Explanation:                "Some explanation",
				Count:                      999, // deliberately wrong — must be overridden
				StudentIDs:                 []string{"u1", "u2", "u3"},
				RepresentativeStudentID:    "u1",
				RepresentativeStudentLabel: "Alice",
				Severity:                   IssueSeverityError,
			},
		},
		OverallNote: "Good work",
		Summary: AnalysisSummary{
			TotalSubmissions:    4,
			FilteredOut:         0,
			AnalyzedSubmissions: 4,
			CompletionEstimate: CompletionEstimate{
				Finished:   1,
				InProgress: 2,
				NotStarted: 1,
			},
		},
	}

	validateResponse(raw)

	if len(raw.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(raw.Issues))
	}
	issue := raw.Issues[0]
	if issue.Count != 3 {
		t.Errorf("Count = %d, want 3 (len(StudentIDs))", issue.Count)
	}
	if len(issue.StudentIDs) != 3 {
		t.Errorf("len(StudentIDs) = %d, want 3", len(issue.StudentIDs))
	}
}

// TestValidateResponse_NilStudentIDsBecomesEmpty verifies that nil StudentIDs
// in the response are converted to an empty slice (not nil).
func TestValidateResponse_NilStudentIDsBecomesEmpty(t *testing.T) {
	raw := &AnalyzeResponse{
		Issues: []AnalysisIssue{
			{
				Title:                      "Empty issue",
				Explanation:                "Test",
				Count:                      0,
				StudentIDs:                 nil, // nil from JSON
				RepresentativeStudentID:    "",
				RepresentativeStudentLabel: "",
				Severity:                   IssueSeverityStyle,
			},
		},
		Summary: AnalysisSummary{},
	}

	validateResponse(raw)

	if raw.Issues[0].StudentIDs == nil {
		t.Error("expected non-nil StudentIDs slice, got nil")
	}
}

// TestAnalyzeResponse_NoFinishedStudentIDsField verifies that AnalyzeResponse does not
// contain a FinishedStudentIDs field. This field was removed in PLAT-cluk.
// The test verifies via JSON round-trip that the field is absent from the wire format.
func TestAnalyzeResponse_NoFinishedStudentIDsField(t *testing.T) {
	// A JSON response including finished_student_ids should be silently ignored
	// (extra JSON fields are dropped on unmarshal in Go).
	jsonWithOldField := `{
		"issues": [],
		"finished_student_ids": ["u1", "u2"],
		"overall_note": "test",
		"summary": {
			"total_submissions": 2,
			"filtered_out": 0,
			"analyzed_submissions": 2,
			"completion_estimate": {"finished": 0, "in_progress": 0, "not_started": 2}
		}
	}`

	var resp AnalyzeResponse
	if err := json.Unmarshal([]byte(jsonWithOldField), &resp); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// Re-marshal to verify finished_student_ids is not present in output
	out, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	outStr := string(out)
	if strings.Contains(outStr, "finished_student_ids") {
		t.Errorf("marshaled AnalyzeResponse must not contain 'finished_student_ids', got: %s", outStr)
	}
}

// TestValidateResponse_SeverityPreserved verifies that valid severity values
// are preserved as-is after validateResponse.
func TestValidateResponse_SeverityPreserved(t *testing.T) {
	cases := []struct {
		severity IssueSeverity
		expected IssueSeverity
	}{
		{IssueSeverityError, IssueSeverityError},
		{IssueSeverityMisconception, IssueSeverityMisconception},
		{IssueSeverityStyle, IssueSeverityStyle},
		{IssueSeverityGoodPattern, IssueSeverityGoodPattern},
	}

	for _, tc := range cases {
		raw := &AnalyzeResponse{
			Issues: []AnalysisIssue{
				{
					Title:                      "Test",
					Explanation:                "Test",
					StudentIDs:                 []string{"u1"},
					RepresentativeStudentID:    "u1",
					RepresentativeStudentLabel: "Alice",
					Severity:                   tc.severity,
				},
			},
		}
		validateResponse(raw)
		if raw.Issues[0].Severity != tc.expected {
			t.Errorf("severity %q: got %q, want %q", tc.severity, raw.Issues[0].Severity, tc.expected)
		}
	}
}

// TestValidateResponse_InvalidSeverityBecomesError verifies that an unrecognized
// severity value is replaced with IssueSeverityError.
func TestValidateResponse_InvalidSeverityBecomesError(t *testing.T) {
	raw := &AnalyzeResponse{
		Issues: []AnalysisIssue{
			{
				Title:                      "Test",
				Explanation:                "Test",
				StudentIDs:                 []string{"u1"},
				RepresentativeStudentID:    "u1",
				RepresentativeStudentLabel: "Alice",
				Severity:                   IssueSeverity("unknown-severity"),
			},
		},
	}

	validateResponse(raw)

	if raw.Issues[0].Severity != IssueSeverityError {
		t.Errorf("expected invalid severity to become IssueSeverityError, got %q", raw.Issues[0].Severity)
	}
}

// TestValidateResponse_SummaryFieldsIntact verifies all summary fields are
// preserved correctly after validateResponse.
func TestValidateResponse_SummaryFieldsIntact(t *testing.T) {
	raw := &AnalyzeResponse{
		Summary: AnalysisSummary{
			TotalSubmissions:    10,
			FilteredOut:         2,
			AnalyzedSubmissions: 8,
			CompletionEstimate: CompletionEstimate{
				Finished:   5,
				InProgress: 2,
				NotStarted: 1,
			},
			Warning: "3 submissions were empty",
		},
	}

	validateResponse(raw)

	s := raw.Summary
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

// TestJSONUnmarshalDirectlyIntoPublicTypes verifies that a JSON string from
// Gemini can be unmarshaled directly into AnalyzeResponse without any intermediate
// private types.
func TestJSONUnmarshalDirectlyIntoPublicTypes(t *testing.T) {
	rawJSON := `{
		"issues": [
			{
				"title": "Off-by-one error",
				"explanation": "Loop boundary is wrong",
				"count": 2,
				"student_ids": ["u1", "u2"],
				"representative_student_id": "u1",
				"representative_student_label": "Alice",
				"severity": "error"
			}
		],
		"overall_note": "Most students did well",
		"summary": {
			"total_submissions": 3,
			"filtered_out": 0,
			"analyzed_submissions": 3,
			"completion_estimate": {
				"finished": 1,
				"in_progress": 1,
				"not_started": 1
			},
			"warning": ""
		}
	}`

	var resp AnalyzeResponse
	if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
		t.Fatalf("failed to unmarshal JSON into AnalyzeResponse: %v", err)
	}

	if len(resp.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(resp.Issues))
	}
	issue := resp.Issues[0]
	if issue.Title != "Off-by-one error" {
		t.Errorf("Title = %q, want %q", issue.Title, "Off-by-one error")
	}
	if issue.Severity != IssueSeverityError {
		t.Errorf("Severity = %q, want %q", issue.Severity, IssueSeverityError)
	}
	if issue.Count != 2 {
		t.Errorf("Count = %d, want 2", issue.Count)
	}
	if len(issue.StudentIDs) != 2 {
		t.Errorf("len(StudentIDs) = %d, want 2", len(issue.StudentIDs))
	}
	if resp.Summary.TotalSubmissions != 3 {
		t.Errorf("TotalSubmissions = %d, want 3", resp.Summary.TotalSubmissions)
	}
}

// TestJSONUnmarshalAllSeverities verifies that all valid severity string values
// unmarshal correctly into the IssueSeverity type (which is just a string alias).
func TestJSONUnmarshalAllSeverities(t *testing.T) {
	severities := []struct {
		jsonVal  string
		expected IssueSeverity
	}{
		{"error", IssueSeverityError},
		{"misconception", IssueSeverityMisconception},
		{"style", IssueSeverityStyle},
		{"good-pattern", IssueSeverityGoodPattern},
	}

	for _, tc := range severities {
		rawJSON := `{"issues":[{"title":"T","explanation":"E","count":1,"student_ids":["u1"],"representative_student_id":"u1","representative_student_label":"Alice","severity":"` + tc.jsonVal + `"}],"summary":{"total_submissions":1,"filtered_out":0,"analyzed_submissions":1,"completion_estimate":{"finished":0,"in_progress":0,"not_started":1}}}`

		var resp AnalyzeResponse
		if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
			t.Fatalf("severity %q: unmarshal failed: %v", tc.jsonVal, err)
		}
		if resp.Issues[0].Severity != tc.expected {
			t.Errorf("severity %q: got %q, want %q", tc.jsonVal, resp.Issues[0].Severity, tc.expected)
		}
	}
}
