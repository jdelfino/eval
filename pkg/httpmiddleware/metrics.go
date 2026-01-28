package httpmiddleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

// HTTPMetrics holds Prometheus metrics for HTTP request instrumentation.
type HTTPMetrics struct {
	RequestsTotal   *prometheus.CounterVec
	RequestDuration *prometheus.HistogramVec
}

// NewHTTPMetrics creates and registers HTTP metrics with the given registerer.
func NewHTTPMetrics(reg prometheus.Registerer) *HTTPMetrics {
	m := &HTTPMetrics{
		RequestsTotal: prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "http_requests_total",
				Help: "Total number of HTTP requests.",
			},
			[]string{"method", "path", "status"},
		),
		RequestDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "http_request_duration_seconds",
				Help:    "HTTP request duration in seconds.",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"method", "path"},
		),
	}

	reg.MustRegister(m.RequestsTotal, m.RequestDuration)

	return m
}

// NewHTTPMetricsNoop creates HTTP metrics that discard all observations. Use in tests.
func NewHTTPMetricsNoop() *HTTPMetrics {
	return NewHTTPMetrics(noopRegisterer{})
}

// noopRegisterer discards all registrations.
type noopRegisterer struct{}

func (noopRegisterer) Register(prometheus.Collector) error  { return nil }
func (noopRegisterer) MustRegister(...prometheus.Collector) {}
func (noopRegisterer) Unregister(prometheus.Collector) bool { return true }

// Middleware returns an HTTP middleware that records request metrics.
func (m *HTTPMetrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := NewResponseWriter(w)

		next.ServeHTTP(wrapped, r)

		// Use the chi route pattern if available, otherwise the raw path.
		path := chi.RouteContext(r.Context()).RoutePattern()
		if path == "" {
			path = r.URL.Path
		}

		status := strconv.Itoa(wrapped.Status)
		method := r.Method

		m.RequestsTotal.WithLabelValues(method, path, status).Inc()
		m.RequestDuration.WithLabelValues(method, path).Observe(time.Since(start).Seconds())
	})
}
