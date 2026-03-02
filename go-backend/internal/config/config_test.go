package config

import (
	"testing"
	"time"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear any environment variables that might interfere
	envVars := []string{
		"PORT", "ENVIRONMENT", "LOG_LEVEL",
		"GCP_PROJECT_ID", "GCP_REGION",
		"DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME",
		"DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_URL",
		"REDIS_HOST", "REDIS_PORT",
		"CENTRIFUGO_URL", "CENTRIFUGO_API_KEY", "CENTRIFUGO_TOKEN_SECRET",
		"CENTRIFUGO_TOKEN_EXPIRY",
		"IDENTITY_PLATFORM_API_KEY", "IDENTITY_PLATFORM_AUTH_DOMAIN",
		"OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET",
	}
	for _, v := range envVars {
		t.Setenv(v, "")
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Check defaults
	if cfg.Port != 8080 {
		t.Errorf("Port = %d, want 8080", cfg.Port)
	}
	if cfg.Environment != "local" {
		t.Errorf("Environment = %q, want %q", cfg.Environment, "local")
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "info")
	}
	if cfg.CentrifugoTokenExpiry != 15*time.Minute {
		t.Errorf("CentrifugoTokenExpiry = %v, want %v", cfg.CentrifugoTokenExpiry, 15*time.Minute)
	}
	if cfg.GCPProjectID != "" {
		t.Errorf("GCPProjectID = %q, want empty string", cfg.GCPProjectID)
	}
	if cfg.GCPRegion != "" {
		t.Errorf("GCPRegion = %q, want empty string", cfg.GCPRegion)
	}
	if cfg.ExecutorTimeout != 35*time.Second {
		t.Errorf("ExecutorTimeout = %v, want %v", cfg.ExecutorTimeout, 35*time.Second)
	}
	if cfg.ExecutorURL != "http://localhost:8081" {
		t.Errorf("ExecutorURL = %q, want %q", cfg.ExecutorURL, "http://localhost:8081")
	}
}

func TestLoad_CustomValues(t *testing.T) {
	// Set custom environment variables using t.Setenv (auto-cleanup)
	t.Setenv("PORT", "9000")
	t.Setenv("ENVIRONMENT", "production")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("GCP_PROJECT_ID", "my-project")
	t.Setenv("GCP_REGION", "us-central1")
	t.Setenv("DATABASE_HOST", "db.example.com")
	t.Setenv("DATABASE_PORT", "5433")
	t.Setenv("DATABASE_NAME", "testdb")
	t.Setenv("DATABASE_USER", "testuser")
	t.Setenv("DATABASE_PASSWORD", "testpass")
	t.Setenv("DATABASE_URL", "postgresql://testuser:testpass@db.example.com:5433/testdb")
	t.Setenv("REDIS_HOST", "redis.example.com")
	t.Setenv("REDIS_PORT", "6380")
	t.Setenv("CENTRIFUGO_URL", "http://centrifugo.example.com:8000")
	t.Setenv("CENTRIFUGO_API_KEY", "test-api-key")
	t.Setenv("CENTRIFUGO_TOKEN_SECRET", "test-token-secret")
	t.Setenv("CENTRIFUGO_TOKEN_EXPIRY", "30m")
	t.Setenv("IDENTITY_PLATFORM_API_KEY", "test-identity-key")
	t.Setenv("IDENTITY_PLATFORM_AUTH_DOMAIN", "auth.example.com")
	t.Setenv("OAUTH_CLIENT_ID", "test-client-id")
	t.Setenv("OAUTH_CLIENT_SECRET", "test-client-secret")
	t.Setenv("RESEND_API_KEY", "re_test_key")
	t.Setenv("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Verify custom values
	if cfg.Port != 9000 {
		t.Errorf("Port = %d, want 9000", cfg.Port)
	}
	if cfg.Environment != "production" {
		t.Errorf("Environment = %q, want %q", cfg.Environment, "production")
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "debug")
	}
	if cfg.GCPProjectID != "my-project" {
		t.Errorf("GCPProjectID = %q, want %q", cfg.GCPProjectID, "my-project")
	}
	if cfg.GCPRegion != "us-central1" {
		t.Errorf("GCPRegion = %q, want %q", cfg.GCPRegion, "us-central1")
	}
	if cfg.DatabaseHost != "db.example.com" {
		t.Errorf("DatabaseHost = %q, want %q", cfg.DatabaseHost, "db.example.com")
	}
	if cfg.DatabasePort != 5433 {
		t.Errorf("DatabasePort = %d, want 5433", cfg.DatabasePort)
	}
	if cfg.DatabaseName != "testdb" {
		t.Errorf("DatabaseName = %q, want %q", cfg.DatabaseName, "testdb")
	}
	if cfg.DatabaseUser != "testuser" {
		t.Errorf("DatabaseUser = %q, want %q", cfg.DatabaseUser, "testuser")
	}
	if cfg.DatabasePassword != "testpass" {
		t.Errorf("DatabasePassword = %q, want %q", cfg.DatabasePassword, "testpass")
	}
	if cfg.DatabaseURL != "postgresql://testuser:testpass@db.example.com:5433/testdb" {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, "postgresql://testuser:testpass@db.example.com:5433/testdb")
	}
	if cfg.RedisHost != "redis.example.com" {
		t.Errorf("RedisHost = %q, want %q", cfg.RedisHost, "redis.example.com")
	}
	if cfg.RedisPort != 6380 {
		t.Errorf("RedisPort = %d, want 6380", cfg.RedisPort)
	}
	if cfg.CentrifugoURL != "http://centrifugo.example.com:8000" {
		t.Errorf("CentrifugoURL = %q, want %q", cfg.CentrifugoURL, "http://centrifugo.example.com:8000")
	}
	if cfg.CentrifugoAPIKey != "test-api-key" {
		t.Errorf("CentrifugoAPIKey = %q, want %q", cfg.CentrifugoAPIKey, "test-api-key")
	}
	if cfg.CentrifugoTokenSecret != "test-token-secret" {
		t.Errorf("CentrifugoTokenSecret = %q, want %q", cfg.CentrifugoTokenSecret, "test-token-secret")
	}
	if cfg.CentrifugoTokenExpiry != 30*time.Minute {
		t.Errorf("CentrifugoTokenExpiry = %v, want %v", cfg.CentrifugoTokenExpiry, 30*time.Minute)
	}
	if cfg.IdentityPlatformAPIKey != "test-identity-key" {
		t.Errorf("IdentityPlatformAPIKey = %q, want %q", cfg.IdentityPlatformAPIKey, "test-identity-key")
	}
	if cfg.IdentityPlatformAuthDomain != "auth.example.com" {
		t.Errorf("IdentityPlatformAuthDomain = %q, want %q", cfg.IdentityPlatformAuthDomain, "auth.example.com")
	}
	if cfg.OAuthClientID != "test-client-id" {
		t.Errorf("OAuthClientID = %q, want %q", cfg.OAuthClientID, "test-client-id")
	}
	if cfg.OAuthClientSecret != "test-client-secret" {
		t.Errorf("OAuthClientSecret = %q, want %q", cfg.OAuthClientSecret, "test-client-secret")
	}
	if cfg.BootstrapAdminEmail != "admin@example.com" {
		t.Errorf("BootstrapAdminEmail = %q, want %q", cfg.BootstrapAdminEmail, "admin@example.com")
	}
}

func TestLoad_BootstrapAdminEmailDefaultsToEmpty(t *testing.T) {
	t.Setenv("BOOTSTRAP_ADMIN_EMAIL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}
	if cfg.BootstrapAdminEmail != "" {
		t.Errorf("BootstrapAdminEmail = %q, want empty string (bootstrap disabled)", cfg.BootstrapAdminEmail)
	}
}

func TestLoad_ProductionRequiresResendAPIKey(t *testing.T) {
	t.Setenv("ENVIRONMENT", "production")
	t.Setenv("RESEND_API_KEY", "")

	_, err := Load()
	if err == nil {
		t.Error("Load() should return error when RESEND_API_KEY is empty in production")
	}
}

func TestLoad_LocalDoesNotRequireResendAPIKey(t *testing.T) {
	t.Setenv("ENVIRONMENT", "local")
	t.Setenv("RESEND_API_KEY", "")

	_, err := Load()
	if err != nil {
		t.Fatalf("Load() should not return error for local without RESEND_API_KEY: %v", err)
	}
}

func TestLoad_InvalidPort(t *testing.T) {
	t.Setenv("PORT", "not-a-number")

	_, err := Load()
	if err == nil {
		t.Error("Load() should return error for invalid PORT")
	}
}

func TestLoad_DatabasePoolDefaults(t *testing.T) {
	// Clear any environment variables that might interfere
	envVars := []string{
		"DATABASE_MAX_CONNS", "DATABASE_MIN_CONNS",
		"DATABASE_MAX_CONN_LIFETIME", "DATABASE_MAX_CONN_IDLE",
	}
	for _, v := range envVars {
		t.Setenv(v, "")
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Check defaults for pool configuration
	if cfg.DatabaseMaxConns != 25 {
		t.Errorf("DatabaseMaxConns = %d, want 25", cfg.DatabaseMaxConns)
	}
	if cfg.DatabaseMinConns != 5 {
		t.Errorf("DatabaseMinConns = %d, want 5", cfg.DatabaseMinConns)
	}
	if cfg.DatabaseMaxConnLifetime != time.Hour {
		t.Errorf("DatabaseMaxConnLifetime = %v, want %v", cfg.DatabaseMaxConnLifetime, time.Hour)
	}
	if cfg.DatabaseMaxConnIdleTime != 30*time.Minute {
		t.Errorf("DatabaseMaxConnIdleTime = %v, want %v", cfg.DatabaseMaxConnIdleTime, 30*time.Minute)
	}
}

func TestLoad_DatabasePoolCustomValues(t *testing.T) {
	t.Setenv("DATABASE_MAX_CONNS", "50")
	t.Setenv("DATABASE_MIN_CONNS", "10")
	t.Setenv("DATABASE_MAX_CONN_LIFETIME", "2h")
	t.Setenv("DATABASE_MAX_CONN_IDLE", "15m")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.DatabaseMaxConns != 50 {
		t.Errorf("DatabaseMaxConns = %d, want 50", cfg.DatabaseMaxConns)
	}
	if cfg.DatabaseMinConns != 10 {
		t.Errorf("DatabaseMinConns = %d, want 10", cfg.DatabaseMinConns)
	}
	if cfg.DatabaseMaxConnLifetime != 2*time.Hour {
		t.Errorf("DatabaseMaxConnLifetime = %v, want %v", cfg.DatabaseMaxConnLifetime, 2*time.Hour)
	}
	if cfg.DatabaseMaxConnIdleTime != 15*time.Minute {
		t.Errorf("DatabaseMaxConnIdleTime = %v, want %v", cfg.DatabaseMaxConnIdleTime, 15*time.Minute)
	}
}

func TestConfig_DatabasePoolConfig(t *testing.T) {
	t.Setenv("DATABASE_HOST", "db.example.com")
	t.Setenv("DATABASE_PORT", "5433")
	t.Setenv("DATABASE_NAME", "testdb")
	t.Setenv("DATABASE_USER", "testuser")
	t.Setenv("DATABASE_PASSWORD", "testpass")
	t.Setenv("DATABASE_MAX_CONNS", "40")
	t.Setenv("DATABASE_MIN_CONNS", "8")
	t.Setenv("DATABASE_MAX_CONN_LIFETIME", "45m")
	t.Setenv("DATABASE_MAX_CONN_IDLE", "10m")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	poolCfg := cfg.DatabasePoolConfig()

	// Verify all fields are mapped correctly
	if poolCfg.Host != "db.example.com" {
		t.Errorf("PoolConfig.Host = %q, want %q", poolCfg.Host, "db.example.com")
	}
	if poolCfg.Port != 5433 {
		t.Errorf("PoolConfig.Port = %d, want 5433", poolCfg.Port)
	}
	if poolCfg.Database != "testdb" {
		t.Errorf("PoolConfig.Database = %q, want %q", poolCfg.Database, "testdb")
	}
	if poolCfg.User != "testuser" {
		t.Errorf("PoolConfig.User = %q, want %q", poolCfg.User, "testuser")
	}
	if poolCfg.Password != "testpass" {
		t.Errorf("PoolConfig.Password = %q, want %q", poolCfg.Password, "testpass")
	}
	if poolCfg.MaxConns != 40 {
		t.Errorf("PoolConfig.MaxConns = %d, want 40", poolCfg.MaxConns)
	}
	if poolCfg.MinConns != 8 {
		t.Errorf("PoolConfig.MinConns = %d, want 8", poolCfg.MinConns)
	}
	if poolCfg.MaxConnLifetime != 45*time.Minute {
		t.Errorf("PoolConfig.MaxConnLifetime = %v, want %v", poolCfg.MaxConnLifetime, 45*time.Minute)
	}
	if poolCfg.MaxConnIdleTime != 10*time.Minute {
		t.Errorf("PoolConfig.MaxConnIdleTime = %v, want %v", poolCfg.MaxConnIdleTime, 10*time.Minute)
	}
}

// TestLoad_GeminiAPIKey verifies that GEMINI_API_KEY is read from the environment
// and stored in Config.GeminiAPIKey.
func TestLoad_GeminiAPIKey(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-gemini-key-abc123")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.GeminiAPIKey != "test-gemini-key-abc123" {
		t.Errorf("GeminiAPIKey = %q, want %q", cfg.GeminiAPIKey, "test-gemini-key-abc123")
	}
}

// TestLoad_GeminiAPIKeyDefaultsToEmpty verifies that GEMINI_API_KEY defaults to
// empty string when not set (Gemini client is optional, not required for startup).
func TestLoad_GeminiAPIKeyDefaultsToEmpty(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.GeminiAPIKey != "" {
		t.Errorf("GeminiAPIKey = %q, want empty string when not configured", cfg.GeminiAPIKey)
	}
}

func TestLoad_TracingDefaults(t *testing.T) {
	t.Setenv("TRACING_ENABLED", "")
	t.Setenv("TRACING_SAMPLE_RATE", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.TracingEnabled != false {
		t.Errorf("TracingEnabled = %v, want false", cfg.TracingEnabled)
	}
	if cfg.TracingSampleRate != 0.01 {
		t.Errorf("TracingSampleRate = %v, want 0.01", cfg.TracingSampleRate)
	}
}

func TestLoad_TracingCustomValues(t *testing.T) {
	t.Setenv("TRACING_ENABLED", "true")
	t.Setenv("TRACING_SAMPLE_RATE", "0.5")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if !cfg.TracingEnabled {
		t.Errorf("TracingEnabled = %v, want true", cfg.TracingEnabled)
	}
	if cfg.TracingSampleRate != 0.5 {
		t.Errorf("TracingSampleRate = %v, want 0.5", cfg.TracingSampleRate)
	}
}
