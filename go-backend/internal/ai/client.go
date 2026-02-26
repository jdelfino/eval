// Package ai provides an interface and implementations for AI-powered code analysis.
package ai

import (
	"context"
	"fmt"
)

// IssueSeverity classifies the nature of an identified pattern or issue.
type IssueSeverity string

const (
	// IssueSeverityError represents a bug or correctness problem.
	IssueSeverityError IssueSeverity = "error"

	// IssueSeverityMisconception represents a conceptual misunderstanding.
	IssueSeverityMisconception IssueSeverity = "misconception"

	// IssueSeverityStyle represents a style or best-practice concern.
	IssueSeverityStyle IssueSeverity = "style"

	// IssueSeverityGoodPattern represents a positive pattern worth highlighting.
	IssueSeverityGoodPattern IssueSeverity = "good-pattern"
)

// StudentSubmission holds one student's code for analysis.
type StudentSubmission struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Code   string `json:"code"`
}

// AnalyzeRequest contains the input for AI code analysis across multiple submissions.
type AnalyzeRequest struct {
	ProblemDescription string              `json:"problem_description"`
	Submissions        []StudentSubmission `json:"submissions"`
	Model              string              `json:"model"`
	CustomPrompt       string              `json:"custom_prompt"`
}

// AnalysisIssue represents a pattern or issue identified across one or more student submissions.
// Count must always equal len(StudentIDs).
type AnalysisIssue struct {
	Title                      string        `json:"title"`
	Explanation                string        `json:"explanation"`
	Count                      int           `json:"count"`
	StudentIDs                 []string      `json:"student_ids"`
	RepresentativeStudentID    string        `json:"representative_student_id"`
	RepresentativeStudentLabel string        `json:"representative_student_label"`
	Severity                   IssueSeverity `json:"severity"`
}

// CompletionEstimate breaks down how many students are finished, in-progress, or not started.
type CompletionEstimate struct {
	Finished   int `json:"finished"`
	InProgress int `json:"in_progress"`
	NotStarted int `json:"not_started"`
}

// AnalysisSummary provides metadata about the analysis run, matching the frontend
// WalkthroughSummary shape.
type AnalysisSummary struct {
	TotalSubmissions    int                `json:"total_submissions"`
	FilteredOut         int                `json:"filtered_out"`
	AnalyzedSubmissions int                `json:"analyzed_submissions"`
	CompletionEstimate  CompletionEstimate `json:"completion_estimate"`
	Warning             string             `json:"warning,omitempty"`
}

// AnalyzeResponse is the result of an AI analysis run.
type AnalyzeResponse struct {
	Issues             []AnalysisIssue `json:"issues"`
	FinishedStudentIDs []string        `json:"finished_student_ids"`
	OverallNote        string          `json:"overall_note,omitempty"`
	Summary            AnalysisSummary `json:"summary"`
}

// Client is the interface for AI code analysis.
type Client interface {
	AnalyzeCode(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error)
}

// StubClient is a no-op implementation of Client for testing and development.
type StubClient struct{}

// AnalyzeCode returns a stub response with the new response shape.
func (s *StubClient) AnalyzeCode(_ context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	total := len(req.Submissions)

	var issues []AnalysisIssue
	if total > 0 {
		studentIDs := make([]string, total)
		for i, sub := range req.Submissions {
			studentIDs[i] = sub.UserID
		}
		issues = []AnalysisIssue{
			{
				Title:                      "Stub issue: AI analysis not configured",
				Explanation:                "This is a placeholder issue returned by the stub client. Configure a real AI provider to get actual analysis.",
				Count:                      total,
				StudentIDs:                 studentIDs,
				RepresentativeStudentID:    req.Submissions[0].UserID,
				RepresentativeStudentLabel: req.Submissions[0].Name,
				Severity:                   IssueSeverityStyle,
			},
		}
	} else {
		issues = []AnalysisIssue{}
	}

	return &AnalyzeResponse{
		Issues:             issues,
		FinishedStudentIDs: []string{},
		OverallNote:        "AI analysis is not configured. Please set up an AI provider.",
		Summary: AnalysisSummary{
			TotalSubmissions:    total,
			FilteredOut:         0,
			AnalyzedSubmissions: total,
			CompletionEstimate: CompletionEstimate{
				Finished:   0,
				InProgress: 0,
				NotStarted: total,
			},
		},
	}, nil
}

// ErrNotConfigured is returned when the AI client is not configured.
var ErrNotConfigured = fmt.Errorf("ai: client not configured")
