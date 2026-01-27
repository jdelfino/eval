package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// helper: generate a self-signed cert and return PEM-encoded certificate string + private key.
func generateTestCert(t *testing.T) (string, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test"},
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(time.Hour),
	}
	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	return string(certPEM), key
}

// buildJWKSResponse builds a JWKS-style JSON response with the given kid->cert mappings.
func buildJWKSResponse(t *testing.T, certs map[string]string) []byte {
	t.Helper()
	type keyEntry struct {
		Kid string `json:"kid"`
		X5c string `json:"x5c"`
	}
	var keys []keyEntry
	for kid, cert := range certs {
		// Strip PEM header/footer to get raw base64
		block, _ := pem.Decode([]byte(cert))
		if block == nil {
			t.Fatalf("failed to decode PEM for kid %s", kid)
		}
		keys = append(keys, keyEntry{
			Kid: kid,
			X5c: cert,
		})
	}
	data, err := json.Marshal(map[string]interface{}{"keys": keys})
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	return data
}

func TestCachedJWKSProvider_GetKey(t *testing.T) {
	certPEM, privateKey := generateTestCert(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]string{"kid1": certPEM}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	// First call should fetch.
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
	certPEM, _ := generateTestCert(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]string{"kid1": certPEM}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	// Two calls for the same kid; second should be cached.
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
	certPEM, _ := generateTestCert(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]string{"kid1": certPEM}))
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
	certPEM, _ := generateTestCert(t)

	var fetchCount atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetchCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buildJWKSResponse(t, map[string]string{"kid1": certPEM}))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	// Populate cache first.
	_, _ = provider.GetKey(ctx, "kid1")

	// Unknown kid should trigger refresh, then return error.
	_, err := provider.GetKey(ctx, "unknown-kid")
	if err == nil {
		t.Fatal("GetKey() expected error for unknown kid, got nil")
	}
	if fetchCount.Load() != 2 {
		t.Errorf("fetch count = %d, want 2 (refresh for unknown kid)", fetchCount.Load())
	}
}

func TestCachedJWKSProvider_HTTPFetchFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys": [{"kid": "bad", "x5c": "not-a-cert"}]}`))
	}))
	defer srv.Close()

	provider := NewCachedJWKSProvider(srv.URL, srv.Client())
	ctx := context.Background()

	_, err := provider.GetKey(ctx, "bad")
	if err == nil {
		t.Fatal("GetKey() expected error for malformed cert, got nil")
	}
}
