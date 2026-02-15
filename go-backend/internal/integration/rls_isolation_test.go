package integration

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// TestRLSIsolation_CrossNamespaceClasses verifies that RLS policies are
// enforced through the full HTTP middleware chain: an instructor in
// namespace A must not see classes belonging to namespace B.
//
// This test would FAIL before the SET ROLE eval_app fix because without
// SET ROLE the database connection user owns all tables and bypasses RLS.
func TestRLSIsolation_CrossNamespaceClasses(t *testing.T) {
	h := setupHarness(t)
	if h == nil {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()

	// --- Setup: two namespaces, each with an instructor and a class ---

	nsBID := "ns-api-b-" + uuid.New().String()
	if _, err := h.Pool.Exec(ctx, `INSERT INTO namespaces (id, display_name, active) VALUES ($1, $2, true)`, nsBID, "Namespace B"); err != nil {
		t.Fatalf("create namespace B: %v", err)
	}
	t.Cleanup(func() {
		_, _ = h.Pool.Exec(context.Background(), "DELETE FROM namespaces WHERE id = $1", nsBID)
	})

	// Instructor in namespace A (h.nsID)
	instructorAID, tokenA := h.createUser(ctx, t, "instrA@test.com", "instructor", h.nsID)
	// Instructor in namespace B
	instructorBID, tokenB := h.createUser(ctx, t, "instrB@test.com", "instructor", nsBID)

	// Class in namespace A
	classAID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Class A', $3)`,
		classAID, h.nsID, instructorAID); err != nil {
		t.Fatalf("create class A: %v", err)
	}

	// Class in namespace B
	classBID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Class B', $3)`,
		classBID, nsBID, instructorBID); err != nil {
		t.Fatalf("create class B: %v", err)
	}

	// --- Test: instructor A sees only class A ---

	t.Run("instructor A sees only namespace A classes", func(t *testing.T) {
		resp := h.doRequest(t, http.MethodGet, "/api/v1/classes", tokenA)
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("GET /classes as A: status %d, body: %s", resp.StatusCode, body)
		}

		var classes []struct {
			ID          string `json:"id"`
			NamespaceID string `json:"namespace_id"`
			Name        string `json:"name"`
		}
		if err := json.Unmarshal(body, &classes); err != nil {
			t.Fatalf("decode response: %v (body: %s)", err, body)
		}

		for _, c := range classes {
			if c.ID == classBID.String() {
				t.Errorf("instructor A should NOT see class B (namespace B), but found it: %+v", c)
			}
		}

		foundA := false
		for _, c := range classes {
			if c.ID == classAID.String() {
				foundA = true
				break
			}
		}
		if !foundA {
			t.Errorf("instructor A should see class A, but it was missing from %d classes", len(classes))
		}
	})

	// --- Test: instructor B sees only class B ---

	t.Run("instructor B sees only namespace B classes", func(t *testing.T) {
		resp := h.doRequest(t, http.MethodGet, "/api/v1/classes", tokenB)
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("GET /classes as B: status %d, body: %s", resp.StatusCode, body)
		}

		var classes []struct {
			ID          string `json:"id"`
			NamespaceID string `json:"namespace_id"`
			Name        string `json:"name"`
		}
		if err := json.Unmarshal(body, &classes); err != nil {
			t.Fatalf("decode response: %v (body: %s)", err, body)
		}

		for _, c := range classes {
			if c.ID == classAID.String() {
				t.Errorf("instructor B should NOT see class A (namespace A), but found it: %+v", c)
			}
		}

		foundB := false
		for _, c := range classes {
			if c.ID == classBID.String() {
				foundB = true
				break
			}
		}
		if !foundB {
			t.Errorf("instructor B should see class B, but it was missing from %d classes", len(classes))
		}
	})
}
