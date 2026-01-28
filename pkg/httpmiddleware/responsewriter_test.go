package httpmiddleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResponseWriterCapturesStatus(t *testing.T) {
	rw := NewResponseWriter(httptest.NewRecorder())
	rw.WriteHeader(http.StatusNotFound)

	if rw.Status != http.StatusNotFound {
		t.Errorf("status = %d, want %d", rw.Status, http.StatusNotFound)
	}

	// Second call should not change status
	rw.WriteHeader(http.StatusOK)
	if rw.Status != http.StatusNotFound {
		t.Errorf("status changed to %d after second WriteHeader", rw.Status)
	}
}

func TestResponseWriterDefaultStatus(t *testing.T) {
	rw := NewResponseWriter(httptest.NewRecorder())
	_, _ = rw.Write([]byte("hello"))

	if rw.Status != http.StatusOK {
		t.Errorf("status = %d, want %d", rw.Status, http.StatusOK)
	}
}
