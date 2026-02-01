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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
