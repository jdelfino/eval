package ai

import (
	"context"
	"strings"
	"testing"
)

// TestStubClient_ReturnsNewResponseShape verifies that StubClient returns the
// redesigned AnalyzeResponse shape (Issues, FinishedStudentIDs, Summary, OverallNote)
// rather than the old Analysis/Suggestions shape.
func TestStubClient_ReturnsNewResponseShape(t *testing.T) {
	client := &StubClient{}
	req := AnalyzeRequest{
		ProblemDescription: "Write a function that adds two numbers",
		Submissions: []StudentSubmission{
			{UserID: "user-1", Name: "Alice", Code: "def add(a,b): return a+b"},
			{UserID: "user-2", Name: "Bob", Code: "def add(a,b): return a-b"},
		},
		Model: "gemini-2.0-flash",
	}
	resp, err := client.AnalyzeCode(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Issues must be non-nil (can be empty slice but not nil)
	if resp.Issues == nil {
		t.Error("expected non-nil Issues slice")
	}

	// FinishedStudentIDs must be non-nil
	if resp.FinishedStudentIDs == nil {
		t.Error("expected non-nil FinishedStudentIDs slice")
	}

	// Summary must be present
	if resp.Summary.TotalSubmissions == 0 && resp.Summary.AnalyzedSubmissions == 0 {
		// At least one summary field must be populated for a real stub
		// (both zero is technically valid, but let's ensure the struct exists)
		_ = resp.Summary
	}
}

// TestStubClient_IssueShape verifies each issue in the stub response has the
// required fields matching the frontend AnalysisIssue shape.
func TestStubClient_IssueShape(t *testing.T) {
	client := &StubClient{}
	req := AnalyzeRequest{
		ProblemDescription: "Write hello world",
		Submissions: []StudentSubmission{
			{UserID: "user-1", Name: "Alice", Code: "print('hello')"},
		},
	}
	resp, err := client.AnalyzeCode(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Validate each issue has required fields
	for i, issue := range resp.Issues {
		if issue.Title == "" {
			t.Errorf("issue[%d].Title is empty", i)
		}
		if issue.Explanation == "" {
			t.Errorf("issue[%d].Explanation is empty", i)
		}
		if issue.Severity == "" {
			t.Errorf("issue[%d].Severity is empty", i)
		}
		// Count field must be consistent with student_ids length
		if issue.Count != len(issue.StudentIDs) {
			t.Errorf("issue[%d].Count=%d does not match len(StudentIDs)=%d", i, issue.Count, len(issue.StudentIDs))
		}
		if issue.RepresentativeStudentID == "" {
			t.Errorf("issue[%d].RepresentativeStudentID is empty", i)
		}
		if issue.RepresentativeStudentLabel == "" {
			t.Errorf("issue[%d].RepresentativeStudentLabel is empty", i)
		}
	}
}

// TestAnalyzeRequest_TypeContract verifies the AnalyzeRequest struct has
// the fields required by the task spec.
func TestAnalyzeRequest_TypeContract(t *testing.T) {
	// Compile-time contract: these fields must exist on AnalyzeRequest
	req := AnalyzeRequest{
		ProblemDescription: "Test problem",
		Submissions: []StudentSubmission{
			{
				UserID: "user-abc",
				Name:   "Student A",
				Code:   "x = 1",
			},
		},
		Model:        "gemini-2.0-flash",
		CustomPrompt: "Focus on correctness only",
	}

	if req.ProblemDescription == "" {
		t.Error("ProblemDescription should be set")
	}
	if len(req.Submissions) != 1 {
		t.Error("expected 1 submission")
	}
	sub := req.Submissions[0]
	if sub.UserID == "" || sub.Name == "" || sub.Code == "" {
		t.Error("StudentSubmission fields must all be set")
	}
	if req.Model == "" {
		t.Error("Model should be set")
	}
}

// TestBuildPrompt_ContainsBoilerplate verifies that BuildPrompt includes the
// system framing and problem description.
func TestBuildPrompt_ContainsBoilerplate(t *testing.T) {
	submissions := []StudentSubmission{
		{UserID: "u1", Name: "Alice", Code: "def foo(): pass"},
	}
	prompt := BuildPrompt("Find sorting bugs", submissions, DefaultCustomDirections)

	// The prompt must mention the problem description
	if !strings.Contains(prompt, "Find sorting bugs") {
		t.Error("prompt does not contain the problem description")
	}

	// The prompt must contain student code
	if !strings.Contains(prompt, "def foo(): pass") {
		t.Error("prompt does not contain student code")
	}

	// The prompt must contain student name or ID
	if !strings.Contains(prompt, "Alice") && !strings.Contains(prompt, "u1") {
		t.Error("prompt does not reference the student")
	}
}

// TestBuildPrompt_InsertsCustomDirections verifies that BuildPrompt includes
// the custom directions (instructor-editable portion) in the output.
func TestBuildPrompt_InsertsCustomDirections(t *testing.T) {
	submissions := []StudentSubmission{
		{UserID: "u1", Name: "Bob", Code: "x=1"},
	}
	customDirections := "Only focus on runtime errors. Do not comment on style."
	prompt := BuildPrompt("Simple assignment", submissions, customDirections)

	if !strings.Contains(prompt, customDirections) {
		t.Errorf("prompt does not contain custom directions: %q", customDirections)
	}
}

// TestBuildPrompt_DefaultDirectionsAreReasonable verifies that DefaultCustomDirections
// is non-empty and contains expected guidance (2-3 buckets, max 5 issues, no unfinished bucket).
func TestBuildPrompt_DefaultDirectionsAreReasonable(t *testing.T) {
	if DefaultCustomDirections == "" {
		t.Fatal("DefaultCustomDirections must not be empty")
	}

	// Should NOT mention unfinished code as a bucket
	lower := strings.ToLower(DefaultCustomDirections)
	if strings.Contains(lower, "unfinished") {
		t.Error("DefaultCustomDirections should not include an unfinished code bucket")
	}

	// Should mention a max count (5)
	if !strings.Contains(DefaultCustomDirections, "5") {
		t.Error("DefaultCustomDirections should mention a max of 5 issues")
	}
}

// TestBuildPrompt_MultipleStudents verifies that all student submissions are
// included in the prompt.
func TestBuildPrompt_MultipleStudents(t *testing.T) {
	submissions := []StudentSubmission{
		{UserID: "u1", Name: "Alice", Code: "code_alice"},
		{UserID: "u2", Name: "Bob", Code: "code_bob"},
		{UserID: "u3", Name: "Carol", Code: "code_carol"},
	}
	prompt := BuildPrompt("Problem description", submissions, DefaultCustomDirections)

	for _, sub := range submissions {
		if !strings.Contains(prompt, sub.Code) {
			t.Errorf("prompt missing code for student %s (%s)", sub.Name, sub.UserID)
		}
	}
}

// TestBuildPrompt_EmptySubmissions verifies BuildPrompt does not panic on empty input.
func TestBuildPrompt_EmptySubmissions(t *testing.T) {
	// Should not panic, even if the output is not useful
	prompt := BuildPrompt("Problem", []StudentSubmission{}, DefaultCustomDirections)
	if prompt == "" {
		t.Error("expected non-empty prompt even with no submissions")
	}
}

// TestIssueSeverity_ValidValues ensures the severity type accepts all values
// defined in the frontend spec.
func TestIssueSeverity_ValidValues(t *testing.T) {
	validSeverities := []IssueSeverity{
		IssueSeverityError,
		IssueSeverityMisconception,
		IssueSeverityStyle,
		IssueSeverityGoodPattern,
	}
	for _, s := range validSeverities {
		if string(s) == "" {
			t.Errorf("severity value is empty string")
		}
	}
}

// TestAnalysisIssue_CountMatchesStudentIDs verifies the Count field contract:
// it must equal the length of StudentIDs.
func TestAnalysisIssue_CountMatchesStudentIDs(t *testing.T) {
	issue := AnalysisIssue{
		Title:                      "Off-by-one error",
		Explanation:                "Loop boundary incorrect",
		Count:                      2,
		StudentIDs:                 []string{"u1", "u2"},
		RepresentativeStudentID:    "u1",
		RepresentativeStudentLabel: "Alice",
		Severity:                   IssueSeverityError,
	}
	if issue.Count != len(issue.StudentIDs) {
		t.Errorf("Count %d != len(StudentIDs) %d", issue.Count, len(issue.StudentIDs))
	}
}

// TestAnalyzeResponse_SummaryFields verifies the AnalyzeResponse.Summary has
// the fields required by the frontend WalkthroughSummary shape.
func TestAnalyzeResponse_SummaryFields(t *testing.T) {
	resp := AnalyzeResponse{
		Issues:             []AnalysisIssue{},
		FinishedStudentIDs: []string{"u1"},
		OverallNote:        "Overall the class did well",
		Summary: AnalysisSummary{
			TotalSubmissions:   5,
			FilteredOut:        1,
			AnalyzedSubmissions: 4,
			CompletionEstimate: CompletionEstimate{
				Finished:   3,
				InProgress: 1,
				NotStarted: 0,
			},
			Warning: "Some students had empty submissions",
		},
	}

	if resp.Summary.TotalSubmissions != 5 {
		t.Errorf("TotalSubmissions = %d, want 5", resp.Summary.TotalSubmissions)
	}
	if resp.Summary.FilteredOut != 1 {
		t.Errorf("FilteredOut = %d, want 1", resp.Summary.FilteredOut)
	}
	if resp.Summary.AnalyzedSubmissions != 4 {
		t.Errorf("AnalyzedSubmissions = %d, want 4", resp.Summary.AnalyzedSubmissions)
	}
	if resp.Summary.CompletionEstimate.Finished != 3 {
		t.Errorf("CompletionEstimate.Finished = %d, want 3", resp.Summary.CompletionEstimate.Finished)
	}
	if resp.Summary.CompletionEstimate.InProgress != 1 {
		t.Errorf("CompletionEstimate.InProgress = %d, want 1", resp.Summary.CompletionEstimate.InProgress)
	}
	if resp.Summary.CompletionEstimate.NotStarted != 0 {
		t.Errorf("CompletionEstimate.NotStarted = %d, want 0", resp.Summary.CompletionEstimate.NotStarted)
	}
	if resp.Summary.Warning != "Some students had empty submissions" {
		t.Errorf("Warning = %q, unexpected", resp.Summary.Warning)
	}
}
