package ai

import (
	"context"
	"strings"
	"testing"
)

// TestFakeClient_ImplementsClient ensures FakeClient satisfies the Client interface.
func TestFakeClient_ImplementsClient(t *testing.T) {
	var _ Client = (*FakeClient)(nil)
}

// TestFakeClient_GenerateSolution_Deterministic verifies the fake returns a
// deterministic, non-empty solution embedding FakeMarker, across multiple calls
// and regardless of request input.
func TestFakeClient_GenerateSolution_Deterministic(t *testing.T) {
	f := &FakeClient{}

	resp1, err := f.GenerateSolution(context.Background(), GenerateSolutionRequest{
		ProblemDescription: "Add two numbers",
		StarterCode:        "def f(): pass",
		CustomInstructions: "be concise",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp1 == nil {
		t.Fatal("expected response, got nil")
	}
	if !strings.Contains(resp1.Solution, FakeMarker) {
		t.Errorf("solution %q does not contain FakeMarker %q", resp1.Solution, FakeMarker)
	}
	if strings.TrimSpace(resp1.Solution) == "" {
		t.Error("solution must be non-empty")
	}

	// Determinism: a different request must yield the identical solution.
	resp2, err := f.GenerateSolution(context.Background(), GenerateSolutionRequest{ProblemDescription: "Something else"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp1.Solution != resp2.Solution {
		t.Errorf("solution not deterministic:\n  first:  %q\n  second: %q", resp1.Solution, resp2.Solution)
	}
}

// TestFakeClient_AnalyzeCode verifies the analysis response is well-formed:
// Count equals len(StudentIDs), the marker is present, and summary totals match.
func TestFakeClient_AnalyzeCode(t *testing.T) {
	f := &FakeClient{}

	resp, err := f.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test problem",
		Submissions: []StudentSubmission{
			{UserID: "u1", Name: "Alice", Code: "x = 1"},
			{UserID: "u2", Name: "Bob", Code: "y = 2"},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(resp.OverallNote, FakeMarker) {
		t.Errorf("overall note %q does not contain FakeMarker", resp.OverallNote)
	}
	if resp.Summary.TotalSubmissions != 2 {
		t.Errorf("TotalSubmissions = %d, want 2", resp.Summary.TotalSubmissions)
	}
	if len(resp.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(resp.Issues))
	}
	issue := resp.Issues[0]
	if issue.Count != len(issue.StudentIDs) {
		t.Errorf("Count (%d) != len(StudentIDs) (%d)", issue.Count, len(issue.StudentIDs))
	}
	if issue.Count != 2 {
		t.Errorf("Count = %d, want 2", issue.Count)
	}
}

// TestFakeClient_AnalyzeCode_NoSubmissions verifies an empty submission list
// yields no issues and a non-nil (empty) Issues slice.
func TestFakeClient_AnalyzeCode_NoSubmissions(t *testing.T) {
	f := &FakeClient{}

	resp, err := f.AnalyzeCode(context.Background(), AnalyzeRequest{ProblemDescription: "Empty"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Issues == nil {
		t.Error("Issues must be a non-nil empty slice, not nil")
	}
	if len(resp.Issues) != 0 {
		t.Errorf("expected 0 issues, got %d", len(resp.Issues))
	}
	if resp.Summary.TotalSubmissions != 0 {
		t.Errorf("TotalSubmissions = %d, want 0", resp.Summary.TotalSubmissions)
	}
}
