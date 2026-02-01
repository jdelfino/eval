// Integration tests for sessions, session students, revisions, problems CRUD, and users.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

// seed helpers for sessions

func (db *integrationDB) createSession(ctx context.Context, t *testing.T, id uuid.UUID, nsID string, sectionID uuid.UUID, sectionName string, creatorID uuid.UUID) {
	t.Helper()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id) VALUES ($1, $2, $3, $4, '{}', $5)`,
		id, nsID, sectionID, sectionName, creatorID)
	if err != nil {
		t.Fatalf("create session %s: %v", id, err)
	}
}

func (db *integrationDB) createSessionStudent(ctx context.Context, t *testing.T, sessionID, userID uuid.UUID, name string) {
	t.Helper()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO session_students (session_id, user_id, name) VALUES ($1, $2, $3)`,
		sessionID, userID, name)
	if err != nil {
		t.Fatalf("create session student session=%s user=%s: %v", sessionID, userID, err)
	}
}

// =============================================================================
// Test: CreateSession
// =============================================================================

func TestIntegration_CreateSession(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-create-session"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	t.Run("successful creation with defaults", func(t *testing.T) {
		problem := json.RawMessage(`{"title":"Two Sum"}`)
		var sess Session
		err := conn.QueryRow(ctx,
			`INSERT INTO sessions (namespace_id, section_id, section_name, problem, creator_id)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, namespace_id, section_id, section_name, problem,
			           featured_student_id, featured_code, creator_id, participants,
			           status, created_at, last_activity, ended_at`,
			nsID, sectionID, "Section A", problem, creatorID,
		).Scan(&sess.ID, &sess.NamespaceID, &sess.SectionID, &sess.SectionName, &sess.Problem,
			&sess.FeaturedStudentID, &sess.FeaturedCode, &sess.CreatorID, &sess.Participants,
			&sess.Status, &sess.CreatedAt, &sess.LastActivity, &sess.EndedAt)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.NamespaceID != nsID {
			t.Errorf("expected namespace_id %s, got %s", nsID, sess.NamespaceID)
		}
		if sess.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, sess.SectionID)
		}
		if sess.CreatorID != creatorID {
			t.Errorf("expected creator_id %s, got %s", creatorID, sess.CreatorID)
		}
		if sess.Status != "active" {
			t.Errorf("expected default status 'active', got %s", sess.Status)
		}
		if len(sess.Participants) != 0 {
			t.Errorf("expected empty participants, got %v", sess.Participants)
		}
		if sess.FeaturedStudentID != nil {
			t.Errorf("expected nil featured_student_id, got %v", sess.FeaturedStudentID)
		}
		if sess.EndedAt != nil {
			t.Errorf("expected nil ended_at, got %v", sess.EndedAt)
		}
		if sess.CreatedAt.IsZero() {
			t.Error("created_at should be set")
		}
	})
}

// =============================================================================
// Test: GetSession
// =============================================================================

func TestIntegration_GetSession(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-get-session"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getSession := func(id uuid.UUID) (*Session, error) {
		var sess Session
		err := conn.QueryRow(ctx,
			`SELECT id, namespace_id, section_id, section_name, problem,
			        featured_student_id, featured_code, creator_id, participants,
			        status, created_at, last_activity, ended_at
			 FROM sessions WHERE id = $1`, id).Scan(
			&sess.ID, &sess.NamespaceID, &sess.SectionID, &sess.SectionName, &sess.Problem,
			&sess.FeaturedStudentID, &sess.FeaturedCode, &sess.CreatorID, &sess.Participants,
			&sess.Status, &sess.CreatedAt, &sess.LastActivity, &sess.EndedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &sess, nil
	}

	t.Run("found", func(t *testing.T) {
		sess, err := getSession(sessionID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.ID != sessionID {
			t.Errorf("expected id %s, got %s", sessionID, sess.ID)
		}
		if sess.CreatorID != creatorID {
			t.Errorf("expected creator_id %s, got %s", creatorID, sess.CreatorID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getSession(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListSessions
// =============================================================================

func TestIntegration_ListSessions(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-list-sessions"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sec1 := uuid.New()
	sec2 := uuid.New()
	db.createSection(ctx, t, sec1, nsID, classID, "Section A", "JOIN1")
	db.createSection(ctx, t, sec2, nsID, classID, "Section B", "JOIN2")

	s1 := uuid.New()
	s2 := uuid.New()
	s3 := uuid.New()
	db.createSession(ctx, t, s1, nsID, sec1, "Section A", creatorID)
	time.Sleep(10 * time.Millisecond)
	db.createSession(ctx, t, s2, nsID, sec1, "Section A", creatorID)
	time.Sleep(10 * time.Millisecond)
	db.createSession(ctx, t, s3, nsID, sec2, "Section B", creatorID)

	// End session s3
	_, err := db.pool.Exec(ctx, `UPDATE sessions SET status = 'completed' WHERE id = $1`, s3)
	if err != nil {
		t.Fatalf("update session status: %v", err)
	}

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listSessions := func(filters SessionFilters) []Session {
		t.Helper()
		query := `SELECT id, namespace_id, section_id, section_name, problem,
		                 featured_student_id, featured_code, creator_id, participants,
		                 status, created_at, last_activity, ended_at
		          FROM sessions WHERE 1=1`
		var args []any
		argIdx := 1
		if filters.SectionID != nil {
			query += fmt.Sprintf(" AND section_id = $%d", argIdx)
			args = append(args, *filters.SectionID)
			argIdx++
		}
		if filters.Status != nil {
			query += fmt.Sprintf(" AND status = $%d", argIdx)
			args = append(args, *filters.Status)
		}
		query += " ORDER BY created_at DESC"

		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		defer rows.Close()
		var sessions []Session
		for rows.Next() {
			var s Session
			if err := rows.Scan(&s.ID, &s.NamespaceID, &s.SectionID, &s.SectionName, &s.Problem,
				&s.FeaturedStudentID, &s.FeaturedCode, &s.CreatorID, &s.Participants,
				&s.Status, &s.CreatedAt, &s.LastActivity, &s.EndedAt); err != nil {
				t.Fatalf("scan: %v", err)
			}
			sessions = append(sessions, s)
		}
		return sessions
	}

	t.Run("no filters returns all desc", func(t *testing.T) {
		results := listSessions(SessionFilters{})
		if len(results) != 3 {
			t.Fatalf("expected 3 sessions, got %d", len(results))
		}
		// Should be DESC order: s3, s2, s1
		if results[0].ID != s3 {
			t.Errorf("expected first session %s (newest), got %s", s3, results[0].ID)
		}
	})

	t.Run("filter by section_id", func(t *testing.T) {
		results := listSessions(SessionFilters{SectionID: &sec1})
		if len(results) != 2 {
			t.Errorf("expected 2 sessions in section A, got %d", len(results))
		}
	})

	t.Run("filter by status", func(t *testing.T) {
		status := "active"
		results := listSessions(SessionFilters{Status: &status})
		if len(results) != 2 {
			t.Errorf("expected 2 active sessions, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: UpdateSession
// =============================================================================

func TestIntegration_UpdateSession(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-update-session"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateSession := func(id uuid.UUID, params UpdateSessionParams) (*Session, error) {
		query := `UPDATE sessions SET last_activity = now()`
		args := []any{id}
		argIdx := 2

		if params.FeaturedStudentID != nil {
			query += fmt.Sprintf(", featured_student_id = $%d", argIdx)
			args = append(args, *params.FeaturedStudentID)
			argIdx++
		}
		if params.FeaturedCode != nil {
			query += fmt.Sprintf(", featured_code = $%d", argIdx)
			args = append(args, *params.FeaturedCode)
			argIdx++
		}
		if params.Status != nil {
			query += fmt.Sprintf(", status = $%d", argIdx)
			args = append(args, *params.Status)
			argIdx++
		}
		if params.EndedAt != nil {
			query += fmt.Sprintf(", ended_at = $%d", argIdx)
			args = append(args, *params.EndedAt)
			argIdx++
		}
		if params.ClearEndedAt {
			query += ", ended_at = NULL"
		}
		if params.ClearFeatured {
			query += ", featured_student_id = NULL, featured_code = NULL"
		}
		query += ` WHERE id = $1
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

		var sess Session
		err := conn.QueryRow(ctx, query, args...).Scan(
			&sess.ID, &sess.NamespaceID, &sess.SectionID, &sess.SectionName, &sess.Problem,
			&sess.FeaturedStudentID, &sess.FeaturedCode, &sess.CreatorID, &sess.Participants,
			&sess.Status, &sess.CreatedAt, &sess.LastActivity, &sess.EndedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &sess, nil
	}

	t.Run("update featured student", func(t *testing.T) {
		code := "print('hello')"
		sess, err := updateSession(sessionID, UpdateSessionParams{
			FeaturedStudentID: &studentID,
			FeaturedCode:      &code,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.FeaturedStudentID == nil || *sess.FeaturedStudentID != studentID {
			t.Errorf("expected featured_student_id %s, got %v", studentID, sess.FeaturedStudentID)
		}
		if sess.FeaturedCode == nil || *sess.FeaturedCode != code {
			t.Errorf("expected featured_code %q, got %v", code, sess.FeaturedCode)
		}
	})

	t.Run("clear featured", func(t *testing.T) {
		sess, err := updateSession(sessionID, UpdateSessionParams{ClearFeatured: true})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.FeaturedStudentID != nil {
			t.Errorf("expected nil featured_student_id, got %v", sess.FeaturedStudentID)
		}
		if sess.FeaturedCode != nil {
			t.Errorf("expected nil featured_code, got %v", sess.FeaturedCode)
		}
	})

	t.Run("update status and ended_at", func(t *testing.T) {
		status := "completed"
		now := time.Now()
		sess, err := updateSession(sessionID, UpdateSessionParams{
			Status:  &status,
			EndedAt: &now,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.Status != "completed" {
			t.Errorf("expected status 'ended', got %s", sess.Status)
		}
		if sess.EndedAt == nil {
			t.Error("expected ended_at to be set")
		}
	})

	t.Run("clear ended_at", func(t *testing.T) {
		sess, err := updateSession(sessionID, UpdateSessionParams{ClearEndedAt: true})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.EndedAt != nil {
			t.Errorf("expected nil ended_at, got %v", sess.EndedAt)
		}
	})

	t.Run("not found", func(t *testing.T) {
		status := "completed"
		_, err := updateSession(uuid.New(), UpdateSessionParams{Status: &status})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: JoinSession
// =============================================================================

func TestIntegration_JoinSession(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-join-session"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	// JoinSession uses a transaction (INSERT + UPDATE participants), so we replicate both statements.
	joinSession := func(params JoinSessionParams) (*SessionStudent, error) {
		tx, err := db.pool.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx) //nolint:errcheck

		var ss SessionStudent
		err = tx.QueryRow(ctx,
			`INSERT INTO session_students (session_id, user_id, name)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (session_id, user_id) DO UPDATE SET name = EXCLUDED.name
			 RETURNING id, session_id, user_id, name, code, execution_settings, last_update`,
			params.SessionID, params.UserID, params.Name,
		).Scan(&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name, &ss.Code, &ss.ExecutionSettings, &ss.LastUpdate)
		if err != nil {
			return nil, err
		}

		_, err = tx.Exec(ctx,
			`UPDATE sessions SET participants = array_append(participants, $2)
			 WHERE id = $1 AND NOT ($2 = ANY(participants))`,
			params.SessionID, params.UserID)
		if err != nil {
			return nil, err
		}

		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &ss, nil
	}

	t.Run("first join", func(t *testing.T) {
		ss, err := joinSession(JoinSessionParams{SessionID: sessionID, UserID: studentID, Name: "Alice"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ss.SessionID != sessionID {
			t.Errorf("expected session_id %s, got %s", sessionID, ss.SessionID)
		}
		if ss.UserID != studentID {
			t.Errorf("expected user_id %s, got %s", studentID, ss.UserID)
		}
		if ss.Name != "Alice" {
			t.Errorf("expected name Alice, got %s", ss.Name)
		}
		if ss.Code != "" {
			t.Errorf("expected empty code, got %q", ss.Code)
		}

		// Verify participants array updated
		var participants []uuid.UUID
		err = db.pool.QueryRow(ctx, "SELECT participants FROM sessions WHERE id = $1", sessionID).Scan(&participants)
		if err != nil {
			t.Fatalf("query participants: %v", err)
		}
		found := false
		for _, p := range participants {
			if p == studentID {
				found = true
			}
		}
		if !found {
			t.Error("student should be in participants array")
		}
	})

	t.Run("idempotent rejoin updates name", func(t *testing.T) {
		ss, err := joinSession(JoinSessionParams{SessionID: sessionID, UserID: studentID, Name: "Alice Updated"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ss.Name != "Alice Updated" {
			t.Errorf("expected name 'Alice Updated', got %s", ss.Name)
		}

		// Verify participants not duplicated
		var participants []uuid.UUID
		err = db.pool.QueryRow(ctx, "SELECT participants FROM sessions WHERE id = $1", sessionID).Scan(&participants)
		if err != nil {
			t.Fatalf("query participants: %v", err)
		}
		count := 0
		for _, p := range participants {
			if p == studentID {
				count++
			}
		}
		if count != 1 {
			t.Errorf("expected student once in participants, found %d times", count)
		}
	})
}

// =============================================================================
// Test: UpdateCode
// =============================================================================

func TestIntegration_UpdateCode(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-update-code"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	db.createSessionStudent(ctx, t, sessionID, studentID, "Alice")

	updateCode := func(sessID, userID uuid.UUID, code string) (*SessionStudent, error) {
		tx, err := db.pool.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx) //nolint:errcheck

		var ss SessionStudent
		err = tx.QueryRow(ctx,
			`UPDATE session_students SET code = $3, last_update = now()
			 WHERE session_id = $1 AND user_id = $2
			 RETURNING id, session_id, user_id, name, code, execution_settings, last_update`,
			sessID, userID, code,
		).Scan(&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name, &ss.Code, &ss.ExecutionSettings, &ss.LastUpdate)
		if err != nil {
			return nil, HandleNotFound(err)
		}

		_, err = tx.Exec(ctx, "UPDATE sessions SET last_activity = now() WHERE id = $1", sessID)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &ss, nil
	}

	t.Run("update code", func(t *testing.T) {
		ss, err := updateCode(sessionID, studentID, "x = 42")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ss.Code != "x = 42" {
			t.Errorf("expected code 'x = 42', got %q", ss.Code)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := updateCode(sessionID, uuid.New(), "code")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListSessionStudents
// =============================================================================

func TestIntegration_ListSessionStudents(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-list-ss"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	s1 := uuid.New()
	s2 := uuid.New()
	db.createUser(ctx, t, s1, "s1@test.com", "student", nsID)
	db.createUser(ctx, t, s2, "s2@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	db.createSessionStudent(ctx, t, sessionID, s1, "Student 1")
	time.Sleep(10 * time.Millisecond)
	db.createSessionStudent(ctx, t, sessionID, s2, "Student 2")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listStudents := func(sessID uuid.UUID) []SessionStudent {
		t.Helper()
		rows, err := conn.Query(ctx,
			`SELECT id, session_id, user_id, name, code, execution_settings, last_update
			 FROM session_students WHERE session_id = $1 ORDER BY last_update DESC`, sessID)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		defer rows.Close()
		var students []SessionStudent
		for rows.Next() {
			var ss SessionStudent
			if err := rows.Scan(&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name, &ss.Code, &ss.ExecutionSettings, &ss.LastUpdate); err != nil {
				t.Fatalf("scan: %v", err)
			}
			students = append(students, ss)
		}
		return students
	}

	t.Run("returns students desc by last_update", func(t *testing.T) {
		results := listStudents(sessionID)
		if len(results) != 2 {
			t.Fatalf("expected 2 students, got %d", len(results))
		}
		// s2 was created later, should be first (DESC)
		if results[0].UserID != s2 {
			t.Errorf("expected first student %s, got %s", s2, results[0].UserID)
		}
	})

	t.Run("empty session", func(t *testing.T) {
		results := listStudents(uuid.New())
		if len(results) != 0 {
			t.Errorf("expected 0 students, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: GetSessionStudent
// =============================================================================

func TestIntegration_GetSessionStudent(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-get-ss"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	db.createSessionStudent(ctx, t, sessionID, studentID, "Alice")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getSessionStudent := func(sessID, userID uuid.UUID) (*SessionStudent, error) {
		var ss SessionStudent
		err := conn.QueryRow(ctx,
			`SELECT id, session_id, user_id, name, code, execution_settings, last_update
			 FROM session_students WHERE session_id = $1 AND user_id = $2`,
			sessID, userID).Scan(&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name, &ss.Code, &ss.ExecutionSettings, &ss.LastUpdate)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &ss, nil
	}

	t.Run("found", func(t *testing.T) {
		ss, err := getSessionStudent(sessionID, studentID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ss.Name != "Alice" {
			t.Errorf("expected name Alice, got %s", ss.Name)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getSessionStudent(sessionID, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: CreateRevision
// =============================================================================

func TestIntegration_CreateRevision(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-create-rev"
	db.createNamespace(ctx, t, nsID, "Test NS")
	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	t.Run("create full code revision", func(t *testing.T) {
		fullCode := "print('hello')"
		execResult := json.RawMessage(`{"status":"ok"}`)
		var rev Revision
		err := conn.QueryRow(ctx,
			`INSERT INTO revisions (namespace_id, session_id, user_id, is_diff, diff, full_code, base_revision_id, execution_result)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, namespace_id, session_id, user_id, timestamp,
			           is_diff, diff, full_code, base_revision_id, execution_result`,
			nsID, sessionID, creatorID, false, nil, &fullCode, nil, execResult,
		).Scan(&rev.ID, &rev.NamespaceID, &rev.SessionID, &rev.UserID, &rev.Timestamp,
			&rev.IsDiff, &rev.Diff, &rev.FullCode, &rev.BaseRevisionID, &rev.ExecutionResult)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if rev.SessionID != sessionID {
			t.Errorf("expected session_id %s, got %s", sessionID, rev.SessionID)
		}
		if rev.IsDiff {
			t.Error("expected is_diff=false")
		}
		if rev.FullCode == nil || *rev.FullCode != fullCode {
			t.Errorf("expected full_code %q, got %v", fullCode, rev.FullCode)
		}
		if rev.Timestamp.IsZero() {
			t.Error("timestamp should be set")
		}
	})
}

// =============================================================================
// Test: ListRevisions
// =============================================================================

func TestIntegration_ListRevisions(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-list-rev"
	db.createNamespace(ctx, t, nsID, "Test NS")
	user1 := uuid.New()
	user2 := uuid.New()
	db.createUser(ctx, t, user1, "u1@test.com", "instructor", nsID)
	db.createUser(ctx, t, user2, "u2@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", user1)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", user1)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	// Insert revisions
	code1 := "code1"
	code2 := "code2"
	_, err = conn.Exec(ctx,
		`INSERT INTO revisions (namespace_id, session_id, user_id, is_diff, full_code, execution_result) VALUES ($1, $2, $3, false, $4, '{}')`,
		nsID, sessionID, user1, &code1)
	if err != nil {
		t.Fatalf("insert rev1: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	_, err = conn.Exec(ctx,
		`INSERT INTO revisions (namespace_id, session_id, user_id, is_diff, full_code, execution_result) VALUES ($1, $2, $3, false, $4, '{}')`,
		nsID, sessionID, user2, &code2)
	if err != nil {
		t.Fatalf("insert rev2: %v", err)
	}

	listRevisions := func(sessID uuid.UUID, userID *uuid.UUID) []Revision {
		t.Helper()
		query := `SELECT id, namespace_id, session_id, user_id, timestamp,
		                 is_diff, diff, full_code, base_revision_id, execution_result
		          FROM revisions WHERE session_id = $1`
		args := []any{sessID}
		if userID != nil {
			query += " AND user_id = $2"
			args = append(args, *userID)
		}
		query += " ORDER BY timestamp"
		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		defer rows.Close()
		var revs []Revision
		for rows.Next() {
			var r Revision
			if err := rows.Scan(&r.ID, &r.NamespaceID, &r.SessionID, &r.UserID, &r.Timestamp,
				&r.IsDiff, &r.Diff, &r.FullCode, &r.BaseRevisionID, &r.ExecutionResult); err != nil {
				t.Fatalf("scan: %v", err)
			}
			revs = append(revs, r)
		}
		return revs
	}

	t.Run("all revisions for session", func(t *testing.T) {
		results := listRevisions(sessionID, nil)
		if len(results) != 2 {
			t.Fatalf("expected 2 revisions, got %d", len(results))
		}
	})

	t.Run("filter by user_id", func(t *testing.T) {
		results := listRevisions(sessionID, &user1)
		if len(results) != 1 {
			t.Fatalf("expected 1 revision, got %d", len(results))
		}
		if results[0].UserID != user1 {
			t.Errorf("expected user_id %s, got %s", user1, results[0].UserID)
		}
	})

	t.Run("empty session", func(t *testing.T) {
		results := listRevisions(uuid.New(), nil)
		if len(results) != 0 {
			t.Errorf("expected 0 revisions, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: CreateProblem
// =============================================================================

func TestIntegration_CreateProblem(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-create-problem"
	db.createNamespace(ctx, t, nsID, "Test NS")
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	t.Run("successful creation", func(t *testing.T) {
		desc := "Find two numbers that sum to target"
		starter := "def two_sum(nums, target):"
		solution := "return [0, 1]"
		testCases := json.RawMessage(`[{"input":[1,2],"output":3}]`)
		execSettings := json.RawMessage(`{"timeout":5}`)

		var p Problem
		err := conn.QueryRow(ctx,
			`INSERT INTO problems (namespace_id, title, description, starter_code, test_cases,
			                       execution_settings, author_id, class_id, tags, solution)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING id, namespace_id, title, description, starter_code, test_cases,
			           execution_settings, author_id, class_id, tags, solution, created_at, updated_at`,
			nsID, "Two Sum", &desc, &starter, testCases, execSettings, authorID, &classID, []string{"easy", "arrays"}, &solution,
		).Scan(&p.ID, &p.NamespaceID, &p.Title, &p.Description, &p.StarterCode, &p.TestCases,
			&p.ExecutionSettings, &p.AuthorID, &p.ClassID, &p.Tags, &p.Solution, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Title != "Two Sum" {
			t.Errorf("expected title 'Two Sum', got %s", p.Title)
		}
		if p.AuthorID != authorID {
			t.Errorf("expected author_id %s, got %s", authorID, p.AuthorID)
		}
		if p.ClassID == nil || *p.ClassID != classID {
			t.Errorf("expected class_id %s, got %v", classID, p.ClassID)
		}
		if len(p.Tags) != 2 {
			t.Errorf("expected 2 tags, got %d", len(p.Tags))
		}
		if p.CreatedAt.IsZero() {
			t.Error("created_at should be set")
		}
	})
}

// =============================================================================
// Test: GetProblem
// =============================================================================

func TestIntegration_GetProblem(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-get-problem"
	db.createNamespace(ctx, t, nsID, "Test NS")
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Test Problem", authorID, nil, []string{"easy"})

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getProblem := func(id uuid.UUID) (*Problem, error) {
		var p Problem
		err := conn.QueryRow(ctx,
			`SELECT id, namespace_id, title, description, starter_code, test_cases,
			        execution_settings, author_id, class_id, tags, solution, created_at, updated_at
			 FROM problems WHERE id = $1`, id).Scan(
			&p.ID, &p.NamespaceID, &p.Title, &p.Description, &p.StarterCode, &p.TestCases,
			&p.ExecutionSettings, &p.AuthorID, &p.ClassID, &p.Tags, &p.Solution, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &p, nil
	}

	t.Run("found", func(t *testing.T) {
		p, err := getProblem(problemID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Title != "Test Problem" {
			t.Errorf("expected title 'Test Problem', got %s", p.Title)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getProblem(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: UpdateProblem
// =============================================================================

func TestIntegration_UpdateProblem(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-update-problem"
	db.createNamespace(ctx, t, nsID, "Test NS")
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Original Title", authorID, nil, []string{"easy"})

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateProblem := func(id uuid.UUID, params UpdateProblemParams) (*Problem, error) {
		query := `UPDATE problems
		SET title             = COALESCE($2, title),
		    description       = COALESCE($3, description),
		    starter_code      = COALESCE($4, starter_code)`
		args := []any{id, params.Title, params.Description, params.StarterCode}
		argIdx := 5

		if params.TestCases != nil {
			query += fmt.Sprintf(",\n		    test_cases         = $%d", argIdx)
			args = append(args, params.TestCases)
			argIdx++
		}
		if params.ExecutionSettings != nil {
			query += fmt.Sprintf(",\n		    execution_settings = $%d", argIdx)
			args = append(args, params.ExecutionSettings)
			argIdx++
		}
		if params.ClassID != nil {
			query += fmt.Sprintf(",\n		    class_id           = $%d", argIdx)
			args = append(args, *params.ClassID)
			argIdx++
		}
		if params.Tags != nil {
			query += fmt.Sprintf(",\n		    tags               = $%d", argIdx)
			args = append(args, params.Tags)
			argIdx++
		}
		if params.Solution != nil {
			query += fmt.Sprintf(",\n		    solution           = $%d", argIdx)
			args = append(args, *params.Solution)
		}
		query += `,
		    updated_at        = now()
		WHERE id = $1
		RETURNING id, namespace_id, title, description, starter_code, test_cases,
		          execution_settings, author_id, class_id, tags, solution, created_at, updated_at`

		var p Problem
		err := conn.QueryRow(ctx, query, args...).Scan(
			&p.ID, &p.NamespaceID, &p.Title, &p.Description, &p.StarterCode, &p.TestCases,
			&p.ExecutionSettings, &p.AuthorID, &p.ClassID, &p.Tags, &p.Solution, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &p, nil
	}

	t.Run("partial update title only", func(t *testing.T) {
		newTitle := "Updated Title"
		p, err := updateProblem(problemID, UpdateProblemParams{Title: &newTitle})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Title != "Updated Title" {
			t.Errorf("expected title 'Updated Title', got %s", p.Title)
		}
	})

	t.Run("update tags", func(t *testing.T) {
		newTitle := "Updated Title"
		p, err := updateProblem(problemID, UpdateProblemParams{Title: &newTitle, Tags: []string{"medium", "trees"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(p.Tags) != 2 || p.Tags[0] != "medium" {
			t.Errorf("expected tags [medium trees], got %v", p.Tags)
		}
	})

	t.Run("not found", func(t *testing.T) {
		title := "nope"
		_, err := updateProblem(uuid.New(), UpdateProblemParams{Title: &title})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: DeleteProblem
// =============================================================================

func TestIntegration_DeleteProblem(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-delete-problem"
	db.createNamespace(ctx, t, nsID, "Test NS")
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "To Delete", authorID, nil, nil)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	deleteProblem := func(id uuid.UUID) error {
		tag, err := conn.Exec(ctx, "DELETE FROM problems WHERE id = $1", id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}

	t.Run("delete existing", func(t *testing.T) {
		if err := deleteProblem(problemID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		err = db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM problems WHERE id = $1", problemID).Scan(&count)
		if err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 0 {
			t.Error("problem should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		err := deleteProblem(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListProblems
// =============================================================================

func TestIntegration_ListProblems(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-list-problems"
	db.createNamespace(ctx, t, nsID, "Test NS")
	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	p1 := uuid.New()
	p2 := uuid.New()
	db.createProblem(ctx, t, p1, nsID, "Problem A", authorID, &classID, nil)
	time.Sleep(10 * time.Millisecond)
	db.createProblem(ctx, t, p2, nsID, "Problem B", authorID, nil, nil)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listProblems := func(classFilter *uuid.UUID) []Problem {
		t.Helper()
		query := `SELECT id, namespace_id, title, description, starter_code, test_cases,
		                 execution_settings, author_id, class_id, tags, solution, created_at, updated_at
		          FROM problems`
		var args []any
		if classFilter != nil {
			query += " WHERE class_id = $1"
			args = append(args, *classFilter)
		}
		query += " ORDER BY created_at"
		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		defer rows.Close()
		var problems []Problem
		for rows.Next() {
			var p Problem
			if err := rows.Scan(&p.ID, &p.NamespaceID, &p.Title, &p.Description, &p.StarterCode,
				&p.TestCases, &p.ExecutionSettings, &p.AuthorID, &p.ClassID, &p.Tags, &p.Solution,
				&p.CreatedAt, &p.UpdatedAt); err != nil {
				t.Fatalf("scan: %v", err)
			}
			problems = append(problems, p)
		}
		return problems
	}

	t.Run("no filter", func(t *testing.T) {
		results := listProblems(nil)
		if len(results) != 2 {
			t.Errorf("expected 2 problems, got %d", len(results))
		}
		if len(results) == 2 && results[0].ID != p1 {
			t.Errorf("expected first problem %s (oldest), got %s", p1, results[0].ID)
		}
	})

	t.Run("filter by class_id", func(t *testing.T) {
		results := listProblems(&classID)
		if len(results) != 1 {
			t.Errorf("expected 1 problem in class, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: GetUserByID
// =============================================================================

func TestIntegration_GetUserByID(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-get-user-id"
	db.createNamespace(ctx, t, nsID, "Test NS")
	userID := uuid.New()
	db.createUser(ctx, t, userID, "byid@test.com", "student", nsID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getUserByID := func(id uuid.UUID) (*User, error) {
		var u User
		err := conn.QueryRow(ctx,
			`SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
			 FROM users WHERE id = $1`, id).Scan(
			&u.ID, &u.ExternalID, &u.Email, &u.Role, &u.NamespaceID, &u.DisplayName, &u.CreatedAt, &u.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &u, nil
	}

	t.Run("found", func(t *testing.T) {
		u, err := getUserByID(userID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.ID != userID {
			t.Errorf("expected id %s, got %s", userID, u.ID)
		}
		if u.Email != "byid@test.com" {
			t.Errorf("expected email byid@test.com, got %s", u.Email)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getUserByID(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: GetUserByExternalID
// =============================================================================

func TestIntegration_GetUserByExternalID(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-get-user-ext"
	db.createNamespace(ctx, t, nsID, "Test NS")
	userID := uuid.New()
	extID := "firebase-uid-123"
	// Insert user with external_id
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, external_id, email, role, namespace_id) VALUES ($1, $2, $3, $4, $5)`,
		userID, extID, "ext@test.com", "student", nsID)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getUserByExternalID := func(externalID string) (*User, error) {
		var u User
		err := conn.QueryRow(ctx,
			`SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
			 FROM users WHERE external_id = $1`, externalID).Scan(
			&u.ID, &u.ExternalID, &u.Email, &u.Role, &u.NamespaceID, &u.DisplayName, &u.CreatedAt, &u.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &u, nil
	}

	t.Run("found", func(t *testing.T) {
		u, err := getUserByExternalID(extID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.ID != userID {
			t.Errorf("expected id %s, got %s", userID, u.ID)
		}
		if u.ExternalID == nil || *u.ExternalID != extID {
			t.Errorf("expected external_id %s, got %v", extID, u.ExternalID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getUserByExternalID("nonexistent-uid")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: UpdateUser
// =============================================================================

func TestIntegration_UpdateUser(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()
	db.cleanup(ctx, t)

	nsID := "test-ns-update-user"
	db.createNamespace(ctx, t, nsID, "Test NS")
	userID := uuid.New()
	db.createUser(ctx, t, userID, "update@test.com", "student", nsID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateUser := func(id uuid.UUID, params UpdateUserParams) (*User, error) {
		var u User
		err := conn.QueryRow(ctx,
			`UPDATE users
			 SET display_name = COALESCE($2, display_name), updated_at = now()
			 WHERE id = $1
			 RETURNING id, external_id, email, role, namespace_id, display_name, created_at, updated_at`,
			id, params.DisplayName).Scan(
			&u.ID, &u.ExternalID, &u.Email, &u.Role, &u.NamespaceID, &u.DisplayName, &u.CreatedAt, &u.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &u, nil
	}

	t.Run("update display name", func(t *testing.T) {
		name := "New Name"
		u, err := updateUser(userID, UpdateUserParams{DisplayName: &name})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.DisplayName == nil || *u.DisplayName != "New Name" {
			t.Errorf("expected display_name 'New Name', got %v", u.DisplayName)
		}
	})

	t.Run("nil display name keeps current", func(t *testing.T) {
		u, err := updateUser(userID, UpdateUserParams{DisplayName: nil})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.DisplayName == nil || *u.DisplayName != "New Name" {
			t.Errorf("expected display_name to remain 'New Name', got %v", u.DisplayName)
		}
	})

	t.Run("not found", func(t *testing.T) {
		name := "nope"
		_, err := updateUser(uuid.New(), UpdateUserParams{DisplayName: &name})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// Ensure imports are used.
var _ = json.RawMessage{}
var _ = fmt.Sprintf
