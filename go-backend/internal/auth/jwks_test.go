package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// buildJWKSResponse builds a JWKS JSON response with n/e RSA parameters.
func buildJWKSResponse(t *testing.T, keys map[string]*rsa.PublicKey) []byte {
	t.Helper()
	type keyEntry struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		N   string `json:"n"`
		E   string `json:"e"`
		Use string `json:"use"`
	}
	var entries []keyEntry
	for kid, pub := range keys {
		entries = append(entries, keyEntry{
			Kid: kid,
			Kty: "RSA",
			Alg: "RS256",
			N:   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			E:   base64.RawURLEncoding.EncodeToString([]byte{1, 0, 1}), // 65537
			Use: "sig",
		})
	}
	data, err := json.Marshal(map[string]any{"keys": entries})
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	return data
}

func generateTestKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

func TestCachedJWKSProvider_GetKey(t *testing.T) {
	privateKey := generateTestKey(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]*rsa.PublicKey{"kid1": &privateKey.PublicKey}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	key, err := provider.GetKey(ctx, "kid1")
	if err != nil {
		t.Fatalf("GetKey() error: %v", err)
	}
	if !key.Equal(&privateKey.PublicKey) {
		t.Error("returned key does not match expected public key")
	}
	if fetchCount.Load() != 1 {
		t.Errorf("fetch count = %d, want 1", fetchCount.Load())
	}
}

func TestCachedJWKSProvider_CacheHit(t *testing.T) {
	privateKey := generateTestKey(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]*rsa.PublicKey{"kid1": &privateKey.PublicKey}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, _ = provider.GetKey(ctx, "kid1")
	_, err := provider.GetKey(ctx, "kid1")
	if err != nil {
		t.Fatalf("GetKey() error on second call: %v", err)
	}
	if fetchCount.Load() != 1 {
		t.Errorf("fetch count = %d, want 1 (cache hit)", fetchCount.Load())
	}
}

func TestCachedJWKSProvider_CacheTTLExpiry(t *testing.T) {
	privateKey := generateTestKey(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]*rsa.PublicKey{"kid1": &privateKey.PublicKey}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, _ = provider.GetKey(ctx, "kid1")

	// Simulate TTL expiry by backdating lastFetch.
	provider.mu.Lock()
	provider.lastFetch = time.Now().Add(-2 * jwksCacheTTL)
	provider.mu.Unlock()

	_, err := provider.GetKey(ctx, "kid1")
	if err != nil {
		t.Fatalf("GetKey() error after TTL: %v", err)
	}
	if fetchCount.Load() != 2 {
		t.Errorf("fetch count = %d, want 2 (TTL expired)", fetchCount.Load())
	}
}

func TestCachedJWKSProvider_UnknownKidTriggersRefresh(t *testing.T) {
	privateKey := generateTestKey(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]*rsa.PublicKey{"kid1": &privateKey.PublicKey}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, _ = provider.GetKey(ctx, "kid1")

	_, err := provider.GetKey(ctx, "unknown-kid")
	if err == nil {
		t.Fatal("GetKey() expected error for unknown kid, got nil")
	}
	if fetchCount.Load() != 2 {
		t.Errorf("fetch count = %d, want 2 (refresh for unknown kid)", fetchCount.Load())
	}
}

func TestCachedJWKSProvider_HTTPFetchFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, err := provider.GetKey(ctx, "kid1")
	if err == nil {
		t.Fatal("GetKey() expected error on HTTP failure, got nil")
	}
}

func TestCachedJWKSProvider_MalformedJWKS(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys": [{"kid": "bad", "n": "", "e": ""}]}`))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, err := provider.GetKey(ctx, "bad")
	if err == nil {
		t.Fatal("GetKey() expected error for malformed key, got nil")
	}
}
