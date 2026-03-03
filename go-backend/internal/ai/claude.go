package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

const defaultClaudeModel = "claude-haiku-4-5-20251001"

// messageCreator is a thin interface around the Anthropic SDK's Messages.New call.
// It exists so that AnalyzeCode can be unit-tested without making real network calls.
type messageCreator interface {
	New(ctx context.Context, params anthropic.MessageNewParams) (*anthropic.Message, error)
}

// anthropicMessagesAdapter wraps the Anthropic SDK's MessageService to satisfy messageCreator.
type anthropicMessagesAdapter struct {
	svc *anthropic.MessageService
}

func (a *anthropicMessagesAdapter) New(ctx context.Context, params anthropic.MessageNewParams) (*anthropic.Message, error) {
	return a.svc.New(ctx, params)
}

// ClaudeClient implements Client using the Anthropic Claude API.
type ClaudeClient struct {
	creator messageCreator
}

// NewClaudeClient creates a new ClaudeClient with the given API key.
// Returns an error if the API key is empty.
func NewClaudeClient(apiKey string) (*ClaudeClient, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("ai: ANTHROPIC_API_KEY is required")
	}
	client := anthropic.NewClient(option.WithAPIKey(apiKey))
	return &ClaudeClient{creator: &anthropicMessagesAdapter{svc: &client.Messages}}, nil
}

// newClaudeClientWithCreator creates a ClaudeClient using the provided messageCreator.
// This is intended for use in tests to inject a mock implementation.
func newClaudeClientWithCreator(creator messageCreator) *ClaudeClient {
	return &ClaudeClient{creator: creator}
}

// AnalyzeCode sends student submissions to Claude for analysis and returns structured results.
func (c *ClaudeClient) AnalyzeCode(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	model := req.Model
	if model == "" {
		model = defaultClaudeModel
	}

	customDirections := req.CustomPrompt
	if customDirections == "" {
		customDirections = DefaultCustomDirections
	}

	prompt := BuildPrompt(req.ProblemDescription, req.Submissions, customDirections)

	// Append JSON schema instructions since Claude lacks Gemini's native ResponseSchema
	fullPrompt := prompt + "\n\n" + buildJSONSchemaInstructions()

	result, err := c.creator.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(model),
		MaxTokens: 4096,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(fullPrompt)),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("ai: Claude API call failed: %w", err)
	}

	// Extract text from the response
	var rawText string
	for _, block := range result.Content {
		if block.Type == "text" {
			rawText += block.Text
		}
	}

	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return nil, fmt.Errorf("ai: Claude returned empty response")
	}

	// Strip code fences that Claude sometimes wraps JSON in
	rawJSON := stripCodeFences(rawText)

	var resp AnalyzeResponse
	if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
		return nil, fmt.Errorf("ai: failed to parse Claude response JSON: %w", err)
	}

	validateResponse(&resp)
	return &resp, nil
}

// GenerateSolution calls Claude to generate a complete solution for a programming problem.
// It returns the raw code with code fences stripped. The response is plain code, not JSON.
func (c *ClaudeClient) GenerateSolution(ctx context.Context, req GenerateSolutionRequest) (*GenerateSolutionResponse, error) {
	var sb strings.Builder
	sb.WriteString("You are an expert programmer. Given a programming problem description and optional starter code, generate a complete, correct Python solution. Return ONLY the code — no explanation, no markdown fences.\n\n")
	sb.WriteString("## Problem Description\n\n")
	sb.WriteString(req.ProblemDescription)
	sb.WriteString("\n\n")
	if req.StarterCode != "" {
		sb.WriteString("## Starter Code\n\n")
		sb.WriteString(req.StarterCode)
		sb.WriteString("\n\n")
	}
	if req.CustomInstructions != "" {
		sb.WriteString("\n\nAdditional constraints:\n")
		sb.WriteString(req.CustomInstructions)
	}

	result, err := c.creator.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(defaultClaudeModel),
		MaxTokens: 4096,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(sb.String())),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("ai: Claude API call failed: %w", err)
	}

	var rawText string
	for _, block := range result.Content {
		if block.Type == "text" {
			rawText += block.Text
		}
	}

	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return nil, fmt.Errorf("ai: Claude returned empty response")
	}

	solution := stripCodeFences(rawText)
	return &GenerateSolutionResponse{Solution: solution}, nil
}

// stripCodeFences removes markdown code fences from the input string.
// Handles bare ```, language-tagged fences like ```json, ```python, etc.
// Claude sometimes wraps output in code fences even when asked not to.
func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		// Strip the opening fence line (including any language tag)
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		} else {
			s = strings.TrimPrefix(s, "```")
		}
		s = strings.TrimSuffix(s, "```")
		return strings.TrimSpace(s)
	}
	return s
}

// buildJSONSchemaInstructions returns text instructions describing the JSON schema
// Claude should output. This is the text equivalent of buildResponseSchema() in
// gemini.go. Both must stay in sync with the AnalyzeResponse type in client.go.
func buildJSONSchemaInstructions() string {
	return `Respond with ONLY valid JSON matching this exact schema (no markdown, no code fences, no explanation):

{
  "issues": [
    {
      "title": string,
      "explanation": string,
      "count": integer,
      "student_ids": [string],
      "representative_student_id": string,
      "representative_student_label": string,
      "severity": "error" | "misconception" | "style" | "good-pattern"
    }
  ],
  "overall_note": string,
  "summary": {
    "total_submissions": integer,
    "filtered_out": integer,
    "analyzed_submissions": integer,
    "completion_estimate": {
      "finished": integer,
      "in_progress": integer,
      "not_started": integer
    },
    "warning": string
  }
}

Required fields: issues, summary (with total_submissions, filtered_out, analyzed_submissions, completion_estimate).
Each issue must have: title, explanation, count, student_ids, representative_student_id, representative_student_label, severity.
severity must be one of: error, misconception, style, good-pattern.`
}
