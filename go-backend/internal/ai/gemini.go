package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/genai"
)

const defaultModel = "gemini-2.0-flash"

// GeminiClient implements Client using the Google Gemini API.
// The genai.Client is created once in NewGeminiClient and reused across
// AnalyzeCode calls, enabling HTTP connection pooling and TLS session reuse.
type GeminiClient struct {
	client *genai.Client
}

// NewGeminiClient creates a new GeminiClient with the given API key.
// Returns an error if the API key is empty or the underlying genai.Client
// cannot be initialised.
func NewGeminiClient(apiKey string) (*GeminiClient, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("ai: GEMINI_API_KEY is required")
	}
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("ai: failed to create Gemini client: %w", err)
	}
	return &GeminiClient{client: client}, nil
}

// geminiResponse is the structured JSON response expected from Gemini.
// It mirrors AnalyzeResponse for JSON unmarshaling.
type geminiResponse struct {
	Issues             []geminiIssue   `json:"issues"`
	FinishedStudentIDs []string        `json:"finished_student_ids"`
	OverallNote        string          `json:"overall_note"`
	Summary            geminiSummary   `json:"summary"`
}

type geminiIssue struct {
	Title                      string `json:"title"`
	Explanation                string `json:"explanation"`
	Count                      int    `json:"count"`
	StudentIDs                 []string `json:"student_ids"`
	RepresentativeStudentID    string `json:"representative_student_id"`
	RepresentativeStudentLabel string `json:"representative_student_label"`
	Severity                   string `json:"severity"`
}

type geminiSummary struct {
	TotalSubmissions    int                    `json:"total_submissions"`
	FilteredOut         int                    `json:"filtered_out"`
	AnalyzedSubmissions int                    `json:"analyzed_submissions"`
	CompletionEstimate  geminiCompletionEstimate `json:"completion_estimate"`
	Warning             string                 `json:"warning"`
}

type geminiCompletionEstimate struct {
	Finished   int `json:"finished"`
	InProgress int `json:"in_progress"`
	NotStarted int `json:"not_started"`
}

// AnalyzeCode sends student submissions to Gemini for analysis and returns structured results.
func (g *GeminiClient) AnalyzeCode(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	model := req.Model
	if model == "" {
		model = defaultModel
	}

	customDirections := req.CustomPrompt
	if customDirections == "" {
		customDirections = DefaultCustomDirections
	}

	prompt := BuildPrompt(req.ProblemDescription, req.Submissions, customDirections)

	result, err := g.client.Models.GenerateContent(
		ctx,
		model,
		genai.Text(prompt),
		&genai.GenerateContentConfig{
			ResponseMIMEType: "application/json",
			ResponseSchema:   buildResponseSchema(),
		},
	)
	if err != nil {
		return nil, fmt.Errorf("ai: Gemini API call failed: %w", err)
	}

	rawJSON := result.Text()
	if rawJSON == "" {
		return nil, fmt.Errorf("ai: Gemini returned empty response")
	}

	var geminiResp geminiResponse
	if err := json.Unmarshal([]byte(rawJSON), &geminiResp); err != nil {
		return nil, fmt.Errorf("ai: failed to parse Gemini response JSON: %w", err)
	}

	return convertGeminiResponse(geminiResp), nil
}

// buildResponseSchema returns the genai.Schema describing the expected JSON output.
func buildResponseSchema() *genai.Schema {
	issueSchema := &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"title":                        {Type: genai.TypeString},
			"explanation":                  {Type: genai.TypeString},
			"count":                        {Type: genai.TypeInteger},
			"student_ids":                  {Type: genai.TypeArray, Items: &genai.Schema{Type: genai.TypeString}},
			"representative_student_id":    {Type: genai.TypeString},
			"representative_student_label": {Type: genai.TypeString},
			"severity":                     {Type: genai.TypeString, Enum: []string{"error", "misconception", "style", "good-pattern"}},
		},
		Required: []string{"title", "explanation", "count", "student_ids", "representative_student_id", "representative_student_label", "severity"},
	}

	completionEstimateSchema := &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"finished":    {Type: genai.TypeInteger},
			"in_progress": {Type: genai.TypeInteger},
			"not_started": {Type: genai.TypeInteger},
		},
		Required: []string{"finished", "in_progress", "not_started"},
	}

	summarySchema := &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"total_submissions":    {Type: genai.TypeInteger},
			"filtered_out":        {Type: genai.TypeInteger},
			"analyzed_submissions": {Type: genai.TypeInteger},
			"completion_estimate": completionEstimateSchema,
			"warning":             {Type: genai.TypeString},
		},
		Required: []string{"total_submissions", "filtered_out", "analyzed_submissions", "completion_estimate"},
	}

	return &genai.Schema{
		Type: genai.TypeObject,
		Properties: map[string]*genai.Schema{
			"issues":               {Type: genai.TypeArray, Items: issueSchema},
			"finished_student_ids": {Type: genai.TypeArray, Items: &genai.Schema{Type: genai.TypeString}},
			"overall_note":        {Type: genai.TypeString},
			"summary":             summarySchema,
		},
		Required: []string{"issues", "finished_student_ids", "summary"},
	}
}

// convertGeminiResponse converts the raw Gemini JSON response to our AnalyzeResponse type.
func convertGeminiResponse(g geminiResponse) *AnalyzeResponse {
	issues := make([]AnalysisIssue, 0, len(g.Issues))
	for _, gi := range g.Issues {
		studentIDs := gi.StudentIDs
		if studentIDs == nil {
			studentIDs = []string{}
		}
		// Enforce that Count matches len(StudentIDs)
		count := len(studentIDs)
		issues = append(issues, AnalysisIssue{
			Title:                      gi.Title,
			Explanation:                gi.Explanation,
			Count:                      count,
			StudentIDs:                 studentIDs,
			RepresentativeStudentID:    gi.RepresentativeStudentID,
			RepresentativeStudentLabel: gi.RepresentativeStudentLabel,
			Severity:                   IssueSeverity(gi.Severity),
		})
	}

	finishedIDs := g.FinishedStudentIDs
	if finishedIDs == nil {
		finishedIDs = []string{}
	}

	return &AnalyzeResponse{
		Issues:             issues,
		FinishedStudentIDs: finishedIDs,
		OverallNote:        g.OverallNote,
		Summary: AnalysisSummary{
			TotalSubmissions:    g.Summary.TotalSubmissions,
			FilteredOut:         g.Summary.FilteredOut,
			AnalyzedSubmissions: g.Summary.AnalyzedSubmissions,
			CompletionEstimate: CompletionEstimate{
				Finished:   g.Summary.CompletionEstimate.Finished,
				InProgress: g.Summary.CompletionEstimate.InProgress,
				NotStarted: g.Summary.CompletionEstimate.NotStarted,
			},
			Warning: g.Summary.Warning,
		},
	}
}
