package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	io_prometheus_client "github.com/prometheus/client_model/go"
)

func TestMetrics_CountsRequests(t *testing.T) {
	// Reset metrics for this test
	HTTPRequestsTotal.Reset()
	HTTPRequestDuration.Reset()

	r := chi.NewRouter()
	r.Use(Metrics)
	r.Get("/test", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	// Verify counter was incremented
	m := &io_prometheus_client.Metric{}
	counter, err := HTTPRequestsTotal.GetMetricWithLabelValues("GET", "/test", "200")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := counter.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := m.GetCounter().GetValue(); got != 1 {
		t.Errorf("http_requests_total = %v, want 1", got)
	}
}

func TestMetrics_RecordsDuration(t *testing.T) {
	HTTPRequestsTotal.Reset()
	HTTPRequestDuration.Reset()

	r := chi.NewRouter()
	r.Use(Metrics)
	r.Get("/slow", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/slow", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	// Verify histogram was observed
	m := &io_prometheus_client.Metric{}
	observer, err := HTTPRequestDuration.GetMetricWithLabelValues("GET", "/slow")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := observer.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := m.GetHistogram().GetSampleCount(); got != 1 {
		t.Errorf("histogram sample count = %d, want 1", got)
	}
}

func TestMetrics_TracksStatusCodes(t *testing.T) {
	HTTPRequestsTotal.Reset()
	HTTPRequestDuration.Reset()

	r := chi.NewRouter()
	r.Use(Metrics)
	r.Get("/err", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	req := httptest.NewRequest(http.MethodGet, "/err", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}

	m := &io_prometheus_client.Metric{}
	counter, err := HTTPRequestsTotal.GetMetricWithLabelValues("GET", "/err", "500")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := counter.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := m.GetCounter().GetValue(); got != 1 {
		t.Errorf("http_requests_total{status=500} = %v, want 1", got)
	}
}
