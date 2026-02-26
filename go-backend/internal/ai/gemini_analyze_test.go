package ai

import (
	"context"
	"errors"
	"strings"
	"testing"

	"google.golang.org/genai"
)

// mockContentGenerator is a mock implementation of contentGenerator for testing.
type mockContentGenerator struct {
	// fn is called when GenerateContent is invoked
	fn func(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error)

	// capturedModel stores the last model passed to GenerateContent
	capturedModel string
	// capturedContents stores the last contents passed to GenerateContent
	capturedContents []*genai.Content
}

func (m *mockContentGenerator) GenerateContent(ctx context.Context, model string, contents []*genai.Content, config *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
	m.capturedModel = model
	m.capturedContents = contents
	return m.fn(ctx, model, contents, config)
}

// makeTextResponse builds a *genai.GenerateContentResponse that returns the given text from .Text().
func makeTextResponse(text string) *genai.GenerateContentResponse {
	return &genai.GenerateContentResponse{
		Candidates: []*genai.Candidate{
			{
				Content: &genai.Content{
					Parts: []*genai.Part{
						{Text: text},
					},
				},
			},
		},
	}
}

// validAnalyzeResponseJSON is a minimal valid JSON response from the Gemini API.
const validAnalyzeResponseJSON = `{
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
	"finished_student_ids": ["u3"],
	"overall_note": "Most students did well",
	"summary": {
		"total_submissions": 3,
		"filtered_out": 0,
		"analyzed_submissions": 3,
		"completion_estimate": {
			"finished": 1,
			"in_progress": 1,
			"not_started": 1
		}
	}
}`

// TestAnalyzeCode_HappyPath verifies the full round-trip: prompt building → SDK call → response parsing → validation.
func TestAnalyzeCode_HappyPath(t *testing.T) {
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	req := AnalyzeRequest{
		ProblemDescription: "Write a function that adds two numbers",
		Submissions: []StudentSubmission{
			{UserID: "u1", Name: "Alice", Code: "def add(a,b): return a+b"},
			{UserID: "u2", Name: "Bob", Code: "def add(a,b): return a-b"},
			{UserID: "u3", Name: "Carol", Code: "def add(a,b): return a+b"},
		},
	}

	resp, err := g.AnalyzeCode(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify response was parsed and validated correctly
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
	// Count must be enforced to len(StudentIDs) by validateResponse
	if issue.Count != len(issue.StudentIDs) {
		t.Errorf("Count = %d, len(StudentIDs) = %d — must match", issue.Count, len(issue.StudentIDs))
	}
	if len(resp.FinishedStudentIDs) != 1 || resp.FinishedStudentIDs[0] != "u3" {
		t.Errorf("FinishedStudentIDs = %v, want [u3]", resp.FinishedStudentIDs)
	}
	if resp.Summary.TotalSubmissions != 3 {
		t.Errorf("TotalSubmissions = %d, want 3", resp.Summary.TotalSubmissions)
	}
}

// TestAnalyzeCode_SDKError verifies that when the SDK returns an error, AnalyzeCode returns an error.
func TestAnalyzeCode_SDKError(t *testing.T) {
	sdkErr := errors.New("network timeout")
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return nil, sdkErr
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error when SDK returns error, got nil")
	}
	if !strings.Contains(err.Error(), "Gemini API call failed") {
		t.Errorf("error message %q should contain 'Gemini API call failed'", err.Error())
	}
}

// TestAnalyzeCode_EmptyResponse verifies that an empty response text results in an error.
func TestAnalyzeCode_EmptyResponse(t *testing.T) {
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(""), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error on empty response, got nil")
	}
	if !strings.Contains(err.Error(), "empty response") {
		t.Errorf("error message %q should contain 'empty response'", err.Error())
	}
}

// TestAnalyzeCode_MalformedJSON verifies that malformed JSON in the response results in an error.
func TestAnalyzeCode_MalformedJSON(t *testing.T) {
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(`{"issues": [`), nil // malformed JSON
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error on malformed JSON, got nil")
	}
	if !strings.Contains(err.Error(), "parse Gemini response JSON") {
		t.Errorf("error message %q should contain 'parse Gemini response JSON'", err.Error())
	}
}

// TestAnalyzeCode_PromptContainsProblemDescription verifies that the prompt sent to the SDK
// contains the problem description.
func TestAnalyzeCode_PromptContainsProblemDescription(t *testing.T) {
	const problemDesc = "Implement a binary search tree insert method"

	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, contents []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: problemDesc,
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify prompt contains the problem description
	if len(mock.capturedContents) == 0 {
		t.Fatal("no contents were passed to the SDK")
	}
	var fullPrompt string
	for _, content := range mock.capturedContents {
		for _, part := range content.Parts {
			fullPrompt += part.Text
		}
	}
	if !strings.Contains(fullPrompt, problemDesc) {
		t.Errorf("prompt does not contain problem description %q", problemDesc)
	}
}

// TestAnalyzeCode_PromptContainsStudentCode verifies that the prompt includes student code.
func TestAnalyzeCode_PromptContainsStudentCode(t *testing.T) {
	const studentCode = "def unique_binary_search(arr, target): pass"

	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Implement binary search",
		Submissions: []StudentSubmission{
			{UserID: "u1", Name: "Alice", Code: studentCode},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var fullPrompt string
	for _, content := range mock.capturedContents {
		for _, part := range content.Parts {
			fullPrompt += part.Text
		}
	}
	if !strings.Contains(fullPrompt, studentCode) {
		t.Errorf("prompt does not contain student code %q", studentCode)
	}
}

// TestAnalyzeCode_PromptContainsCustomDirections verifies that custom prompt overrides
// the default custom directions in the prompt.
func TestAnalyzeCode_PromptContainsCustomDirections(t *testing.T) {
	const customDir = "Only focus on runtime errors. Ignore style issues entirely."

	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test problem",
		CustomPrompt:       customDir,
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var fullPrompt string
	for _, content := range mock.capturedContents {
		for _, part := range content.Parts {
			fullPrompt += part.Text
		}
	}
	if !strings.Contains(fullPrompt, customDir) {
		t.Errorf("prompt does not contain custom directions %q", customDir)
	}
}

// TestAnalyzeCode_DefaultModelUsed verifies that when no model is specified,
// the default model is passed to the SDK.
func TestAnalyzeCode_DefaultModelUsed(t *testing.T) {
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		// Model is empty — should use defaultModel
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if mock.capturedModel != defaultModel {
		t.Errorf("expected model %q, got %q", defaultModel, mock.capturedModel)
	}
}

// TestAnalyzeCode_CustomModelUsed verifies that when a model is specified in the request,
// that model is passed to the SDK.
func TestAnalyzeCode_CustomModelUsed(t *testing.T) {
	const customModel = "gemini-1.5-pro"

	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		Model:              customModel,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if mock.capturedModel != customModel {
		t.Errorf("expected model %q, got %q", customModel, mock.capturedModel)
	}
}

// TestAnalyzeCode_DefaultCustomDirectionsUsedWhenEmpty verifies that when CustomPrompt is empty,
// the DefaultCustomDirections are included in the prompt.
func TestAnalyzeCode_DefaultCustomDirectionsUsedWhenEmpty(t *testing.T) {
	mock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	g := newGeminiClientWithGenerator(mock)

	_, err := g.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		// CustomPrompt empty — should use DefaultCustomDirections
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var fullPrompt string
	for _, content := range mock.capturedContents {
		for _, part := range content.Parts {
			fullPrompt += part.Text
		}
	}
	// DefaultCustomDirections mentions "5" issues max — check a distinguishing part
	if !strings.Contains(fullPrompt, DefaultCustomDirections) {
		t.Error("prompt does not contain DefaultCustomDirections when CustomPrompt is empty")
	}
}

// TestBuildResponseSchema_HasRequiredFields verifies that buildResponseSchema returns a schema
// with the expected top-level required fields.
func TestBuildResponseSchema_HasRequiredFields(t *testing.T) {
	schema := buildResponseSchema()

	if schema == nil {
		t.Fatal("buildResponseSchema returned nil")
	}

	required := map[string]bool{}
	for _, r := range schema.Required {
		required[r] = true
	}

	expectedFields := []string{"issues", "finished_student_ids", "summary"}
	for _, f := range expectedFields {
		if !required[f] {
			t.Errorf("schema.Required missing field %q", f)
		}
	}
}

// TestBuildResponseSchema_IssueSchemaHasRequiredFields verifies that the issue sub-schema
// has all required fields.
func TestBuildResponseSchema_IssueSchemaHasRequiredFields(t *testing.T) {
	schema := buildResponseSchema()

	issueArraySchema, ok := schema.Properties["issues"]
	if !ok {
		t.Fatal("schema missing 'issues' property")
	}
	if issueArraySchema.Items == nil {
		t.Fatal("issues schema has no Items")
	}

	issueSchema := issueArraySchema.Items
	required := map[string]bool{}
	for _, r := range issueSchema.Required {
		required[r] = true
	}

	expectedFields := []string{
		"title", "explanation", "count", "student_ids",
		"representative_student_id", "representative_student_label", "severity",
	}
	for _, f := range expectedFields {
		if !required[f] {
			t.Errorf("issue schema.Required missing field %q", f)
		}
	}
}

// TestBuildResponseSchema_SeverityEnumValues verifies that the severity field schema
// includes the expected enum values.
func TestBuildResponseSchema_SeverityEnumValues(t *testing.T) {
	schema := buildResponseSchema()

	issueSchema := schema.Properties["issues"].Items
	severitySchema, ok := issueSchema.Properties["severity"]
	if !ok {
		t.Fatal("issue schema missing 'severity' property")
	}

	enumSet := map[string]bool{}
	for _, v := range severitySchema.Enum {
		enumSet[v] = true
	}

	for _, expected := range []string{"error", "misconception", "style", "good-pattern"} {
		if !enumSet[expected] {
			t.Errorf("severity enum missing value %q", expected)
		}
	}
}
