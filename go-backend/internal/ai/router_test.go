package ai

import (
	"context"
	"strings"
	"testing"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"google.golang.org/genai"
)

// TestRouterClient_RoutesClaude verifies that claude-* models route to ClaudeClient.
func TestRouterClient_RoutesClaude(t *testing.T) {
	claudeMock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}
	geminiMock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			t.Error("Gemini should not be called when model is claude-*")
			return nil, nil
		},
	}

	claudeClient := newClaudeClientWithCreator(claudeMock)
	geminiClient := newGeminiClientWithGenerator(geminiMock)
	router := NewRouterClient(geminiClient, claudeClient)

	resp, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		Model:              "claude-haiku-4-5-20251001",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response, got nil")
	}
}

// TestRouterClient_RoutesGemini verifies that non-claude models route to GeminiClient.
func TestRouterClient_RoutesGemini(t *testing.T) {
	claudeMock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			t.Error("Claude should not be called when model is gemini-*")
			return nil, nil
		},
	}
	geminiMock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	claudeClient := newClaudeClientWithCreator(claudeMock)
	geminiClient := newGeminiClientWithGenerator(geminiMock)
	router := NewRouterClient(geminiClient, claudeClient)

	resp, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		Model:              "gemini-2.5-flash-lite",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response, got nil")
	}
}

// TestRouterClient_DefaultRoutesToGemini verifies that an empty model routes to Gemini.
func TestRouterClient_DefaultRoutesToGemini(t *testing.T) {
	claudeMock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			t.Error("Claude should not be called for empty model")
			return nil, nil
		},
	}
	geminiMock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	claudeClient := newClaudeClientWithCreator(claudeMock)
	geminiClient := newGeminiClientWithGenerator(geminiMock)
	router := NewRouterClient(geminiClient, claudeClient)

	resp, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		// Model empty — should route to Gemini
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response, got nil")
	}
}

// TestRouterClient_ErrorWhenClaudeNilButClaudeRequested verifies error when Claude is nil but requested.
func TestRouterClient_ErrorWhenClaudeNilButClaudeRequested(t *testing.T) {
	geminiMock := &mockContentGenerator{
		fn: func(_ context.Context, _ string, _ []*genai.Content, _ *genai.GenerateContentConfig) (*genai.GenerateContentResponse, error) {
			return makeTextResponse(validAnalyzeResponseJSON), nil
		},
	}

	geminiClient := newGeminiClientWithGenerator(geminiMock)
	router := NewRouterClient(geminiClient, nil) // claude is nil

	_, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		Model:              "claude-haiku-4-5-20251001",
	})

	if err == nil {
		t.Fatal("expected error when Claude is nil but claude model requested")
	}
	if !strings.Contains(err.Error(), "Claude") {
		t.Errorf("error message %q should mention 'Claude'", err.Error())
	}
}

// TestRouterClient_ErrorWhenGeminiNilButGeminiRequested verifies error when Gemini is nil but requested.
func TestRouterClient_ErrorWhenGeminiNilButGeminiRequested(t *testing.T) {
	claudeMock := &mockMessageCreator{
		fn: func(_ context.Context, _ anthropic.MessageNewParams) (*anthropic.Message, error) {
			return makeClaudeTextResponse(validClaudeResponseJSON), nil
		},
	}

	claudeClient := newClaudeClientWithCreator(claudeMock)
	router := NewRouterClient(nil, claudeClient) // gemini is nil

	_, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
		Model:              "gemini-2.5-flash",
	})

	if err == nil {
		t.Fatal("expected error when Gemini is nil but gemini model requested")
	}
	if !strings.Contains(err.Error(), "Gemini") {
		t.Errorf("error message %q should mention 'Gemini'", err.Error())
	}
}

// TestRouterClient_BothNilReturnsError verifies that both nil returns an error.
func TestRouterClient_BothNilReturnsError(t *testing.T) {
	router := NewRouterClient(nil, nil)

	_, err := router.AnalyzeCode(context.Background(), AnalyzeRequest{
		ProblemDescription: "Test",
		Submissions:        []StudentSubmission{{UserID: "u1", Name: "Alice", Code: "x=1"}},
	})

	if err == nil {
		t.Fatal("expected error when both clients are nil")
	}
}
