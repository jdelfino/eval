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

	var resp AnalyzeResponse
	if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
		return nil, fmt.Errorf("ai: failed to parse Gemini response JSON: %w", err)
	}

	validateResponse(&resp)
	return &resp, nil
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

// validateResponse normalises an AnalyzeResponse in place:
//   - Enforces Count == len(StudentIDs) for every issue (overrides model value)
//   - Converts nil StudentIDs / FinishedStudentIDs slices to empty slices
//   - Replaces unrecognised Severity values with IssueSeverityError
func validateResponse(resp *AnalyzeResponse) {
	validSeverities := map[IssueSeverity]bool{
		IssueSeverityError:         true,
		IssueSeverityMisconception: true,
		IssueSeverityStyle:         true,
		IssueSeverityGoodPattern:   true,
	}

	for i := range resp.Issues {
		issue := &resp.Issues[i]
		if issue.StudentIDs == nil {
			issue.StudentIDs = []string{}
		}
		// Enforce Count == len(StudentIDs)
		issue.Count = len(issue.StudentIDs)
		// Normalise severity
		if !validSeverities[issue.Severity] {
			issue.Severity = IssueSeverityError
		}
	}

	if resp.FinishedStudentIDs == nil {
		resp.FinishedStudentIDs = []string{}
	}
}

