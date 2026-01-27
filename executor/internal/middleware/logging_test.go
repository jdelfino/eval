package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLogger(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, nil))

	handler := Logger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	logOutput := buf.String()
	if !strings.Contains(logOutput, "http request") {
		t.Errorf("log output missing 'http request': %s", logOutput)
	}
	if !strings.Contains(logOutput, "GET") {
		t.Errorf("log output missing method: %s", logOutput)
	}
	if !strings.Contains(logOutput, "/test") {
		t.Errorf("log output missing path: %s", logOutput)
	}
}
