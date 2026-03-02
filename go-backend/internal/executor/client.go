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

	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"github.com/jdelfino/eval/pkg/executorapi"
)

// StatusError is returned when the executor responds with a non-200 status code.
// Callers can use errors.As to inspect the status and propagate it (e.g. 429).
type StatusError struct {
	Code int
	Body string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("executor: unexpected status %d: %s", e.Code, e.Body)
}

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

// ExecuteRequest is an alias for the shared request type.
type ExecuteRequest = executorapi.ExecuteRequest

// File is an alias for the shared file type.
type File = executorapi.File

// ExecuteResponse is an alias for the shared response type.
type ExecuteResponse = executorapi.ExecuteResponse

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
	if reqID := chimiddleware.GetReqID(ctx); reqID != "" {
		httpReq.Header.Set("X-Request-ID", reqID)
	}
	// Propagate trace context to the executor service for distributed tracing.
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(httpReq.Header))

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("executor: send request: %w", err)
	}
	defer func() { _ = httpResp.Body.Close() }()

	// Limit response body to 5MB to prevent OOM from malformed responses.
	respBody, err := io.ReadAll(io.LimitReader(httpResp.Body, 5<<20))
	if err != nil {
		return nil, fmt.Errorf("executor: read response: %w", err)
	}

	if httpResp.StatusCode != http.StatusOK {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, &StatusError{Code: httpResp.StatusCode, Body: snippet}
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

// TraceRequest is an alias for the shared trace request type.
type TraceRequest = executorapi.TraceRequest

// TraceResponse is an alias for the shared trace response type.
type TraceResponse = executorapi.TraceResponse

// TraceStep is an alias for the shared trace step type.
type TraceStep = executorapi.TraceStep

// CallFrame is an alias for the shared call frame type.
type CallFrame = executorapi.CallFrame

// Trace sends code to the executor service for step-through debugger tracing.
func (c *Client) Trace(ctx context.Context, req TraceRequest) (*TraceResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("executor: marshal trace request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/trace", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("executor: create trace request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if reqID := chimiddleware.GetReqID(ctx); reqID != "" {
		httpReq.Header.Set("X-Request-ID", reqID)
	}
	// Propagate trace context to the executor service for distributed tracing.
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(httpReq.Header))

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("executor: send trace request: %w", err)
	}
	defer func() { _ = httpResp.Body.Close() }()

	respBody, err := io.ReadAll(io.LimitReader(httpResp.Body, 5<<20))
	if err != nil {
		return nil, fmt.Errorf("executor: read trace response: %w", err)
	}

	if httpResp.StatusCode != http.StatusOK {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, &StatusError{Code: httpResp.StatusCode, Body: snippet}
	}

	var resp TraceResponse
	if err := json.Unmarshal(respBody, &resp); err != nil {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("executor: decode trace response: %w (body: %s)", err, snippet)
	}

	return &resp, nil
}
