// Package email provides email delivery via the Resend API.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Client is the interface for sending invitation emails.
type Client interface {
	SendInvitation(ctx context.Context, to, inviterName, namespaceName, acceptURL string) error
}

// ResendClient sends emails via the Resend HTTP API.
type ResendClient struct {
	apiKey     string
	httpClient *http.Client
	fromEmail  string
}

// NewResendClient creates a new ResendClient with the given API key.
func NewResendClient(apiKey string) *ResendClient {
	return &ResendClient{
		apiKey:     apiKey,
		httpClient: http.DefaultClient,
		fromEmail:  "noreply@eval.dev",
	}
}

type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// SendInvitation sends an invitation email via the Resend API.
func (c *ResendClient) SendInvitation(ctx context.Context, to, inviterName, namespaceName, acceptURL string) error {
	body := resendRequest{
		From:    c.fromEmail,
		To:      []string{to},
		Subject: fmt.Sprintf("You've been invited to %s", namespaceName),
		HTML: fmt.Sprintf(
			`<p>%s has invited you to join <strong>%s</strong>.</p>`+
				`<p><a href="%s">Accept Invitation</a></p>`+
				`<p>This invitation will expire in 7 days.</p>`,
			inviterName, namespaceName, acceptURL,
		),
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal email request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("create email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend API error: status %d", resp.StatusCode)
	}

	return nil
}

// NoOpClient is an email client that does nothing. Used for testing/dev.
type NoOpClient struct{}

// SendInvitation is a no-op.
func (NoOpClient) SendInvitation(_ context.Context, _, _, _, _ string) error {
	return nil
}
