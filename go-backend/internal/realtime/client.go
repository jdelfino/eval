// Package realtime provides an HTTP client for the Centrifugo server API.
package realtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const defaultHTTPTimeout = 5 * time.Second

// Publisher sends events to Centrifugo channels via the HTTP API.
type Publisher interface {
	Publish(ctx context.Context, channel string, data any) error
}

// APIError represents a non-2xx response from the Centrifugo API.
type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("centrifugo API error: status %d, body: %s", e.StatusCode, e.Body)
}

// Client is an HTTP client for the Centrifugo server API.
type Client struct {
	apiURL     string
	apiKey     string
	httpClient *http.Client
	logger     *slog.Logger
}

// NewClient creates a new Centrifugo API client with a default 5-second timeout.
func NewClient(apiURL, apiKey string, logger *slog.Logger) *Client {
	return &Client{
		apiURL:     apiURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: defaultHTTPTimeout},
		logger:     logger,
	}
}

type publishRequest struct {
	Channel string `json:"channel"`
	Data    any    `json:"data"`
}

// Publish sends data to the specified Centrifugo channel.
func (c *Client) Publish(ctx context.Context, channel string, data any) error {
	payload, err := json.Marshal(publishRequest{Channel: channel, Data: data})
	if err != nil {
		return fmt.Errorf("marshaling publish request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL+"/api/publish", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("executing request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		c.logger.Error("centrifugo API error", "status", resp.StatusCode, "body", string(body))
		return &APIError{
			StatusCode: resp.StatusCode,
			Body:       string(body),
		}
	}

	return nil
}
