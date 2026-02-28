package ai

import (
	"context"
	"errors"
	"strings"
	"testing"

	anthropic "github.com/anthropics/anthropic-sdk-go"
)

// mockMessageCreator is a mock implementation of messageCreator for testing.
type mockMessageCreator struct {
	// fn is called when New is invoked
	fn func(ctx context.Context, params anthropic.MessageNewParams) (*anthropic.Message, error)

	// capturedModel stores the last model passed
	capturedModel string
	// capturedPrompt stores the full text content of the last message
	capturedPrompt string
}

func (m *mockMessageCreator) New(ctx context.Context, params anthropic.MessageNewParams) (*anthropic.Message, error) {
	m.capturedModel = string(params.Model)
	// Extract the prompt text from the messages
	for _, msg := range params.Messages {
		for _, block := range msg.Content {
			if block.OfText != nil {
				m.capturedPrompt += block.OfText.Text
			}
		}
	}
	return m.fn(ctx, params)
}

// makeClaudeTextResponse builds a *anthropic.Message with the given text content.
func makeClaudeTextResponse(text string) *anthropic.Message {
	msg := &anthropic.Message{}
	msg.Content = []anthropic.ContentBlockUnion{
		{Type: "text", Text: text},
	}
	return msg
}

// validClaudeResponseJSON is a minimal valid JSON response (same structure as Gemini).
const validClaudeResponseJSON = `{
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

// TestClaudeAnalyzeCode_HappyPath verifies the full round-trip for ClaudeClient.
func TestClaudeAnalyzeCode_HappyPath(t *testing.T) {
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	req := AnalyzeRequest{
		ProblemDescription: "Write a function that adds two numbers",
		Submissions: []StudentSubmission{
			{UserID: "u1", Name: "Alice", Code: "def add(a,b): return a+b"},
			{UserID: "u2", Name: "Bob", Code: "def add(a,b): return a-b"},
			{UserID: "u3", Name: "Carol", Code: "def add(a,b): return a+b"},
		},
	}

	resp, err := c.AnalyzeCode(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
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

// TestClaudeAnalyzeCode_SDKError verifies that SDK errors are propagated correctly.
func TestClaudeAnalyzeCode_SDKError(t *testing.T) {
	sdkErr := errors.New("network timeout")
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return nil, sdkErr
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error when SDK returns error, got nil")
	}
	if !strings.Contains(err.Error(), "Claude API call failed") {
		t.Errorf("error message %q should contain 'Claude API call failed'", err.Error())
	}
}

// TestClaudeAnalyzeCode_EmptyResponse verifies that an empty response results in an error.
func TestClaudeAnalyzeCode_EmptyResponse(t *testing.T) {
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(""), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
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

// TestClaudeAnalyzeCode_MalformedJSON verifies that malformed JSON results in an error.
func TestClaudeAnalyzeCode_MalformedJSON(t *testing.T) {
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(`{"issues": [`), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error on malformed JSON, got nil")
	}
	if !strings.Contains(err.Error(), "parse Claude response JSON") {
		t.Errorf("error message %q should contain 'parse Claude response JSON'", err.Error())
	}
}

// TestClaudeAnalyzeCode_StripJsonCodeFence verifies that ```json ... ``` fences are stripped.
func TestClaudeAnalyzeCode_StripJsonCodeFence(t *testing.T) {
	fencedJSON := "```json\n" + validClaudeResponseJSON + "\n```"
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(fencedJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	resp, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err != nil {
		t.Fatalf("expected no error when stripping ```json fence, got: %v", err)
	}
	if len(resp.Issues) != 1 {
		t.Errorf("expected 1 issue after stripping code fence, got %d", len(resp.Issues))
	}
}

// TestClaudeAnalyzeCode_StripPlainCodeFence verifies that plain ``` ... ``` fences are stripped.
func TestClaudeAnalyzeCode_StripPlainCodeFence(t *testing.T) {
	fencedJSON := "```\n" + validClaudeResponseJSON + "\n```"
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(fencedJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	resp, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err != nil {
		t.Fatalf("expected no error when stripping plain ``` fence, got: %v", err)
	}
	if len(resp.Issues) != 1 {
		t.Errorf("expected 1 issue after stripping code fence, got %d", len(resp.Issues))
	}
}

// TestClaudeAnalyzeCode_DefaultModelUsed verifies that the default Claude model is used when none specified.
func TestClaudeAnalyzeCode_DefaultModelUsed(t *testing.T) {
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if mock.capturedModel != defaultClaudeModel {
		t.Errorf("expected model %q, got %q", defaultClaudeModel, mock.capturedModel)
	}
}

// TestClaudeAnalyzeCode_CustomModelUsed verifies that a custom model is passed through.
func TestClaudeAnalyzeCode_CustomModelUsed(t *testing.T) {
	const customModel = "claude-haiku-4-5-20251001"

	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
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

// TestClaudeAnalyzeCode_PromptContainsProblemDescription verifies the prompt includes problem description.
func TestClaudeAnalyzeCode_PromptContainsProblemDescription(t *testing.T) {
	const problemDesc = "Implement a binary search tree insert method"

	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: problemDesc,
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(mock.capturedPrompt, problemDesc) {
		t.Errorf("prompt does not contain problem description %q", problemDesc)
	}
}

// TestClaudeAnalyzeCode_PromptContainsJSONSchemaInstructions verifies the prompt includes JSON schema instructions.
func TestClaudeAnalyzeCode_PromptContainsJSONSchemaInstructions(t *testing.T) {
	mock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	c := newClaudeClientWithCreator(mock)

	_, err := c.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The prompt should include JSON schema instructions telling Claude to output JSON
	if !strings.Contains(mock.capturedPrompt, "JSON") {
		t.Errorf("prompt does not contain JSON schema instructions")
	}
}

// TestClaudeDefaultModel_IsHaiku verifies that the default Claude model is claude-haiku-4-5-20251001.
func TestClaudeDefaultModel_IsHaiku(t *testing.T) {
	const wantModel = "claude-haiku-4-5-20251001"
	if defaultClaudeModel != wantModel {
		t.Errorf("defaultClaudeModel = %q, want %q", defaultClaudeModel, wantModel)
	}
}

// TestStripCodeFences verifies that the stripCodeFences helper handles various cases.
func TestStripCodeFences(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "plain JSON no fences",
			input: `{"key": "value"}`,
			want:  `{"key": "value"}`,
		},
		{
			name:  "json code fence",
			input: "```json\n{\"key\": \"value\"}\n```",
			want:  `{"key": "value"}`,
		},
		{
			name:  "plain code fence",
			input: "```\n{\"key\": \"value\"}\n```",
			want:  `{"key": "value"}`,
		},
		{
			name:  "whitespace trimmed",
			input: "  ```json\n{\"key\": \"value\"}\n```  ",
			want:  `{"key": "value"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripCodeFences(tt.input)
			if got != tt.want {
				t.Errorf("stripCodeFences(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// TestBuildJSONSchemaInstructions verifies the JSON schema instructions include key fields.
func TestBuildJSONSchemaInstructions(t *testing.T) {
	instructions := buildJSONSchemaInstructions()

	requiredFields := []string{
		"issues",
		"finished_student_ids",
		"summary",
		"title",
		"explanation",
		"student_ids",
		"severity",
		"error",
		"misconception",
		"style",
		"good-pattern",
	}

	for _, field := range requiredFields {
		if !strings.Contains(instructions, field) {
			t.Errorf("JSON schema instructions missing %q", field)
		}
	}
}
