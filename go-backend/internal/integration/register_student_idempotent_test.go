package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/store"
)

// createEmulatorUserVerified creates a Firebase Auth Emulator user with
// email_verified=true (required for register-student) and returns the token.
// The Firebase emulator's REST API allows setting emailVerified via accounts:update.
func (h *testHarness) createEmulatorUserVerified(t *testing.T, email, password string) (firebaseUID, token string) {
	t.Helper()

	// Step 1: Sign up to create the user.
	signUpURL := fmt.Sprintf("%s/identitytoolkit.googleapis.com/v1/accounts:signUp?key=%s",
		h.emulatorURL, h.apiKey)
	signUpBody := map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	}
	resp := h.emulatorPost(t, signUpURL, signUpBody)
	firebaseUID = resp["localId"].(string)

	// Step 2: Set emailVerified=true via the admin update endpoint.
	updateURL := fmt.Sprintf("%s/identitytoolkit.googleapis.com/v1/accounts:update?key=%s",
		h.emulatorURL, h.apiKey)
	updateBody := map[string]any{
		"localId":       firebaseUID,
		"emailVerified": true,
	}
	h.emulatorPost(t, updateURL, updateBody)

	// Step 3: Sign in to get a fresh token (with emailVerified=true in the claim).
	signInURL := fmt.Sprintf("%s/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=%s",
		h.emulatorURL, h.apiKey)
	signInBody := map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	}
	signInResp := h.emulatorPost(t, signInURL, signInBody)
	token = signInResp["idToken"].(string)
	return firebaseUID, token
}

// doJSONRequest makes an authenticated HTTP request with a JSON body to the test server.
func (h *testHarness) doJSONRequest(t *testing.T, method, path, token string, body any) *http.Response {
	t.Helper()

	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request body: %v", err)
	}

	url := h.Server.URL + path
	req, err := http.NewRequest(method, url, bytes.NewReader(data))
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}

// TestRegisterStudent_IdempotentOnDuplicateExternalID verifies that POST
// /auth/register-student is idempotent: calling it twice with the same
// Firebase UID (external_id) returns 201 on the first call and 200 on the
// second call (not 500), and both responses return the same user ID.
//
// This test reproduces the PLAT-xntd bug. It MUST fail before the fix and
// pass after it.
func TestRegisterStudent_IdempotentOnDuplicateExternalID(t *testing.T) {
	h := setupHarness(t)
	if h == nil {
		t.Skip("DATABASE_URL or FIREBASE_AUTH_EMULATOR_HOST not set, skipping integration test")
	}

	ctx := context.Background()

	// --- Setup: create a class and section with an active join code ---

	instructorID, _ := h.createUser(ctx, t, "instructor-reg@test.com", "instructor", h.nsID)

	classID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class', $3)`,
		classID, h.nsID, instructorID); err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "TESTJOIN" + uuid.New().String()[:4]
	sectionID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code, active) VALUES ($1, $2, $3, 'Section 1', $4, true)`,
		sectionID, h.nsID, classID, joinCode); err != nil {
		t.Fatalf("create section: %v", err)
	}

	// --- Setup: create a Firebase user (no DB record) for registration ---
	email := fmt.Sprintf("student-reg-%s@test.com", uuid.New().String()[:8])
	password := "test-password-reg" // gitleaks:allow
	_, token := h.createEmulatorUserVerified(t, email, password)

	// --- First registration call: should return 201 ---
	body1 := map[string]string{"join_code": joinCode}
	resp1 := h.doJSONRequest(t, http.MethodPost, "/api/v1/auth/register-student", token, body1)
	defer func() { _ = resp1.Body.Close() }()

	rawBody1, _ := io.ReadAll(resp1.Body)
	if resp1.StatusCode != http.StatusCreated {
		t.Fatalf("first register-student: expected 201, got %d: %s", resp1.StatusCode, rawBody1)
	}

	var user1 store.User
	if err := json.Unmarshal(rawBody1, &user1); err != nil {
		t.Fatalf("decode first response: %v (body: %s)", err, rawBody1)
	}
	if user1.ID == uuid.Nil {
		t.Fatalf("first response: expected non-nil user ID")
	}

	// --- Second registration call: CURRENTLY returns 500 (bug PLAT-xntd) ---
	// After the fix, it should return 200 with the same user ID.
	body2 := map[string]string{"join_code": joinCode}
	resp2 := h.doJSONRequest(t, http.MethodPost, "/api/v1/auth/register-student", token, body2)
	defer func() { _ = resp2.Body.Close() }()

	rawBody2, _ := io.ReadAll(resp2.Body)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("second register-student: expected 200 (idempotent), got %d: %s", resp2.StatusCode, rawBody2)
	}

	var user2 store.User
	if err := json.Unmarshal(rawBody2, &user2); err != nil {
		t.Fatalf("decode second response: %v (body: %s)", err, rawBody2)
	}
	if user2.ID != user1.ID {
		t.Errorf("second registration returned different user ID: got %v, want %v", user2.ID, user1.ID)
	}
}

// TestRegisterStudent_DuplicateUserAndMembership verifies that even when
// CreateMembership also returns a duplicate (both user and membership already
// exist), the handler still returns 200 with the existing user.
func TestRegisterStudent_DuplicateUserAndMembership(t *testing.T) {
	h := setupHarness(t)
	if h == nil {
		t.Skip("DATABASE_URL or FIREBASE_AUTH_EMULATOR_HOST not set, skipping integration test")
	}

	ctx := context.Background()

	// --- Setup ---
	instructorID, _ := h.createUser(ctx, t, "instructor-reg2@test.com", "instructor", h.nsID)

	classID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, 'Test Class 2', $3)`,
		classID, h.nsID, instructorID); err != nil {
		t.Fatalf("create class: %v", err)
	}

	joinCode := "TESTJN2" + uuid.New().String()[:4]
	sectionID := uuid.New()
	if _, err := h.Pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code, active) VALUES ($1, $2, $3, 'Section 2', $4, true)`,
		sectionID, h.nsID, classID, joinCode); err != nil {
		t.Fatalf("create section: %v", err)
	}

	email := fmt.Sprintf("student-reg2-%s@test.com", uuid.New().String()[:8])
	password := "test-password-reg2" // gitleaks:allow
	_, token := h.createEmulatorUserVerified(t, email, password)

	// First call: 201
	resp1 := h.doJSONRequest(t, http.MethodPost, "/api/v1/auth/register-student", token, map[string]string{"join_code": joinCode})
	defer func() { _ = resp1.Body.Close() }()
	rawBody1, _ := io.ReadAll(resp1.Body)
	if resp1.StatusCode != http.StatusCreated {
		t.Fatalf("first register-student: expected 201, got %d: %s", resp1.StatusCode, rawBody1)
	}
	var user1 store.User
	if err := json.Unmarshal(rawBody1, &user1); err != nil {
		t.Fatalf("decode first response: %v", err)
	}

	// Second call: 200 (user exists, membership exists)
	resp2 := h.doJSONRequest(t, http.MethodPost, "/api/v1/auth/register-student", token, map[string]string{"join_code": joinCode})
	defer func() { _ = resp2.Body.Close() }()
	rawBody2, _ := io.ReadAll(resp2.Body)
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("second register-student: expected 200 (idempotent), got %d: %s", resp2.StatusCode, rawBody2)
	}
	var user2 store.User
	if err := json.Unmarshal(rawBody2, &user2); err != nil {
		t.Fatalf("decode second response: %v", err)
	}
	if user2.ID != user1.ID {
		t.Errorf("second registration returned different user ID: got %v, want %v", user2.ID, user1.ID)
	}
}
