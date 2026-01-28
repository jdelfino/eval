package httpmiddleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	io_prometheus_client "github.com/prometheus/client_model/go"
)

func newTestMetrics(t *testing.T) *HTTPMetrics {
	t.Helper()
	reg := prometheus.NewRegistry()
	return NewHTTPMetrics(reg)
}

func TestHTTPMetrics_CountsRequests(t *testing.T) {
	m := newTestMetrics(t)

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/test", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	pm := &io_prometheus_client.Metric{}
	counter, err := m.RequestsTotal.GetMetricWithLabelValues("GET", "/test", "200")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := counter.(prometheus.Metric).Write(pm); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := pm.GetCounter().GetValue(); got != 1 {
		t.Errorf("http_requests_total = %v, want 1", got)
	}
}

func TestHTTPMetrics_RecordsDuration(t *testing.T) {
	m := newTestMetrics(t)

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/slow", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/slow", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	pm := &io_prometheus_client.Metric{}
	observer, err := m.RequestDuration.GetMetricWithLabelValues("GET", "/slow")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := observer.(prometheus.Metric).Write(pm); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := pm.GetHistogram().GetSampleCount(); got != 1 {
		t.Errorf("histogram sample count = %d, want 1", got)
	}
}

func TestHTTPMetrics_TracksStatusCodes(t *testing.T) {
	m := newTestMetrics(t)

	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/err", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	req := httptest.NewRequest(http.MethodGet, "/err", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}

	pm := &io_prometheus_client.Metric{}
	counter, err := m.RequestsTotal.GetMetricWithLabelValues("GET", "/err", "500")
	if err != nil {
		t.Fatalf("getting metric: %v", err)
	}
	if err := counter.(prometheus.Metric).Write(pm); err != nil {
		t.Fatalf("writing metric: %v", err)
	}
	if got := pm.GetCounter().GetValue(); got != 1 {
		t.Errorf("http_requests_total{status=500} = %v, want 1", got)
	}
}

func TestNewHTTPMetricsNoop(t *testing.T) {
	m := NewHTTPMetricsNoop()
	if m == nil {
		t.Fatal("NewHTTPMetricsNoop returned nil")
	}
	// Should not panic when used
	m.RequestsTotal.WithLabelValues("GET", "/test", "200").Inc()
	m.RequestDuration.WithLabelValues("GET", "/test").Observe(0.1)
}
