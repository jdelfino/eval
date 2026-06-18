// Integration tests for sessions, session students, revisions, problems CRUD, and users.
//
// These tests validate actual Store methods with proper RLS context,
// ensuring that the SQL queries, scanning logic, and RLS policies work
// together as they would in production.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration
package store

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// seed helpers for sessions

func (db *integrationDB) createSession(ctx context.Context, t *testing.T, id uuid.UUID, nsID string, sectionID uuid.UUID, sectionName string, creatorID uuid.UUID) {
	t.Helper()
	err := db.execAsSuperuser(ctx,
		`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id) VALUES ($1, $2, $3, $4, '{}', $5)`,
		id, nsID, sectionID, sectionName, creatorID)
	if err != nil {
		t.Fatalf("create session %s: %v", id, err)
	}
}

func (db *integrationDB) createSessionStudent(ctx context.Context, t *testing.T, sessionID, userID uuid.UUID, name string) {
	t.Helper()

	// Get session to extract problem_id and section_id
	var problemID, sectionID uuid.UUID
	var problemJSON json.RawMessage
	err := db.pool.QueryRow(ctx,
		`SELECT problem, section_id FROM sessions WHERE id = $1`,
		sessionID).Scan(&problemJSON, &sectionID)
	if err != nil {
		t.Fatalf("get session %s: %v", sessionID, err)
	}

	// Extract problem_id from problem JSON (if it exists)
	var problem struct {
		ID uuid.UUID `json:"id"`
	}
	if len(problemJSON) > 2 { // not just "{}"
		if err := json.Unmarshal(problemJSON, &problem); err != nil {
			t.Fatalf("unmarshal problem JSON: %v", err)
		}
		problemID = problem.ID
	}

	// If no problem_id in session, create a dummy problem
	if problemID == uuid.Nil {
		problemID = uuid.New()
		err = db.execAsSuperuser(ctx,
			`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
			problemID, db.nsID, "Test Problem", userID)
		if err != nil {
			t.Fatalf("create problem %s: %v", problemID, err)
		}
	}

	// Create or get student_work
	var workID uuid.UUID
	err = db.pool.QueryRow(ctx, `
		INSERT INTO student_work (namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, '')
		ON CONFLICT (user_id, problem_id, section_id) DO UPDATE SET code = student_work.code
		RETURNING id
	`, db.nsID, userID, problemID, sectionID).Scan(&workID)
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	// Create session_student with student_work_id
	err = db.execAsSuperuser(ctx,
		`INSERT INTO session_students (session_id, user_id, name, student_work_id) VALUES ($1, $2, $3, $4)`,
		sessionID, userID, name, workID)
	if err != nil {
		t.Fatalf("create session student session=%s user=%s: %v", sessionID, userID, err)
	}
}

// =============================================================================
// Test: CreateSession - calls actual Store method with RLS
// =============================================================================

func TestIntegration_CreateSession(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful creation with defaults", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		problem := json.RawMessage(`{"title":"Two Sum"}`)
		sess, err := s.CreateSession(ctx, CreateSessionParams{
			NamespaceID: nsID,
			SectionID:   sectionID,
			SectionName: "Section A",
			Problem:     problem,
			CreatorID:   creatorID,
		})
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
// Test: Section current-session pointer (G4) - SetSectionCurrentSession,
// ClearSectionCurrentSession, and read-path exposure across GetSection,
// ListSectionsByClass, ListMySections.
// =============================================================================

func TestIntegration_SectionCurrentSessionPointer(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	nsID := db.nsID

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "ptr-instr@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Pointer Class", instructorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Pointer Section", "PTR1")
	// Instructor must be a section instructor for can_manage_section RLS on UPDATE.
	db.createMembership(ctx, t, instructorID, sectionID, "instructor")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Pointer Section", instructorID)

	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "ptr-instr@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("set then read across all section read paths", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		if err := s.SetSectionCurrentSession(ctx, sectionID, sessionID); err != nil {
			t.Fatalf("SetSectionCurrentSession: %v", err)
		}

		sec, err := s.GetSection(ctx, sectionID)
		if err != nil {
			t.Fatalf("GetSection: %v", err)
		}
		if sec.CurrentSessionID == nil || *sec.CurrentSessionID != sessionID {
			t.Errorf("GetSection pointer = %v, want %v", sec.CurrentSessionID, sessionID)
		}

		secs, err := s.ListSectionsByClass(ctx, classID)
		if err != nil {
			t.Fatalf("ListSectionsByClass: %v", err)
		}
		var foundList bool
		for _, x := range secs {
			if x.ID == sectionID {
				foundList = true
				if x.CurrentSessionID == nil || *x.CurrentSessionID != sessionID {
					t.Errorf("ListSectionsByClass pointer = %v, want %v", x.CurrentSessionID, sessionID)
				}
			}
		}
		if !foundList {
			t.Error("section not found in ListSectionsByClass")
		}

		mine, err := s.ListMySections(ctx, instructorID)
		if err != nil {
			t.Fatalf("ListMySections: %v", err)
		}
		var foundMine bool
		for _, info := range mine {
			if info.Section.ID == sectionID {
				foundMine = true
				if info.Section.CurrentSessionID == nil || *info.Section.CurrentSessionID != sessionID {
					t.Errorf("ListMySections pointer = %v, want %v", info.Section.CurrentSessionID, sessionID)
				}
			}
		}
		if !foundMine {
			t.Error("section not found in ListMySections")
		}
	})

	t.Run("clear nulls the pointer", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		if err := s.ClearSectionCurrentSession(ctx, sectionID); err != nil {
			t.Fatalf("ClearSectionCurrentSession: %v", err)
		}
		sec, err := s.GetSection(ctx, sectionID)
		if err != nil {
			t.Fatalf("GetSection after clear: %v", err)
		}
		if sec.CurrentSessionID != nil {
			t.Errorf("expected nil pointer after clear, got %v", *sec.CurrentSessionID)
		}
	})

	t.Run("set unknown section returns ErrNotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		if err := s.SetSectionCurrentSession(ctx, uuid.New(), sessionID); !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})

	t.Run("clear unknown section returns ErrNotFound", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authInstructor)
		defer conn.Release()

		if err := s.ClearSectionCurrentSession(ctx, uuid.New()); !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got %v", err)
		}
	})
}

// TestIntegration_InstructorDashboardPointer verifies the G4 (T13) dashboard
// live-indicator switch: InstructorDashboard derives CurrentSessionID and
// LastActivity from the section pointer (sections.current_session_id +
// the pointer session's last_activity), NOT from the retired status='active'
// lifecycle.
//
// Contract verified:
//   - a section with the pointer set surfaces CurrentSessionID + LastActivity;
//   - a section with no pointer returns nil for both;
//   - a completed-status session that is NOT the pointer does not surface
//     (proves the SQL no longer reads status='active').
//
// Why it matters: the instructor home strip / status pill key on these fields;
// a regression here either blanks live indicators or revives the dead status path.
func TestIntegration_InstructorDashboardPointer(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	nsID := db.nsID

	instructorID := uuid.New()
	db.createUser(ctx, t, instructorID, "dash-instr@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "Dashboard Class", instructorID)

	// Section A: has a pointer to an active-ish session.
	secA := uuid.New()
	db.createSection(ctx, t, secA, nsID, classID, "Section A", "DASHA")
	db.createMembership(ctx, t, instructorID, secA, "instructor")
	sessA := uuid.New()
	db.createSession(ctx, t, sessA, nsID, secA, "Section A", instructorID)

	// Section B: NO pointer, but DOES have a completed session in the section.
	// Under the old status-derived SQL this would have surfaced nothing live;
	// under the pointer model it must surface nil because the pointer is unset.
	secB := uuid.New()
	db.createSection(ctx, t, secB, nsID, classID, "Section B", "DASHB")
	db.createMembership(ctx, t, instructorID, secB, "instructor")
	sessB := uuid.New()
	db.createSession(ctx, t, sessB, nsID, secB, "Section B", instructorID)
	if err := db.execAsSuperuser(ctx,
		`UPDATE sessions SET status = 'completed' WHERE id = $1`, sessB); err != nil {
		t.Fatalf("mark sessB completed: %v", err)
	}

	authInstructor := &auth.User{
		ID:          instructorID,
		Email:       "dash-instr@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	s, conn := db.storeWithRLS(ctx, t, authInstructor)
	defer conn.Release()

	// Set the pointer on Section A only.
	if err := s.SetSectionCurrentSession(ctx, secA, sessA); err != nil {
		t.Fatalf("SetSectionCurrentSession: %v", err)
	}

	classes, err := s.InstructorDashboard(ctx, instructorID)
	if err != nil {
		t.Fatalf("InstructorDashboard: %v", err)
	}

	var found bool
	for _, c := range classes {
		for _, sec := range c.Sections {
			switch sec.ID {
			case secA:
				found = true
				if sec.CurrentSessionID == nil || *sec.CurrentSessionID != sessA {
					t.Errorf("Section A CurrentSessionID = %v, want %v", sec.CurrentSessionID, sessA)
				}
				if sec.LastActivity == nil {
					t.Error("Section A LastActivity should be populated from the pointer session")
				}
			case secB:
				if sec.CurrentSessionID != nil {
					t.Errorf("Section B has no pointer; CurrentSessionID = %v, want nil", *sec.CurrentSessionID)
				}
				if sec.LastActivity != nil {
					t.Errorf("Section B has no pointer; LastActivity = %v, want nil", *sec.LastActivity)
				}
			}
		}
	}
	if !found {
		t.Fatal("Section A not present in dashboard result")
	}
}

// TestIntegration_CreateSessionDoesNotFlipOthers verifies the G4 plain create:
// CreateSession inserts a new row and does not flip any other session's status
// to 'completed' (no leftover replacement behavior).
func TestIntegration_CreateSessionDoesNotFlipOthers(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()
	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "noflip@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "NoFlip Class", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "NoFlip Section", "NOFLIP")
	// Pre-existing active session in the section.
	existingID := uuid.New()
	db.createSession(ctx, t, existingID, nsID, sectionID, "NoFlip Section", creatorID)

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "noflip@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	s, conn := db.storeWithRLS(ctx, t, authUser)
	defer conn.Release()

	_, err := s.CreateSession(ctx, CreateSessionParams{
		NamespaceID: nsID,
		SectionID:   sectionID,
		SectionName: "NoFlip Section",
		Problem:     json.RawMessage(`{"title":"New"}`),
		CreatorID:   creatorID,
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	// The pre-existing session must be untouched (not flipped to completed).
	var status string
	if err := db.pool.QueryRow(ctx, `SELECT status FROM sessions WHERE id = $1`, existingID).Scan(&status); err != nil {
		t.Fatalf("query existing status: %v", err)
	}
	if status == "completed" {
		t.Errorf("CreateSession must not flip other sessions; existing session status = %q", status)
	}

	// No session in the section should have been completed by the create.
	var completedCount int
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM sessions WHERE section_id = $1 AND status = 'completed'`, sectionID).Scan(&completedCount); err != nil {
		t.Fatalf("count completed: %v", err)
	}
	if completedCount != 0 {
		t.Errorf("expected 0 completed sessions after create, got %d", completedCount)
	}
}

// =============================================================================
// Test: GetSession - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetSession(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		sess, err := s.GetSession(ctx, sessionID)
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
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetSession(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListSessions - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListSessions(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

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

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("no filters returns all desc", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListSessions(ctx, SessionFilters{})
		if err != nil {
			t.Fatalf("ListSessions: %v", err)
		}
		if len(results) != 3 {
			t.Fatalf("expected 3 sessions, got %d", len(results))
		}
		// Should be DESC order: s3, s2, s1
		if results[0].ID != s3 {
			t.Errorf("expected first session %s (newest), got %s", s3, results[0].ID)
		}
	})

	t.Run("filter by section_id", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListSessions(ctx, SessionFilters{SectionID: &sec1})
		if err != nil {
			t.Fatalf("ListSessions: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 sessions in section A, got %d", len(results))
		}
	})

	t.Run("filter by status", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		status := "active"
		results, err := s.ListSessions(ctx, SessionFilters{Status: &status})
		if err != nil {
			t.Fatalf("ListSessions: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 active sessions, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: UpdateSession - calls actual Store method with RLS
// =============================================================================

func TestIntegration_UpdateSession(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

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

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("update featured student", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		code := "print('hello')"
		sess, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{
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
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		sess, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{ClearFeatured: true})
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

	t.Run("code-only featuring clears student but sets code", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		// First feature a student so there's something to clear.
		code := "student code"
		_, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{
			FeaturedStudentID: &studentID,
			FeaturedCode:      &code,
		})
		if err != nil {
			t.Fatalf("setup: %v", err)
		}

		// Now do code-only featuring (the "Show Solution" path).
		solution := "def solution(): pass"
		sess, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{
			ClearFeatured: true,
			FeaturedCode:  &solution,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.FeaturedStudentID != nil {
			t.Errorf("expected nil featured_student_id, got %v", sess.FeaturedStudentID)
		}
		if sess.FeaturedCode == nil || *sess.FeaturedCode != solution {
			t.Errorf("expected featured_code %q, got %v", solution, sess.FeaturedCode)
		}
	})

	t.Run("update status and ended_at", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		status := "completed"
		now := time.Now()
		sess, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{
			Status:  &status,
			EndedAt: &now,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.Status != "completed" {
			t.Errorf("expected status 'completed', got %s", sess.Status)
		}
		if sess.EndedAt == nil {
			t.Error("expected ended_at to be set")
		}
	})

	t.Run("clear ended_at", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		sess, err := s.UpdateSession(ctx, sessionID, UpdateSessionParams{ClearEndedAt: true})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sess.EndedAt != nil {
			t.Errorf("expected nil ended_at, got %v", sess.EndedAt)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		status := "completed"
		_, err := s.UpdateSession(ctx, uuid.New(), UpdateSessionParams{Status: &status})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: JoinSession - calls actual Store method with RLS
// =============================================================================

func TestIntegration_JoinSession(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	// Student needs to be section member to see/join session
	db.createMembership(ctx, t, studentID, sectionID, "student")
	// Instructor needs section membership to update sessions
	db.createMembership(ctx, t, creatorID, sectionID, "instructor")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)

	// Use system-admin as auth user.
	// JoinSession inserts into session_students (requires user_id = app_user_id() OR is_system_admin())
	// and updates sessions.participants (requires creator/instructor/system-admin).
	// A student can insert their own record but can't update sessions.
	// An instructor can update sessions but can't insert session_students for others.
	// Only system-admin can do both.
	systemAdminID := uuid.New()
	db.createUser(ctx, t, systemAdminID, "sysadmin@test.com", "system-admin", "")
	authUser := &auth.User{
		ID:          systemAdminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "", // system-admin doesn't belong to a namespace
		Role:        auth.RoleSystemAdmin,
	}

	t.Run("first join", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		ss, err := s.JoinSession(ctx, JoinSessionParams{SessionID: sessionID, UserID: studentID, Name: "Alice"})
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
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		ss, err := s.JoinSession(ctx, JoinSessionParams{SessionID: sessionID, UserID: studentID, Name: "Alice Updated"})
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
// Test: UpdateCode - REMOVED (method no longer exists, replaced by UpdateStudentWork)
// =============================================================================

// =============================================================================
// Test: ListSessionStudents - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListSessionStudents(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

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
	// Enroll creator as instructor in section (needed for RLS to allow viewing student_work)
	if err := db.execAsSuperuser(ctx, `INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`, creatorID, sectionID); err != nil {
		t.Fatalf("enroll creator: %v", err)
	}
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	db.createSessionStudent(ctx, t, sessionID, s1, "Student 1")
	time.Sleep(10 * time.Millisecond)
	db.createSessionStudent(ctx, t, sessionID, s2, "Student 2")

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("returns students desc by joined_at", func(t *testing.T) {
		store, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := store.ListSessionStudents(ctx, sessionID)
		if err != nil {
			t.Fatalf("ListSessionStudents: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("expected 2 students, got %d", len(results))
		}
		// s2 was created later, should be first (DESC)
		if results[0].UserID != s2 {
			t.Errorf("expected first student %s, got %s", s2, results[0].UserID)
		}
	})

	t.Run("empty session", func(t *testing.T) {
		store, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := store.ListSessionStudents(ctx, uuid.New())
		if err != nil {
			t.Fatalf("ListSessionStudents: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 students, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: GetSessionStudent - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetSessionStudent(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	studentID := uuid.New()
	db.createUser(ctx, t, studentID, "student@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	// Enroll creator as instructor in section (needed for RLS to allow viewing student_work)
	if err := db.execAsSuperuser(ctx, `INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`, creatorID, sectionID); err != nil {
		t.Fatalf("enroll creator: %v", err)
	}
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	db.createSessionStudent(ctx, t, sessionID, studentID, "Alice")

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		ss, err := s.GetSessionStudent(ctx, sessionID, studentID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ss.Name != "Alice" {
			t.Errorf("expected name Alice, got %s", ss.Name)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetSessionStudent(ctx, sessionID, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: CreateRevision - calls actual Store method with RLS
// =============================================================================

func TestIntegration_CreateRevision(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	creatorID := uuid.New()
	db.createUser(ctx, t, creatorID, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", creatorID)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", creatorID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Test Problem", creatorID, &classID, nil)
	studentWorkID := uuid.New()
	db.createStudentWork(ctx, t, studentWorkID, nsID, creatorID, problemID, sectionID)

	authUser := &auth.User{
		ID:          creatorID,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("create full code revision", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		fullCode := "print('hello')"
		execResult := json.RawMessage(`{"status":"ok"}`)
		rev, err := s.CreateRevision(ctx, CreateRevisionParams{
			NamespaceID:     nsID,
			SessionID:       &sessionID,
			UserID:          creatorID,
			IsDiff:          false,
			FullCode:        &fullCode,
			ExecutionResult: execResult,
			StudentWorkID:   &studentWorkID,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if rev.SessionID == nil || *rev.SessionID != sessionID {
			t.Errorf("expected session_id %s, got %v", sessionID, rev.SessionID)
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
// Test: ListRevisions - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListRevisions(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	user1 := uuid.New()
	user2 := uuid.New()
	db.createUser(ctx, t, user1, "u1@test.com", "instructor", nsID)
	db.createUser(ctx, t, user2, "u2@test.com", "student", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", user1)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN1")
	// Instructor needs section membership to see revisions
	db.createMembership(ctx, t, user1, sectionID, "instructor")
	db.createMembership(ctx, t, user2, sectionID, "student")
	sessionID := uuid.New()
	db.createSession(ctx, t, sessionID, nsID, sectionID, "Section A", user1)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Test Problem", user1, &classID, nil)
	sw1 := uuid.New()
	db.createStudentWork(ctx, t, sw1, nsID, user1, problemID, sectionID)
	sw2 := uuid.New()
	db.createStudentWork(ctx, t, sw2, nsID, user2, problemID, sectionID)

	authUser1 := &auth.User{
		ID:          user1,
		Email:       "u1@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	authUser2 := &auth.User{
		ID:          user2,
		Email:       "u2@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	// Insert revisions using Store methods - each user creates their own revision
	code1 := "code1"
	code2 := "code2"
	s, conn := db.storeWithRLS(ctx, t, authUser1)
	_, err := s.CreateRevision(ctx, CreateRevisionParams{
		NamespaceID:     nsID,
		SessionID:       &sessionID,
		UserID:          user1,
		IsDiff:          false,
		FullCode:        &code1,
		ExecutionResult: json.RawMessage(`{}`),
		StudentWorkID:   &sw1,
	})
	if err != nil {
		t.Fatalf("create rev1: %v", err)
	}
	conn.Release()

	time.Sleep(10 * time.Millisecond)

	// User2 creates their own revision
	s2, conn2 := db.storeWithRLS(ctx, t, authUser2)
	_, err = s2.CreateRevision(ctx, CreateRevisionParams{
		NamespaceID:     nsID,
		SessionID:       &sessionID,
		UserID:          user2,
		IsDiff:          false,
		FullCode:        &code2,
		ExecutionResult: json.RawMessage(`{}`),
		StudentWorkID:   &sw2,
	})
	if err != nil {
		t.Fatalf("create rev2: %v", err)
	}
	conn2.Release()

	// Use user1 (instructor) as auth for listing
	authUser := authUser1

	t.Run("all revisions for session", func(t *testing.T) {
		store, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := store.ListRevisions(ctx, sessionID, nil)
		if err != nil {
			t.Fatalf("ListRevisions: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("expected 2 revisions, got %d", len(results))
		}
	})

	t.Run("filter by user_id", func(t *testing.T) {
		store, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := store.ListRevisions(ctx, sessionID, &user1)
		if err != nil {
			t.Fatalf("ListRevisions: %v", err)
		}
		if len(results) != 1 {
			t.Fatalf("expected 1 revision, got %d", len(results))
		}
		if results[0].UserID != user1 {
			t.Errorf("expected user_id %s, got %s", user1, results[0].UserID)
		}
	})

	t.Run("empty session", func(t *testing.T) {
		store, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := store.ListRevisions(ctx, uuid.New(), nil)
		if err != nil {
			t.Fatalf("ListRevisions: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 revisions, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: CreateProblem - calls actual Store method with RLS
// =============================================================================

func TestIntegration_CreateProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		desc := "Find two numbers that sum to target"
		starter := "def two_sum(nums, target):"
		solution := "return [0, 1]"
		testCases := json.RawMessage(`[{"name":"t1","input":"1 2","expected_output":"3","match_type":"exact"}]`)

		p, err := s.CreateProblem(ctx, CreateProblemParams{
			NamespaceID: nsID,
			Title:       "Two Sum",
			Description: &desc,
			StarterCode: &starter,
			TestCases:   testCases,
			AuthorID:    authorID,
			ClassID:     &classID,
			Tags:        []string{"easy", "arrays"},
			Solution:    &solution,
		})
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
// Test: GetProblem - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Test Problem", authorID, nil, []string{"easy"})

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		p, err := s.GetProblem(ctx, problemID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Title != "Test Problem" {
			t.Errorf("expected title 'Test Problem', got %s", p.Title)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetProblem(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: UpdateProblem - calls actual Store method with RLS
// =============================================================================

func TestIntegration_UpdateProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "Original Title", authorID, nil, []string{"easy"})

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("partial update title only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newTitle := "Updated Title"
		p, err := s.UpdateProblem(ctx, problemID, UpdateProblemParams{Title: &newTitle})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Title != "Updated Title" {
			t.Errorf("expected title 'Updated Title', got %s", p.Title)
		}
	})

	t.Run("update tags", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newTitle := "Updated Title"
		p, err := s.UpdateProblem(ctx, problemID, UpdateProblemParams{Title: &newTitle, Tags: []string{"medium", "trees"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(p.Tags) != 2 || p.Tags[0] != "medium" {
			t.Errorf("expected tags [medium trees], got %v", p.Tags)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		title := "nope"
		_, err := s.UpdateProblem(ctx, uuid.New(), UpdateProblemParams{Title: &title})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: DeleteProblem - calls actual Store method with RLS
// =============================================================================

func TestIntegration_DeleteProblem(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	problemID := uuid.New()
	db.createProblem(ctx, t, problemID, nsID, "To Delete", authorID, nil, nil)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("delete existing", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		if err := s.DeleteProblem(ctx, problemID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM problems WHERE id = $1", problemID).Scan(&count)
		if err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 0 {
			t.Error("problem should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteProblem(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: ListProblems - calls actual Store method with RLS
// =============================================================================

func TestIntegration_ListProblems(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	authorID := uuid.New()
	db.createUser(ctx, t, authorID, "author@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", authorID)

	p1 := uuid.New()
	p2 := uuid.New()
	db.createProblem(ctx, t, p1, nsID, "Problem A", authorID, &classID, nil)
	time.Sleep(10 * time.Millisecond)
	db.createProblem(ctx, t, p2, nsID, "Problem B", authorID, nil, nil)

	authUser := &auth.User{
		ID:          authorID,
		Email:       "author@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("no filter", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblems(ctx, nil)
		if err != nil {
			t.Fatalf("ListProblems: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 problems, got %d", len(results))
		}
		if len(results) == 2 && results[0].ID != p1 {
			t.Errorf("expected first problem %s (oldest), got %s", p1, results[0].ID)
		}
	})

	t.Run("filter by class_id", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListProblems(ctx, &classID)
		if err != nil {
			t.Fatalf("ListProblems: %v", err)
		}
		if len(results) != 1 {
			t.Errorf("expected 1 problem in class, got %d", len(results))
		}
	})
}

// =============================================================================
// Test: GetUserByID - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetUserByID(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	userID := uuid.New()
	db.createUser(ctx, t, userID, "byid@test.com", "student", nsID)

	authUser := &auth.User{
		ID:          userID,
		Email:       "byid@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		u, err := s.GetUserByID(ctx, userID)
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
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetUserByID(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: GetUserByExternalID - calls actual Store method with RLS
// =============================================================================

func TestIntegration_GetUserByExternalID(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	userID := uuid.New()
	extID := "firebase-uid-" + uuid.New().String()[:8]
	// Insert user with external_id
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, external_id, email, role, namespace_id) VALUES ($1, $2, $3, $4, $5)`,
		userID, extID, "ext@test.com", "student", nsID)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	authUser := &auth.User{
		ID:          userID,
		Email:       "ext@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		u, err := s.GetUserByExternalID(ctx, extID)
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
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetUserByExternalID(ctx, "nonexistent-uid")
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Test: UpdateUser - calls actual Store method with RLS
// =============================================================================

func TestIntegration_UpdateUser(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	nsID := db.nsID

	userID := uuid.New()
	db.createUser(ctx, t, userID, "update@test.com", "student", nsID)

	authUser := &auth.User{
		ID:          userID,
		Email:       "update@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("update display name", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		name := "New Name"
		u, err := s.UpdateUser(ctx, userID, UpdateUserParams{DisplayName: &name})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.DisplayName == nil || *u.DisplayName != "New Name" {
			t.Errorf("expected display_name 'New Name', got %v", u.DisplayName)
		}
	})

	t.Run("nil display name keeps current", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		u, err := s.UpdateUser(ctx, userID, UpdateUserParams{DisplayName: nil})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if u.DisplayName == nil || *u.DisplayName != "New Name" {
			t.Errorf("expected display_name to remain 'New Name', got %v", u.DisplayName)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		name := "nope"
		_, err := s.UpdateUser(ctx, uuid.New(), UpdateUserParams{DisplayName: &name})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// Ensure imports are used.
var _ = json.RawMessage{}
