// Package metrics provides Prometheus collectors for application-level metrics.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
)

// PoolStats provides pool statistics for the collector.
type PoolStats struct {
	AcquireCount         int64
	AcquiredConns        int32
	IdleConns            int32
	ConstructingConns    int32
	TotalConns           int32
	MaxConns             int32
	EmptyAcquireCount    int64
	CanceledAcquireCount int64
}

// PoolStatFunc returns current pool statistics.
type PoolStatFunc func() PoolStats

// DBPoolCollector collects connection pool stats via a PoolStatFunc.
type DBPoolCollector struct {
	statFn PoolStatFunc

	acquireCount         *prometheus.Desc
	connections          *prometheus.Desc
	maxConns             *prometheus.Desc
	emptyAcquireCount    *prometheus.Desc
	canceledAcquireCount *prometheus.Desc
}

// NewDBPoolCollector creates a new collector that exposes pool stats.
func NewDBPoolCollector(statFn PoolStatFunc) *DBPoolCollector {
	return &DBPoolCollector{
		statFn: statFn,
		acquireCount: prometheus.NewDesc(
			"db_pool_acquire_count_total",
			"Total number of successful pool acquires.",
			nil, nil,
		),
		connections: prometheus.NewDesc(
			"db_pool_connections",
			"Number of pool connections by state.",
			[]string{"state"}, nil,
		),
		maxConns: prometheus.NewDesc(
			"db_pool_max_connections",
			"Maximum number of connections allowed.",
			nil, nil,
		),
		emptyAcquireCount: prometheus.NewDesc(
			"db_pool_empty_acquire_count_total",
			"Total acquires that had to wait for a connection.",
			nil, nil,
		),
		canceledAcquireCount: prometheus.NewDesc(
			"db_pool_canceled_acquire_count_total",
			"Total acquires that were canceled.",
			nil, nil,
		),
	}
}

// Describe implements prometheus.Collector.
func (c *DBPoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.acquireCount
	ch <- c.connections
	ch <- c.maxConns
	ch <- c.emptyAcquireCount
	ch <- c.canceledAcquireCount
}

// Collect implements prometheus.Collector.
func (c *DBPoolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.statFn()

	ch <- prometheus.MustNewConstMetric(c.acquireCount, prometheus.CounterValue, float64(s.AcquireCount))

	ch <- prometheus.MustNewConstMetric(c.connections, prometheus.GaugeValue, float64(s.AcquiredConns), "acquired")
	ch <- prometheus.MustNewConstMetric(c.connections, prometheus.GaugeValue, float64(s.IdleConns), "idle")
	ch <- prometheus.MustNewConstMetric(c.connections, prometheus.GaugeValue, float64(s.ConstructingConns), "constructing")
	ch <- prometheus.MustNewConstMetric(c.connections, prometheus.GaugeValue, float64(s.TotalConns), "total")

	ch <- prometheus.MustNewConstMetric(c.maxConns, prometheus.GaugeValue, float64(s.MaxConns))
	ch <- prometheus.MustNewConstMetric(c.emptyAcquireCount, prometheus.CounterValue, float64(s.EmptyAcquireCount))
	ch <- prometheus.MustNewConstMetric(c.canceledAcquireCount, prometheus.CounterValue, float64(s.CanceledAcquireCount))
}
