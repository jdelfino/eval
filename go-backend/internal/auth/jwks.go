package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// DefaultJWKSURL is the JWKS endpoint for GCP Identity Platform / Firebase Auth.
const DefaultJWKSURL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

// jwksCacheTTL is the duration cached keys are considered fresh.
const jwksCacheTTL = 1 * time.Hour

// JWKSProvider retrieves RSA public keys by key ID for JWT verification.
type JWKSProvider interface {
	GetKey(ctx context.Context, kid string) (*rsa.PublicKey, error)
}

// CachedJWKSProvider fetches and caches JWKS keys with automatic refresh.
type CachedJWKSProvider struct {
	url    string
	client *http.Client

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	lastFetch time.Time
}

// defaultJWKSHTTPTimeout is the timeout for JWKS HTTP requests when no custom client is provided.
const defaultJWKSHTTPTimeout = 10 * time.Second

// NewCachedJWKSProvider creates a provider that fetches keys from the given URL.
// If client is nil, a default client with a 10-second timeout is used.
func NewCachedJWKSProvider(url string, client *http.Client) *CachedJWKSProvider {
	if client == nil {
		client = &http.Client{Timeout: defaultJWKSHTTPTimeout}
	}
	return &CachedJWKSProvider{
		url:    url,
		client: client,
		keys:   make(map[string]*rsa.PublicKey),
	}
}

// GetKey returns the RSA public key for the given kid.
// It uses a cached copy if available and fresh, otherwise fetches from the JWKS endpoint.
// If a kid is not found in the current cache, it forces a refresh to handle key rotation.
func (p *CachedJWKSProvider) GetKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	// Try cache first (read lock).
	p.mu.RLock()
	key, ok := p.keys[kid]
	fresh := time.Since(p.lastFetch) < jwksCacheTTL
	p.mu.RUnlock()

	if ok && fresh {
		return key, nil
	}

	// Cache miss or stale — refresh.
	if err := p.refresh(ctx); err != nil {
		return nil, err
	}

	p.mu.RLock()
	key, ok = p.keys[kid]
	p.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("auth: key ID %q not found in JWKS", kid)
	}
	return key, nil
}

// jwksResponse is the JSON structure returned by the JWKS endpoint.
type jwksResponse struct {
	Keys []jwksKey `json:"keys"`
}

// jwksKey represents a single key entry in the JWKS response.
// Google's JWKS endpoint returns RSA keys with n (modulus) and e (exponent) fields.
type jwksKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// refresh fetches the JWKS endpoint and updates the cache.
func (p *CachedJWKSProvider) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.url, nil)
	if err != nil {
		return fmt.Errorf("auth: create JWKS request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("auth: fetch JWKS: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("auth: JWKS endpoint returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("auth: read JWKS response: %w", err)
	}

	var jwks jwksResponse
	if err := json.Unmarshal(body, &jwks); err != nil {
		return fmt.Errorf("auth: parse JWKS response: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		pubKey, err := parseRSAPublicKeyFromJWK(k)
		if err != nil {
			return fmt.Errorf("auth: parse key %q: %w", k.Kid, err)
		}
		keys[k.Kid] = pubKey
	}

	p.mu.Lock()
	p.keys = keys
	p.lastFetch = time.Now()
	p.mu.Unlock()

	return nil
}

// parseRSAPublicKeyFromJWK extracts an RSA public key from JWK n and e parameters.
func parseRSAPublicKeyFromJWK(k jwksKey) (*rsa.PublicKey, error) {
	if k.N == "" || k.E == "" {
		return nil, fmt.Errorf("missing n or e parameter")
	}

	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, fmt.Errorf("decode modulus: %w", err)
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, fmt.Errorf("decode exponent: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := int(new(big.Int).SetBytes(eBytes).Int64())

	return &rsa.PublicKey{N: n, E: e}, nil
}
