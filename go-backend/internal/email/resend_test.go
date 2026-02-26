package email

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendInvitation_EscapesHTML(t *testing.T) {
	var captured resendRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Fatalf("unmarshal request body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := &ResendClient{
		apiKey:     "test-key",
		httpClient: srv.Client(),
		fromEmail:  "test@example.com",
	}
	// Override the URL by using a custom HTTP client that rewrites the host.
	// Simpler: just point httpClient at our test server by overriding transport.
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			req.URL.Scheme = "http"
			req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
			return http.DefaultTransport.RoundTrip(req)
		}),
	}

	err := client.SendInvitation(context.Background(),
		"victim@example.com",
		`<script>alert("xss")</script>`,
		`<img src=x onerror=alert(1)>`,
		`https://example.com/accept?t=1&u=2"onmouseover="alert(1)`,
	)
	if err != nil {
		t.Fatalf("SendInvitation returned error: %v", err)
	}

	// Verify no unescaped HTML in the body
	if strings.Contains(captured.HTML, "<script>") {
		t.Errorf("HTML contains unescaped <script> tag: %s", captured.HTML)
	}
	if strings.Contains(captured.HTML, "<img") {
		t.Errorf("HTML contains unescaped <img> tag: %s", captured.HTML)
	}
	if strings.Contains(captured.HTML, `"onmouseover"`) {
		t.Errorf("HTML contains unescaped attribute injection: %s", captured.HTML)
	}

	// Verify escaped versions are present
	if !strings.Contains(captured.HTML, "&lt;script&gt;") {
		t.Errorf("expected escaped script tag in HTML: %s", captured.HTML)
	}
}

func TestSendInvitation_BrandedTemplate(t *testing.T) {
	var captured resendRequest

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Fatalf("unmarshal request body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := &ResendClient{
		apiKey:    "test-key",
		fromEmail: "test@example.com",
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				req.URL.Scheme = "http"
				req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
				return http.DefaultTransport.RoundTrip(req)
			}),
		},
	}

	err := client.SendInvitation(context.Background(),
		"student@example.com",
		"Alice",
		"CS 101",
		"https://example.com/invite/accept?token=abc123",
	)
	if err != nil {
		t.Fatalf("SendInvitation returned error: %v", err)
	}

	html := captured.HTML

	// Indigo gradient header must be present
	if !strings.Contains(html, "#4f46e5") {
		t.Errorf("expected indigo color #4f46e5 in HTML: %s", html)
	}
	if !strings.Contains(html, "#6366f1") {
		t.Errorf("expected indigo color #6366f1 in HTML: %s", html)
	}
	if !strings.Contains(html, "Eval Platform") {
		t.Errorf("expected 'Eval Platform' branding in HTML: %s", html)
	}

	// Heading should reference the namespace name
	if !strings.Contains(html, "You&#39;ve been invited to") || !strings.Contains(html, "CS 101") {
		// Either escaped or unescaped heading with namespace name is acceptable
		if !strings.Contains(html, "invited to") || !strings.Contains(html, "CS 101") {
			t.Errorf("expected invitation heading with namespace 'CS 101' in HTML: %s", html)
		}
	}

	// Body should mention inviter name and namespace
	if !strings.Contains(html, "Alice") {
		t.Errorf("expected inviter name 'Alice' in HTML: %s", html)
	}
	if !strings.Contains(html, "CS 101") {
		t.Errorf("expected namespace 'CS 101' in HTML: %s", html)
	}

	// CTA button must say "Get Started" (not "Accept Invitation")
	if !strings.Contains(html, "Get Started") {
		t.Errorf("expected CTA button text 'Get Started' in HTML: %s", html)
	}
	if strings.Contains(html, "Accept Invitation") {
		t.Errorf("old CTA text 'Accept Invitation' should not appear in HTML: %s", html)
	}

	// No password mention
	if strings.Contains(strings.ToLower(html), "password") {
		t.Errorf("HTML should not mention 'password': %s", html)
	}

	// Footer expiry text
	if !strings.Contains(html, "expires in 7 days") {
		t.Errorf("expected footer expiry text in HTML: %s", html)
	}

	// Accept URL must be present
	if !strings.Contains(html, "https://example.com/invite/accept?token=abc123") {
		t.Errorf("expected acceptURL in HTML: %s", html)
	}

	// Subject line unchanged
	if captured.Subject != "You've been invited to CS 101" {
		t.Errorf("unexpected subject %q", captured.Subject)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
