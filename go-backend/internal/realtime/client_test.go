package realtime_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"log/slog"
	"testing"
	"time"

	"github.com/jdelfino/eval/go-backend/internal/realtime"
)

var testLogger = slog.Default()

func TestPublish_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/publish" {
			t.Errorf("expected /api/publish, got %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "apikey test-key" {
			t.Errorf("expected 'apikey test-key', got %q", got)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected application/json content-type, got %q", ct)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("reading body: %v", err)
		}
		var payload struct {
			Channel string          `json:"channel"`
			Data    json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("unmarshaling body: %v", err)
		}
		if payload.Channel != "session:abc" {
			t.Errorf("expected channel session:abc, got %s", payload.Channel)
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	client := realtime.NewClient(srv.URL, "test-key", testLogger)
	err := client.Publish(context.Background(), "session:abc", map[string]string{"type": "student_joined"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPublish_ArbitraryData(t *testing.T) {
	var received json.RawMessage

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload struct {
			Channel string          `json:"channel"`
			Data    json.RawMessage `json:"data"`
		}
		_ = json.Unmarshal(body, &payload)
		received = payload.Data
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := realtime.NewClient(srv.URL, "test-key", testLogger)

	type nested struct {
		Count int      `json:"count"`
		Tags  []string `json:"tags"`
	}
	data := nested{Count: 42, Tags: []string{"a", "b"}}

	if err := client.Publish(context.Background(), "ch", data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var got nested
	if err := json.Unmarshal(received, &got); err != nil {
		t.Fatalf("unmarshaling received data: %v", err)
	}
	if got.Count != 42 || len(got.Tags) != 2 {
		t.Errorf("data mismatch: %+v", got)
	}
}

func TestPublish_4xxError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"bad request"}`))
	}))
	defer srv.Close()

	client := realtime.NewClient(srv.URL, "test-key", testLogger)
	err := client.Publish(context.Background(), "ch", "data")
	if err == nil {
		t.Fatal("expected error for 4xx response")
	}

	var apiErr *realtime.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *realtime.APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", apiErr.StatusCode)
	}
}

func TestPublish_5xxError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"internal"}`))
	}))
	defer srv.Close()

	client := realtime.NewClient(srv.URL, "test-key", testLogger)
	err := client.Publish(context.Background(), "ch", "data")
	if err == nil {
		t.Fatal("expected error for 5xx response")
	}

	var apiErr *realtime.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *realtime.APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", apiErr.StatusCode)
	}
}

func TestPublish_ContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := realtime.NewClient(srv.URL, "test-key", testLogger)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := client.Publish(ctx, "ch", "data")
	if err == nil {
		t.Fatal("expected error for cancelled context")
	}
}

func TestPublish_InvalidURL(t *testing.T) {
	client := realtime.NewClient("http://invalid.localhost:0", "key", testLogger)
	err := client.Publish(context.Background(), "ch", "data")
	if err == nil {
		t.Fatal("expected error for invalid URL")
	}
}

func TestPublish_MarshalError(t *testing.T) {
	client := realtime.NewClient("http://localhost", "key", testLogger)
	// Channels (chan int) cannot be marshaled to JSON.
	err := client.Publish(context.Background(), "ch", make(chan int))
	if err == nil {
		t.Fatal("expected error for unmarshalable data")
	}
}

func TestAPIError_Error(t *testing.T) {
	apiErr := &realtime.APIError{
		StatusCode: 500,
		Body:       `{"error":"internal"}`,
	}
	msg := apiErr.Error()
	if msg == "" {
		t.Fatal("expected non-empty error message")
	}
}

func TestPublish_DrainsResponseBodyOnSuccess(t *testing.T) {
	// Track whether the response body was fully read (drained) before Close.
	// If the body is not drained, HTTP transport cannot reuse the connection.
	bodyDrained := false

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result":{}}`))
	}))
	defer srv.Close()

	// Wrap the default transport to intercept responses and track body reads.
	client := realtime.NewClient(srv.URL, "test-key", testLogger)
	realtime.SetHTTPClient(client, &http.Client{
		Transport: &bodyTrackingTransport{
			base:      http.DefaultTransport,
			onDrained: func() { bodyDrained = true },
		},
	})

	err := client.Publish(context.Background(), "ch", "data")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bodyDrained {
		t.Error("response body was not drained before close; connection cannot be reused")
	}
}

// bodyTrackingTransport wraps an http.RoundTripper to detect whether the
// response body is fully read before being closed.
type bodyTrackingTransport struct {
	base      http.RoundTripper
	onDrained func()
}

func (t *bodyTrackingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	resp.Body = &drainingChecker{inner: resp.Body, onDrained: t.onDrained}
	return resp, nil
}

// drainingChecker wraps an io.ReadCloser and calls onDrained if the reader
// returns io.EOF (meaning it was fully consumed) before Close is called.
type drainingChecker struct {
	inner     io.ReadCloser
	onDrained func()
	hitEOF    bool
}

func (d *drainingChecker) Read(p []byte) (int, error) {
	n, err := d.inner.Read(p)
	if err == io.EOF {
		d.hitEOF = true
		if d.onDrained != nil {
			d.onDrained()
		}
	}
	return n, err
}

func (d *drainingChecker) Close() error {
	return d.inner.Close()
}

// Verify Client implements Publisher at compile time.
var _ realtime.Publisher = (*realtime.Client)(nil)
