package ai

import (
	"context"
	"testing"
)

func TestStubClient_AnalyzeCode(t *testing.T) {
	client := &StubClient{}
	resp, err := client.AnalyzeCode(context.Background(), AnalyzeRequest{
		Code:               "print('hello')",
		ProblemDescription: "Print hello",
		Language:           "python",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Analysis == "" {
		t.Fatal("expected non-empty analysis")
	}
	if resp.Suggestions == nil {
		t.Fatal("expected non-nil suggestions slice")
	}
}
