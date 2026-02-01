// Package ai provides an interface and implementations for AI-powered code analysis.
package ai

import (
	"context"
	"fmt"
)

// AnalyzeRequest contains the input for AI code analysis.
type AnalyzeRequest struct {
	Code               string `json:"code"`
	ProblemDescription string `json:"problem_description"`
	Language           string `json:"language"`
}

// AnalyzeResponse contains the result of AI code analysis.
type AnalyzeResponse struct {
	Analysis    string   `json:"analysis"`
	Suggestions []string `json:"suggestions"`
}

// Client is the interface for AI code analysis.
type Client interface {
	AnalyzeCode(ctx context.Context, req AnalyzeRequest) (*AnalyzeResponse, error)
}

// StubClient is a no-op implementation of Client for testing and development.
type StubClient struct{}

// AnalyzeCode returns a stub response indicating AI analysis is not configured.
func (s *StubClient) AnalyzeCode(_ context.Context, _ AnalyzeRequest) (*AnalyzeResponse, error) {
	return &AnalyzeResponse{
		Analysis:    "AI analysis is not configured. Please set up an AI provider.",
		Suggestions: []string{},
	}, nil
}

// ErrNotConfigured is returned when the AI client is not configured.
var ErrNotConfigured = fmt.Errorf("ai: client not configured")
