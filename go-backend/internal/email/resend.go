// Package email provides email delivery via the Resend API.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
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

// NewResendClient creates a new ResendClient with the given API key and sender address.
func NewResendClient(apiKey, fromEmail string) *ResendClient {
	return &ResendClient{
		apiKey:     apiKey,
		httpClient: http.DefaultClient,
		fromEmail:  fromEmail,
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
		HTML: fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">Coding Assignment Platform</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#1e293b;">You&#39;ve been invited to %s</h1>
              <p style="margin:0 0 24px 0;font-size:15px;color:#475569;line-height:1.6;">
                %s has invited you to join <strong>%s</strong> on the Coding Assignment Platform.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background-color:#4f46e5;">
                    <a href="%s" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Get Started</a>
                  </td>
                </tr>
              </table>
              <!-- Footer -->
              <p style="margin:24px 0 0 0;font-size:13px;color:#94a3b8;">
                This invitation expires in 7 days.
              </p>
              <p style="margin:8px 0 0 0;font-size:12px;color:#cbd5e1;">Coding Assignment Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
			html.EscapeString(namespaceName),
			html.EscapeString(inviterName), html.EscapeString(namespaceName),
			html.EscapeString(acceptURL),
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
	defer resp.Body.Close() //nolint:errcheck

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
