// Package config provides configuration loading from environment variables.
package config

import (
	"github.com/caarlos0/env/v11"
)

// Config holds all configuration values for the executor service.
type Config struct {
	// Application Configuration
	Port        int    `env:"PORT" envDefault:"8081"`
	Environment string `env:"ENVIRONMENT" envDefault:"local"`
	LogLevel    string `env:"LOG_LEVEL" envDefault:"info"`

	// Sandbox Configuration
	NsjailPath string `env:"NSJAIL_PATH" envDefault:"/usr/bin/nsjail"`
	PythonPath string `env:"PYTHON_PATH" envDefault:"/usr/bin/python3"`

	// Execution Limits
	MaxConcurrentExecutions int `env:"MAX_CONCURRENT_EXECUTIONS" envDefault:"10"`
	DefaultTimeoutMS        int `env:"DEFAULT_TIMEOUT_MS" envDefault:"10000"`
	MaxCodeBytes     int `env:"MAX_CODE_BYTES" envDefault:"102400"`
	MaxStdinBytes    int `env:"MAX_STDIN_BYTES" envDefault:"1048576"`
	MaxOutputBytes   int `env:"MAX_OUTPUT_BYTES" envDefault:"1048576"`
	MaxFiles         int `env:"MAX_FILES" envDefault:"5"`
	MaxFileBytes     int `env:"MAX_FILE_BYTES" envDefault:"10240"`

	// Rate Limiting (per-instance, not distributed)
	RateLimitRPS   float64 `env:"RATE_LIMIT_RPS" envDefault:"50"`
	RateLimitBurst int     `env:"RATE_LIMIT_BURST" envDefault:"100"`
}

// Load parses environment variables and returns a Config struct.
func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
