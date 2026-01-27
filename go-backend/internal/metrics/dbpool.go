// Package metrics provides Prometheus collectors for application-level metrics.
package metrics

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

// DBPoolCollector collects connection pool stats from pgxpool.Pool.
type DBPoolCollector struct {
	pool *pgxpool.Pool

	acquireCount         *prometheus.Desc
	acquiredConns        *prometheus.Desc
	constructingConns    *prometheus.Desc
	idleConns            *prometheus.Desc
	totalConns           *prometheus.Desc
	maxConns             *prometheus.Desc
	emptyAcquireCount    *prometheus.Desc
	canceledAcquireCount *prometheus.Desc
}

// NewDBPoolCollector creates a new collector that exposes pgxpool stats.
func NewDBPoolCollector(pool *pgxpool.Pool) *DBPoolCollector {
	return &DBPoolCollector{
		pool: pool,
		acquireCount: prometheus.NewDesc(
			"db_pool_acquire_count_total",
			"Total number of successful pool acquires.",
			nil, nil,
		),
		acquiredConns: prometheus.NewDesc(
			"db_pool_connections",
			"Number of pool connections by state.",
			[]string{"state"}, nil,
		),
		constructingConns: prometheus.NewDesc(
			"db_pool_constructing_connections",
			"Number of connections being constructed.",
			nil, nil,
		),
		idleConns: prometheus.NewDesc(
			"db_pool_idle_connections",
			"Number of idle connections.",
			nil, nil,
		),
		totalConns: prometheus.NewDesc(
			"db_pool_total_connections",
			"Total number of connections in the pool.",
			nil, nil,
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
	ch <- c.acquiredConns
	ch <- c.constructingConns
	ch <- c.idleConns
	ch <- c.totalConns
	ch <- c.maxConns
	ch <- c.emptyAcquireCount
	ch <- c.canceledAcquireCount
}

// Collect implements prometheus.Collector.
func (c *DBPoolCollector) Collect(ch chan<- prometheus.Metric) {
	stat := c.pool.Stat()

	ch <- prometheus.MustNewConstMetric(c.acquireCount, prometheus.CounterValue, float64(stat.AcquireCount()))

	ch <- prometheus.MustNewConstMetric(c.acquiredConns, prometheus.GaugeValue, float64(stat.AcquiredConns()), "acquired")
	ch <- prometheus.MustNewConstMetric(c.acquiredConns, prometheus.GaugeValue, float64(stat.IdleConns()), "idle")
	ch <- prometheus.MustNewConstMetric(c.acquiredConns, prometheus.GaugeValue, float64(stat.ConstructingConns()), "constructing")

	ch <- prometheus.MustNewConstMetric(c.constructingConns, prometheus.GaugeValue, float64(stat.ConstructingConns()))
	ch <- prometheus.MustNewConstMetric(c.idleConns, prometheus.GaugeValue, float64(stat.IdleConns()))
	ch <- prometheus.MustNewConstMetric(c.totalConns, prometheus.GaugeValue, float64(stat.TotalConns()))
	ch <- prometheus.MustNewConstMetric(c.maxConns, prometheus.GaugeValue, float64(stat.MaxConns()))
	ch <- prometheus.MustNewConstMetric(c.emptyAcquireCount, prometheus.CounterValue, float64(stat.EmptyAcquireCount()))
	ch <- prometheus.MustNewConstMetric(c.canceledAcquireCount, prometheus.CounterValue, float64(stat.CanceledAcquireCount()))
}
