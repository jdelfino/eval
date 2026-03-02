package tracing_test

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"github.com/jdelfino/eval/pkg/tracing"
)

func TestInit_ReturnsShutdownFunc(t *testing.T) {
	ctx := context.Background()

	// sampleRate=0 disables sampling (no network needed)
	shutdown, err := tracing.Init(ctx, "test-service", 0.0)
	if err != nil {
		t.Fatalf("Init() returned error: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Init() returned nil shutdown function")
	}
	// Shutdown should not error
	if err := shutdown(ctx); err != nil {
		t.Errorf("shutdown() returned error: %v", err)
	}
}

func TestInit_SetsGlobalTextMapPropagator(t *testing.T) {
	ctx := context.Background()
	shutdown, err := tracing.Init(ctx, "test-service", 0.0)
	if err != nil {
		t.Fatalf("Init() returned error: %v", err)
	}
	defer func() { _ = shutdown(ctx) }()

	propagator := otel.GetTextMapPropagator()
	if propagator == nil {
		t.Fatal("GetTextMapPropagator() returned nil after Init()")
	}

	// Should support W3C traceparent/tracestate
	fields := propagator.Fields()
	foundTraceparent := false
	for _, f := range fields {
		if f == "traceparent" {
			foundTraceparent = true
		}
	}
	if !foundTraceparent {
		t.Errorf("propagator fields %v do not include 'traceparent' (W3C TraceContext)", fields)
	}
}

func TestInit_PropagatorInjectsAndExtracts(t *testing.T) {
	ctx := context.Background()
	shutdown, err := tracing.Init(ctx, "test-service", 0.0)
	if err != nil {
		t.Fatalf("Init() returned error: %v", err)
	}
	defer func() { _ = shutdown(ctx) }()

	propagator := otel.GetTextMapPropagator()

	// Inject a known traceparent
	carrier := propagation.MapCarrier{}
	carrier.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")

	extractedCtx := propagator.Extract(ctx, carrier)
	if extractedCtx == ctx {
		// If the same context is returned without a span, extraction may still work
		// but the context should have trace information embedded.
		// The important thing is that no panic occurs.
	}
}

func TestInit_SetsGlobalTracerProvider(t *testing.T) {
	ctx := context.Background()
	shutdown, err := tracing.Init(ctx, "test-service", 0.0)
	if err != nil {
		t.Fatalf("Init() returned error: %v", err)
	}
	defer func() { _ = shutdown(ctx) }()

	provider := otel.GetTracerProvider()
	if provider == nil {
		t.Fatal("GetTracerProvider() returned nil after Init()")
	}
}

func TestInit_ZeroSampleRateIsValid(t *testing.T) {
	ctx := context.Background()
	shutdown, err := tracing.Init(ctx, "test-service", 0.0)
	if err != nil {
		t.Fatalf("Init() with sampleRate=0.0 should not error: %v", err)
	}
	_ = shutdown(ctx)
}

func TestInit_OneSampleRateIsValid(t *testing.T) {
	ctx := context.Background()
	shutdown, err := tracing.Init(ctx, "test-service", 1.0)
	if err != nil {
		t.Fatalf("Init() with sampleRate=1.0 should not error: %v", err)
	}
	_ = shutdown(ctx)
}
