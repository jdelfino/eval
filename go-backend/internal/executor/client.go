// Package executor provides an HTTP client for the code execution service.
package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client communicates with the executor service over HTTP.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new executor client with the given base URL and timeout.
func NewClient(baseURL string, timeout time.Duration) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// ExecuteRequest is the payload sent to the executor service.
type ExecuteRequest struct {
	Code       string `json:"code"`
	Stdin      string `json:"stdin,omitempty"`
	Files      []File `json:"files,omitempty"`
	RandomSeed *int   `json:"random_seed,omitempty"`
	TimeoutMs  int    `json:"timeout_ms,omitempty"`
}

// File represents an auxiliary file provided to the execution environment.
type File struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ExecuteResponse is the response from the executor service.
type ExecuteResponse struct {
	Success         bool   `json:"success"`
	Output          string `json:"output"`
	Error           string `json:"error"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
	Stdin           string `json:"stdin,omitempty"`
}

// Execute sends code to the executor service and returns the result.
func (c *Client) Execute(ctx context.Context, req ExecuteRequest) (*ExecuteResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("executor: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/execute", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("executor: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("executor: send request: %w", err)
	}
	defer func() { _ = httpResp.Body.Close() }()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("executor: read response: %w", err)
	}

	if httpResp.StatusCode != http.StatusOK {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("executor: unexpected status %d: %s", httpResp.StatusCode, snippet)
	}

	var resp ExecuteResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("executor: decode response: %w (body: %s)", err, snippet)
	}

	return &resp, nil
}
