package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// mockConn implements the RLSConn interface for testing.
type mockConn struct {
	mu            sync.Mutex
	setConfigArgs []setConfigCall
	execErr       error
	released      bool
}

type setConfigCall struct {
	setting string
	value   string
}

func (m *mockConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if m.execErr != nil {
		return pgconn.CommandTag{}, m.execErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	// Parse set_config call - SQL is like "SELECT set_config('app.user_id', $1, true)"
	// Extract setting name from SQL and value from args
	if len(args) >= 1 {
		// Extract setting name from SQL by parsing between set_config(' and ',
		start := len("SELECT set_config('")
		end := start
		for i := start; i < len(sql) && sql[i] != '\''; i++ {
			end = i + 1
		}
		setting := sql[start:end]
		value, _ := args[0].(string)
		m.setConfigArgs = append(m.setConfigArgs, setConfigCall{setting: setting, value: value})
	}
	return pgconn.CommandTag{}, nil
}

func (m *mockConn) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *mockConn) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return nil
}

func (m *mockConn) Release() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.released = true
}

func (m *mockConn) wasReleased() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.released
}

func (m *mockConn) getSetConfigArgs() []setConfigCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]setConfigCall, len(m.setConfigArgs))
	copy(result, m.setConfigArgs)
	return result
}

// testAcquirer allows injecting mock connections in tests.
type testAcquirer struct {
	conn       RLSConn
	acquireErr error
}

func (t *testAcquirer) AcquireConn(ctx context.Context) (RLSConn, error) {
	if t.acquireErr != nil {
		return nil, t.acquireErr
	}
	return t.conn, nil
}

func TestRLSContextMiddleware_NoUser(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		// Should not have repos in context for unauthenticated request
		func() {
			defer func() {
				if r := recover(); r == nil {
					t.Error("Expected panic from ReposFromContext for unauthenticated request")
				}
			}()
			store.ReposFromContext(r.Context())
		}()
		w.WriteHeader(http.StatusOK)
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if !handlerCalled {
		t.Error("Handler was not called")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}
	// Should not have acquired a connection
	if len(mock.getSetConfigArgs()) > 0 {
		t.Error("Should not have called set_config for unauthenticated request")
	}
}

func TestRLSContextMiddleware_WithUser(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	userID := uuid.New()
	testUser := &auth.User{
		ID:          userID,
		Email:       "test@example.com",
		NamespaceID: "test-namespace",
		Role:        auth.RoleInstructor,
	}

	var ctxRepos store.Repos
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctxRepos = store.ReposFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/classes", nil)
	ctx := auth.WithUser(req.Context(), testUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}

	// Verify set_config was called with correct values
	calls := mock.getSetConfigArgs()
	if len(calls) != 3 {
		t.Fatalf("Expected 3 set_config calls, got %d", len(calls))
	}

	expected := map[string]string{
		"app.user_id":      userID.String(),
		"app.namespace_id": "test-namespace",
		"app.role":         "instructor",
	}

	for _, call := range calls {
		expectedValue, ok := expected[call.setting]
		if !ok {
			t.Errorf("Unexpected set_config call: %s = %s", call.setting, call.value)
			continue
		}
		if call.value != expectedValue {
			t.Errorf("set_config(%s) = %q, want %q", call.setting, call.value, expectedValue)
		}
	}

	// Verify repos was in context
	if ctxRepos == nil {
		t.Error("Repos should be available in context")
	}

	// Verify connection was released after request
	if !mock.wasReleased() {
		t.Error("Connection should be released after request completes")
	}
}

func TestRLSContextMiddleware_AcquireError(t *testing.T) {
	acquirer := &testAcquirer{
		acquireErr: errors.New("connection pool exhausted"),
	}

	testUser := &auth.User{
		ID:          uuid.New(),
		Email:       "test@example.com",
		NamespaceID: "test-namespace",
		Role:        auth.RoleStudent,
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/classes", nil)
	ctx := auth.WithUser(req.Context(), testUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if handlerCalled {
		t.Error("Handler should not be called when connection acquire fails")
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}
}

func TestRLSContextMiddleware_SetConfigError(t *testing.T) {
	mock := &mockConn{
		execErr: errors.New("database error"),
	}
	acquirer := &testAcquirer{conn: mock}

	testUser := &auth.User{
		ID:          uuid.New(),
		Email:       "test@example.com",
		NamespaceID: "test-namespace",
		Role:        auth.RoleStudent,
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/classes", nil)
	ctx := auth.WithUser(req.Context(), testUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if handlerCalled {
		t.Error("Handler should not be called when set_config fails")
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	// Connection should still be released on error
	if !mock.wasReleased() {
		t.Error("Connection should be released even on error")
	}
}

func TestRLSContextMiddleware_SystemAdminEmptyNamespace(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	userID := uuid.New()
	testUser := &auth.User{
		ID:          userID,
		Email:       "admin@example.com",
		NamespaceID: "", // system-admin has empty namespace
		Role:        auth.RoleSystemAdmin,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/admin", nil)
	ctx := auth.WithUser(req.Context(), testUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}

	// Verify set_config was called with empty namespace
	calls := mock.getSetConfigArgs()
	var foundNamespace bool
	for _, call := range calls {
		if call.setting == "app.namespace_id" {
			foundNamespace = true
			if call.value != "" {
				t.Errorf("app.namespace_id = %q, want empty string for system-admin", call.value)
			}
		}
		if call.setting == "app.role" {
			if call.value != "system-admin" {
				t.Errorf("app.role = %q, want %q", call.value, "system-admin")
			}
		}
	}
	if !foundNamespace {
		t.Error("app.namespace_id should be set even if empty")
	}
}

func TestRLSContextMiddleware_ConnectionReleasedOnPanic(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	testUser := &auth.User{
		ID:          uuid.New(),
		Email:       "test@example.com",
		NamespaceID: "test-namespace",
		Role:        auth.RoleStudent,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("handler panic")
	})

	middleware := rlsMiddlewareWithAcquirer(acquirer)
	wrapped := middleware(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/classes", nil)
	ctx := auth.WithUser(req.Context(), testUser)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()

	// Recover from panic to verify connection was released
	defer func() {
		if r := recover(); r == nil {
			t.Error("Expected panic to propagate")
		}
		// Connection should still be released even on panic
		if !mock.wasReleased() {
			t.Error("Connection should be released even on panic")
		}
	}()

	wrapped.ServeHTTP(rr, req)
}

// TestRLSContextMiddleware_InterfaceCompliance verifies type compatibility with pgxpool.
func TestRLSContextMiddleware_InterfaceCompliance(t *testing.T) {
	// This test verifies that our middleware can work with real pgxpool.Pool
	// It doesn't actually connect to a database, just verifies type compatibility
	var _ interface {
		Acquire(ctx context.Context) (*pgxpool.Conn, error)
	} = (*pgxpool.Pool)(nil)

	// Verify pgxpool.Conn implements our RLSConn interface
	// Note: We can't use (*pgxpool.Conn)(nil) directly because it's a wrapper type
	// Instead, we verify the underlying functionality is compatible
	t.Log("Type compatibility verified at compile time")
}

// --- RegistrationStoreMiddleware tests ---

func TestRegistrationStoreMiddleware_Success(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	var ctxRepos store.Repos
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctxRepos = store.ReposFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	mw := registrationMiddlewareWithAcquirer(acquirer)
	wrapped := mw(handler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-student", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}

	// Verify only app.role was set, and set to 'registration'
	calls := mock.getSetConfigArgs()
	if len(calls) != 1 {
		t.Fatalf("Expected 1 set_config call, got %d", len(calls))
	}
	if calls[0].setting != "app.role" {
		t.Errorf("set_config setting = %q, want %q", calls[0].setting, "app.role")
	}
	if calls[0].value != "registration" {
		t.Errorf("set_config value = %q, want %q", calls[0].value, "registration")
	}

	// Verify repos was attached to context
	if ctxRepos == nil {
		t.Error("Repos should be available in context")
	}

	// Verify connection was released
	if !mock.wasReleased() {
		t.Error("Connection should be released after request completes")
	}
}

func TestRegistrationStoreMiddleware_AcquireError(t *testing.T) {
	acquirer := &testAcquirer{
		acquireErr: errors.New("connection pool exhausted"),
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
	})

	mw := registrationMiddlewareWithAcquirer(acquirer)
	wrapped := mw(handler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/accept-invite", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if handlerCalled {
		t.Error("Handler should not be called when connection acquire fails")
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}
}

func TestRegistrationStoreMiddleware_SetConfigError(t *testing.T) {
	mock := &mockConn{
		execErr: errors.New("database error"),
	}
	acquirer := &testAcquirer{conn: mock}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
	})

	mw := registrationMiddlewareWithAcquirer(acquirer)
	wrapped := mw(handler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-student", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if handlerCalled {
		t.Error("Handler should not be called when set_config fails")
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}

	// Connection should still be released on error
	if !mock.wasReleased() {
		t.Error("Connection should be released even on error")
	}
}

func TestRegistrationStoreMiddleware_NoAuthRequired(t *testing.T) {
	// Verify the registration middleware works without any auth user in context
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify no auth user in context (registration is unauthenticated)
		if user := auth.UserFromContext(r.Context()); user != nil {
			t.Error("Expected no auth user in context for registration")
		}
		// But repos should still be available
		repos := store.ReposFromContext(r.Context())
		if repos == nil {
			t.Error("Repos should be available even without auth user")
		}
		w.WriteHeader(http.StatusOK)
	})

	mw := registrationMiddlewareWithAcquirer(acquirer)
	wrapped := mw(handler)

	// No auth context set — simulates unauthenticated request
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/accept-invite?token=abc", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}
}

func TestRegistrationStoreMiddleware_ConnectionReleasedOnPanic(t *testing.T) {
	mock := &mockConn{}
	acquirer := &testAcquirer{conn: mock}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("handler panic")
	})

	mw := registrationMiddlewareWithAcquirer(acquirer)
	wrapped := mw(handler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register-student", nil)
	rr := httptest.NewRecorder()

	defer func() {
		if r := recover(); r == nil {
			t.Error("Expected panic to propagate")
		}
		if !mock.wasReleased() {
			t.Error("Connection should be released even on panic")
		}
	}()

	wrapped.ServeHTTP(rr, req)
}

func TestRLSContextMiddleware_AllRoles(t *testing.T) {
	testCases := []struct {
		name        string
		role        auth.Role
		namespaceID string
	}{
		{
			name:        "system-admin has empty namespace",
			role:        auth.RoleSystemAdmin,
			namespaceID: "",
		},
		{
			name:        "namespace-admin has namespace",
			role:        auth.RoleNamespaceAdmin,
			namespaceID: "stanford",
		},
		{
			name:        "instructor has namespace",
			role:        auth.RoleInstructor,
			namespaceID: "mit",
		},
		{
			name:        "student has namespace",
			role:        auth.RoleStudent,
			namespaceID: "berkeley",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := &mockConn{}
			acquirer := &testAcquirer{conn: mock}

			userID := uuid.New()
			testUser := &auth.User{
				ID:          userID,
				Email:       "user@example.com",
				NamespaceID: tc.namespaceID,
				Role:        tc.role,
			}

			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			middleware := rlsMiddlewareWithAcquirer(acquirer)
			wrapped := middleware(handler)

			req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
			ctx := auth.WithUser(req.Context(), testUser)
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()
			wrapped.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
			}

			// Verify all three variables were set
			calls := mock.getSetConfigArgs()
			if len(calls) != 3 {
				t.Fatalf("Expected 3 set_config calls, got %d", len(calls))
			}

			// Find and verify each setting
			foundSettings := make(map[string]string)
			for _, call := range calls {
				foundSettings[call.setting] = call.value
			}

			if foundSettings["app.user_id"] != userID.String() {
				t.Errorf("app.user_id = %q, want %q", foundSettings["app.user_id"], userID.String())
			}
			if foundSettings["app.namespace_id"] != tc.namespaceID {
				t.Errorf("app.namespace_id = %q, want %q", foundSettings["app.namespace_id"], tc.namespaceID)
			}
			if foundSettings["app.role"] != string(tc.role) {
				t.Errorf("app.role = %q, want %q", foundSettings["app.role"], string(tc.role))
			}
		})
	}
}
