// Integration tests for migration 027: search-path hardening of the
// SECURITY DEFINER functions from migration 010 (add_session_participant,
// touch_session_activity).
//
// The migration adds `SET search_path = public, pg_temp` to each function
// WITHOUT changing behavior. These tests prove two things against the migrated
// schema (the integration harness applies all migrations, including 027):
//
//  1. Hardening is actually in place: pg_proc.proconfig for each function lists
//     the pinned search_path. (Fails if a function was missed or replaced
//     without the clause.)
//  2. Behavior is unchanged: each function still performs its single narrow,
//     RLS-bypassing write exactly as before — add_session_participant appends a
//     participant (idempotently), touch_session_activity advances last_activity.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration027
package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// TestIntegration_Migration027_SecdefSearchPathHardened asserts that each
// hardened SECURITY DEFINER function carries the pinned search_path in pg_proc.
func TestIntegration_Migration027_SecdefSearchPathHardened(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)
	ctx := context.Background()

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "RESET ROLE"); err != nil {
		t.Fatalf("reset role: %v", err)
	}

	for _, fn := range []string{
		"add_session_participant",
		"touch_session_activity",
		"public_author_display_name", // already hardened in 023; guards against regression
	} {
		t.Run(fn, func(t *testing.T) {
			var prosecdef bool
			var proconfig []string
			err := conn.QueryRow(ctx, `
				SELECT prosecdef, coalesce(proconfig, '{}')
				FROM pg_proc
				WHERE proname = $1
			`, fn).Scan(&prosecdef, &proconfig)
			if err != nil {
				t.Fatalf("query pg_proc for %s: %v", fn, err)
			}
			if !prosecdef {
				t.Fatalf("%s should be SECURITY DEFINER", fn)
			}
			found := false
			for _, c := range proconfig {
				if c == "search_path=public, pg_temp" {
					found = true
				}
			}
			if !found {
				t.Fatalf("%s missing pinned search_path; proconfig=%v", fn, proconfig)
			}
		})
	}
}

// TestIntegration_Migration027_AddSessionParticipantBehavior verifies the
// hardened add_session_participant still appends a participant idempotently and
// bypasses the sessions_update RLS policy (called here under a student's RLS
// context, which the policy would otherwise forbid).
func TestIntegration_Migration027_AddSessionParticipantBehavior(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)
	ctx := context.Background()
	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "secdef-creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "secdef-student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "SECDEF1")
	db.createMembership(ctx, t, studentID, sectionID, "student")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	studentUser := &auth.User{ID: studentID, Email: "secdef-student@test.com", NamespaceID: nsID, Role: auth.RoleStudent}

	// Call the function directly under the student's RLS context. Without the
	// SECURITY DEFINER bypass the sessions_update policy (creator/instructor/admin
	// only) would make this a no-op; the function must still bypass it.
	_, conn := db.storeWithRLS(ctx, t, studentUser)
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT add_session_participant($1, $2)", sessionID, studentID); err != nil {
		t.Fatalf("add_session_participant: %v", err)
	}
	// Idempotent: a second call must not duplicate the entry.
	if _, err := conn.Exec(ctx, "SELECT add_session_participant($1, $2)", sessionID, studentID); err != nil {
		t.Fatalf("add_session_participant (rejoin): %v", err)
	}

	var participants []uuid.UUID
	if err := db.pool.QueryRow(ctx, "SELECT participants FROM sessions WHERE id = $1", sessionID).Scan(&participants); err != nil {
		t.Fatalf("query participants: %v", err)
	}
	count := 0
	for _, p := range participants {
		if p == studentID {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected student once in participants, found %d times (participants=%v)", count, participants)
	}
}

// TestIntegration_Migration027_TouchSessionActivityBehavior verifies the hardened
// touch_session_activity still advances last_activity and bypasses sessions_update
// RLS (it is invoked here under a student's context). touch_session_activity has
// no Go store method, so it is exercised by direct SQL.
func TestIntegration_Migration027_TouchSessionActivityBehavior(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)
	ctx := context.Background()
	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "touch-creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "touch-student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "TOUCH1")
	db.createMembership(ctx, t, studentID, sectionID, "student")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	// Pin last_activity to a known-old value as superuser so we can assert it moves.
	old := time.Now().Add(-1 * time.Hour)
	if err := db.execAsSuperuser(ctx, "UPDATE sessions SET last_activity = $2 WHERE id = $1", sessionID, old); err != nil {
		t.Fatalf("seed last_activity: %v", err)
	}

	studentUser := &auth.User{ID: studentID, Email: "touch-student@test.com", NamespaceID: nsID, Role: auth.RoleStudent}
	_, conn := db.storeWithRLS(ctx, t, studentUser)
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT touch_session_activity($1)", sessionID); err != nil {
		t.Fatalf("touch_session_activity: %v", err)
	}

	var after time.Time
	if err := db.pool.QueryRow(ctx, "SELECT last_activity FROM sessions WHERE id = $1", sessionID).Scan(&after); err != nil {
		t.Fatalf("query last_activity: %v", err)
	}
	if !after.After(old) {
		t.Errorf("touch_session_activity did not advance last_activity: before=%v after=%v", old, after)
	}
}
