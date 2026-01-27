// Package metrics provides Prometheus metric definitions for the executor service.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
)

// Metrics holds all Prometheus metrics for the executor service.
type Metrics struct {
	ExecutionsTotal        *prometheus.CounterVec
	ValidationErrorsTotal  *prometheus.CounterVec
	ExecutionDuration      prometheus.Histogram
	CodeSizeBytes          prometheus.Histogram
	ActiveExecutions       prometheus.Gauge
	Ready                  prometheus.Gauge
}

// NewNoop creates metrics that discard all observations. Use in tests.
func NewNoop() *Metrics {
	return New(noopRegisterer{})
}

// noopRegisterer discards all registrations.
type noopRegisterer struct{}

func (noopRegisterer) Register(prometheus.Collector) error  { return nil }
func (noopRegisterer) MustRegister(...prometheus.Collector) {}
func (noopRegisterer) Unregister(prometheus.Collector) bool { return true }

// New creates and registers all executor metrics with the given registerer.
func New(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		ExecutionsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "executor_executions_total",
			Help: "Total number of code executions by status.",
		}, []string{"status"}),

		ValidationErrorsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "executor_validation_errors_total",
			Help: "Total number of validation errors by reason.",
		}, []string{"reason"}),

		ExecutionDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "executor_execution_duration_seconds",
			Help:    "Duration of code executions in seconds.",
			Buckets: []float64{0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30},
		}),

		CodeSizeBytes: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "executor_code_size_bytes",
			Help:    "Size of submitted code in bytes.",
			Buckets: []float64{256, 1024, 4096, 16384, 65536, 102400},
		}),

		ActiveExecutions: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "executor_active_executions",
			Help: "Number of currently running executions.",
		}),

		Ready: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "executor_ready",
			Help: "Whether the executor service is ready (1) or not (0).",
		}),
	}

	reg.MustRegister(
		m.ExecutionsTotal,
		m.ValidationErrorsTotal,
		m.ExecutionDuration,
		m.CodeSizeBytes,
		m.ActiveExecutions,
		m.Ready,
	)

	return m
}
