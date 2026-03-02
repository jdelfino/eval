// Package tracing provides OpenTelemetry distributed tracing initialization
// with Cloud Trace exporter for GCP environments.
package tracing

import (
	"context"
	"fmt"
	"log/slog"

	texporter "github.com/GoogleCloudPlatform/opentelemetry-operations-go/exporter/trace"
	"go.opentelemetry.io/contrib/detectors/gcp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

// Init initializes the global OpenTelemetry TracerProvider with Cloud Trace
// exporter and a W3C TextMapPropagator. It returns a shutdown function that
// flushes and closes the provider.
//
// sampleRate is the fraction of root spans to sample (0.0–1.0).
// 0.0 disables sampling; 1.0 samples everything; 0.01 samples 1%.
//
// When the Cloud Trace exporter cannot be created (e.g. no GCP credentials),
// Init logs a warning and falls back to a no-op exporter so the process starts
// successfully in non-GCP environments.
func Init(ctx context.Context, serviceName string, sampleRate float64) (shutdown func(context.Context) error, err error) {
	// Build the resource (service name + GCP metadata when available).
	res, resErr := buildResource(ctx, serviceName)
	if resErr != nil {
		// Non-fatal: resource detection may fail outside GCP.
		slog.Warn("tracing: resource detection failed, using minimal resource", "error", resErr)
		res = resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		)
	}

	// Build the span exporter.
	var exporter sdktrace.SpanExporter
	cloudExporter, exporterErr := texporter.New()
	if exporterErr != nil {
		// Cloud Trace exporter creation fails when GCP credentials are unavailable
		// (e.g. local development). Fall back to a no-op exporter so tracing can
		// still be "enabled" in config without crashing non-GCP processes.
		slog.Warn("tracing: Cloud Trace exporter unavailable, using no-op exporter", "error", exporterErr)
		exporter = &noopExporter{}
	} else {
		exporter = cloudExporter
	}

	// Parent-based sampler: sample sampleRate fraction of root (unsampled) spans.
	sampler := sdktrace.ParentBased(
		sdktrace.TraceIDRatioBased(sampleRate),
	)

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)

	// Set globals so otelhttp middleware and otel.GetTracer() work out of the box.
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return func(ctx context.Context) error {
		if err := tp.Shutdown(ctx); err != nil {
			return fmt.Errorf("tracing: shutdown: %w", err)
		}
		return nil
	}, nil
}

// buildResource creates an OTel resource with service name and GCP metadata.
func buildResource(ctx context.Context, serviceName string) (*resource.Resource, error) {
	return resource.New(ctx,
		resource.WithDetectors(gcp.NewDetector()),
		resource.WithTelemetrySDK(),
		resource.WithAttributes(semconv.ServiceName(serviceName)),
	)
}

// noopExporter is a SpanExporter that discards all spans.
// Used as a fallback when Cloud Trace credentials are unavailable.
type noopExporter struct{}

func (n *noopExporter) ExportSpans(_ context.Context, _ []sdktrace.ReadOnlySpan) error {
	return nil
}

func (n *noopExporter) Shutdown(_ context.Context) error {
	return nil
}
