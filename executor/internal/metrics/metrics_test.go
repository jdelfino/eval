package metrics_test

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/jdelfino/eval/executor/internal/metrics"
)

func TestNew_RegistersAllMetrics(t *testing.T) {
	reg := prometheus.NewRegistry()
	m := metrics.New(reg)

	if m.ExecutionsTotal == nil {
		t.Error("ExecutionsTotal is nil")
	}
	if m.ValidationErrorsTotal == nil {
		t.Error("ValidationErrorsTotal is nil")
	}
	if m.ExecutionDuration == nil {
		t.Error("ExecutionDuration is nil")
	}
	if m.CodeSizeBytes == nil {
		t.Error("CodeSizeBytes is nil")
	}
	if m.ActiveExecutions == nil {
		t.Error("ActiveExecutions is nil")
	}
	if m.Ready == nil {
		t.Error("Ready is nil")
	}

	// Touch counters/histograms so they appear in gather output.
	m.ExecutionsTotal.WithLabelValues("success").Add(0)
	m.ValidationErrorsTotal.WithLabelValues("invalid_request").Add(0)
	m.ExecutionDuration.Observe(1.0)
	m.CodeSizeBytes.Observe(100)
	m.ActiveExecutions.Set(0)
	m.Ready.Set(1)

	families, err := reg.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	expected := map[string]bool{
		"executor_executions_total":         false,
		"executor_validation_errors_total":  false,
		"executor_execution_duration_seconds": false,
		"executor_code_size_bytes":          false,
		"executor_active_executions":        false,
		"executor_ready":                    false,
	}

	for _, f := range families {
		if _, ok := expected[f.GetName()]; ok {
			expected[f.GetName()] = true
		}
	}

	for name, found := range expected {
		if !found {
			t.Errorf("metric %q not found in gathered families", name)
		}
	}
}

func TestNew_DuplicateRegistrationPanics(t *testing.T) {
	reg := prometheus.NewRegistry()
	_ = metrics.New(reg)

	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on duplicate registration")
		}
	}()

	_ = metrics.New(reg)
}
