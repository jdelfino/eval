package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func mockStatFn() PoolStats {
	return PoolStats{
		AcquireCount:         42,
		AcquiredConns:        3,
		IdleConns:            5,
		ConstructingConns:    1,
		TotalConns:           9,
		MaxConns:             10,
		EmptyAcquireCount:    2,
		CanceledAcquireCount: 1,
	}
}

func TestDBPoolCollector_Describe(t *testing.T) {
	collector := NewDBPoolCollector(mockStatFn)

	ch := make(chan *prometheus.Desc, 10)
	collector.Describe(ch)
	close(ch)

	var descs []*prometheus.Desc
	for d := range ch {
		descs = append(descs, d)
	}

	if got := len(descs); got != 5 {
		t.Errorf("Describe emitted %d descriptors, want 5", got)
	}
}

func TestDBPoolCollector_Collect(t *testing.T) {
	collector := NewDBPoolCollector(mockStatFn)

	ch := make(chan prometheus.Metric, 20)
	collector.Collect(ch)
	close(ch)

	var collected []prometheus.Metric
	for m := range ch {
		collected = append(collected, m)
	}

	// acquireCount(1) + connections*4(acquired,idle,constructing,total) + maxConns(1) + emptyAcquire(1) + canceledAcquire(1) = 8
	if got := len(collected); got != 8 {
		t.Errorf("Collect emitted %d metrics, want 8", got)
	}
}

func TestDBPoolCollector_RegisterAndGather(t *testing.T) {
	reg := prometheus.NewRegistry()
	collector := NewDBPoolCollector(mockStatFn)

	if err := reg.Register(collector); err != nil {
		t.Fatalf("failed to register collector: %v", err)
	}

	count := testutil.CollectAndCount(collector)
	if count != 8 {
		t.Errorf("CollectAndCount = %d, want 8", count)
	}
}
