package ai

import (
	"context"
	"fmt"
	"strings"
)

// RouterClient implements Client and routes requests to GeminiClient or ClaudeClient
// based on the model name prefix. Models prefixed with "claude-" are routed to Claude;
// all other models are routed to Gemini.
//
// Either client can be nil; if a request targets a nil client, an error is returned.
type RouterClient struct {
	gemini *GeminiClient
	claude *ClaudeClient
}

// NewRouterClient creates a RouterClient. Either gemini or claude may be nil if
// that provider is not configured; requests to a nil provider return a descriptive error.
func NewRouterClient(gemini *GeminiClient, claude *ClaudeClient) *RouterClient {
	return &RouterClient{gemini: gemini, claude: claude}
}

// AnalyzeCode routes the request to the appropriate AI client based on the model name.
// Models with "claude-" prefix are routed to the ClaudeClient; all others go to GeminiClient.
func (r *RouterClient) AnalyzeCode(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error) {
	if strings.HasPrefix(req.Model, "claude-") {
		if r.claude == nil {
			return nil, fmt.Errorf("ai: Claude provider is not configured (ANTHROPIC_API_KEY missing); cannot use model %q", req.Model)
		}
		return r.claude.AnalyzeCode(ctx, req)
	}

	// Default to Gemini for all non-claude models (including empty model)
	if r.gemini == nil {
		return nil, fmt.Errorf("ai: Gemini provider is not configured (GEMINI_API_KEY missing); cannot use model %q", req.Model)
	}
	return r.gemini.AnalyzeCode(ctx, req)
}
