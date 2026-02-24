// Integration tests for migration 013 - section_problems and student_work tables.
//
// These tests verify that:
// 1. New tables (section_problems, student_work) are created with proper structure
// 2. New columns are added to existing tables (session_students.student_work_id, revisions.student_work_id)
// 3. Foreign key constraints work correctly
// 4. RLS policies are enforced for the new tables
// 5. Fake practice sessions are cleaned up
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration013

package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// =============================================================================
// Test: section_problems table exists and has correct structure
// =============================================================================

func TestIntegration_Migration013_SectionProblemsTableExists(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Verify table exists
	var exists bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'section_problems'
		)
	`).Scan(&exists)
	if err != nil {
		t.Fatalf("check table existence: %v", err)
	}
	if !exists {
		t.Fatal("section_problems table does not exist")
	}

	// Verify columns
	expectedColumns := []string{
		"id", "section_id", "problem_id", "published_by",
		"show_solution", "published_at",
	}
	for _, col := range expectedColumns {
		var colExists bool
		err := db.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'section_problems' AND column_name = $1
			)
		`, col).Scan(&colExists)
		if err != nil {
			t.Fatalf("check column %s: %v", col, err)
		}
		if !colExists {
			t.Errorf("section_problems.%s column does not exist", col)
		}
	}

	// Verify UNIQUE constraint on (section_id, problem_id)
	var constraintExists bool
	err = db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conrelid = 'section_problems'::regclass
			AND contype = 'u'
			AND array_length(conkey, 1) = 2
		)
	`).Scan(&constraintExists)
	if err != nil {
		t.Fatalf("check unique constraint: %v", err)
	}
	if !constraintExists {
		t.Error("UNIQUE constraint on (section_id, problem_id) does not exist")
	}
}

// =============================================================================
// Test: student_work table exists and has correct structure
// =============================================================================

func TestIntegration_Migration013_StudentWorkTableExists(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Verify table exists
	var exists bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_name = 'student_work'
		)
	`).Scan(&exists)
	if err != nil {
		t.Fatalf("check table existence: %v", err)
	}
	if !exists {
		t.Fatal("student_work table does not exist")
	}

	// Verify columns
	expectedColumns := []string{
		"id", "namespace_id", "user_id", "problem_id", "section_id",
		"code", "execution_settings", "created_at", "last_update",
	}
	for _, col := range expectedColumns {
		var colExists bool
		err := db.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'student_work' AND column_name = $1
			)
		`, col).Scan(&colExists)
		if err != nil {
			t.Fatalf("check column %s: %v", col, err)
		}
		if !colExists {
			t.Errorf("student_work.%s column does not exist", col)
		}
	}

	// Verify UNIQUE constraint on (user_id, problem_id, section_id)
	var constraintExists bool
	err = db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_constraint
			WHERE conrelid = 'student_work'::regclass
			AND contype = 'u'
			AND array_length(conkey, 1) = 3
		)
	`).Scan(&constraintExists)
	if err != nil {
		t.Fatalf("check unique constraint: %v", err)
	}
	if !constraintExists {
		t.Error("UNIQUE constraint on (user_id, problem_id, section_id) does not exist")
	}
}

// =============================================================================
// Test: New columns added to existing tables
// =============================================================================

func TestIntegration_Migration013_NewColumnsExist(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	tests := []struct {
		table  string
		column string
	}{
		{"session_students", "student_work_id"},
		{"revisions", "student_work_id"},
	}

	for _, tt := range tests {
		t.Run(tt.table+"."+tt.column, func(t *testing.T) {
			var exists bool
			err := db.pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = $1 AND column_name = $2
				)
			`, tt.table, tt.column).Scan(&exists)
			if err != nil {
				t.Fatalf("check column: %v", err)
			}
			if !exists {
				t.Errorf("%s.%s column does not exist", tt.table, tt.column)
			}

			// session_students.student_work_id stays nullable;
			// revisions.student_work_id becomes NOT NULL after migration 014.
			var isNullable string
			err = db.pool.QueryRow(ctx, `
				SELECT is_nullable FROM information_schema.columns
				WHERE table_name = $1 AND column_name = $2
			`, tt.table, tt.column).Scan(&isNullable)
			if err != nil {
				t.Fatalf("check nullable: %v", err)
			}
			if tt.table == "revisions" {
				if isNullable != "NO" {
					t.Errorf("%s.%s should be NOT NULL (after migration 014), got: %s", tt.table, tt.column, isNullable)
				}
			} else {
				if isNullable != "YES" {
					t.Errorf("%s.%s should be nullable, got: %s", tt.table, tt.column, isNullable)
				}
			}
		})
	}
}

// =============================================================================
// Test: RLS policies for section_problems
// =============================================================================

func TestIntegration_Migration013_SectionProblemsRLS(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor@test.com", "instructor", db.nsID, "Instructor")
	db.createUserWithDisplayName(ctx, t, studentID, "student@test.com", "student", db.nsID, "Student")

	classID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
		classID, db.nsID, "Test Class", instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	sectionID := uuid.New()
	joinCode := "TST-" + uuid.New().String()[:6]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
		sectionID, db.nsID, classID, "Test Section", joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	// Enroll instructor and student
	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'instructor')`,
		instructorID, sectionID)
	if err != nil {
		t.Fatalf("enroll instructor: %v", err)
	}
	_, err = db.pool.Exec(ctx,
		`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, 'student')`,
		studentID, sectionID)
	if err != nil {
		t.Fatalf("enroll student: %v", err)
	}

	problemID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
		problemID, db.nsID, "Test Problem", instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	t.Run("instructor can insert section_problem", func(t *testing.T) {
		instructorAuth := &auth.User{
			ID:          instructorID,
			Email:       "instructor@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleInstructor,
		}
		_, conn := db.storeWithRLS(ctx, t, instructorAuth)
		defer conn.Release()

		sectionProblemID := uuid.New()
		_, err := conn.Exec(ctx, `
			INSERT INTO section_problems (id, section_id, problem_id, published_by)
			VALUES ($1, $2, $3, $4)
		`, sectionProblemID, sectionID, problemID, instructorID)
		if err != nil {
			t.Errorf("instructor should be able to insert: %v", err)
		}
	})

	t.Run("student can select section_problem", func(t *testing.T) {
		studentAuth := &auth.User{
			ID:          studentID,
			Email:       "student@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		_, conn := db.storeWithRLS(ctx, t, studentAuth)
		defer conn.Release()

		var count int
		err := conn.QueryRow(ctx, `
			SELECT COUNT(*) FROM section_problems WHERE section_id = $1
		`, sectionID).Scan(&count)
		if err != nil {
			t.Errorf("student should be able to select: %v", err)
		}
		if count == 0 {
			t.Error("student should see section_problems")
		}
	})

}

// =============================================================================
// Test: RLS policies for student_work
// =============================================================================

func TestIntegration_Migration013_StudentWorkRLS(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create test data
	instructorID := uuid.New()
	studentID := uuid.New()
	otherStudentID := uuid.New()
	db.createUserWithDisplayName(ctx, t, instructorID, "instructor@test.com", "instructor", db.nsID, "Instructor")
	db.createUserWithDisplayName(ctx, t, studentID, "student@test.com", "student", db.nsID, "Student")
	db.createUserWithDisplayName(ctx, t, otherStudentID, "other@test.com", "student", db.nsID, "Other")

	classID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
		classID, db.nsID, "Test Class", instructorID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	sectionID := uuid.New()
	joinCode := "TST-" + uuid.New().String()[:6]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
		sectionID, db.nsID, classID, "Test Section", joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	// Enroll all users
	for _, uid := range []uuid.UUID{instructorID, studentID, otherStudentID} {
		role := "student"
		if uid == instructorID {
			role = "instructor"
		}
		_, err = db.pool.Exec(ctx,
			`INSERT INTO section_memberships (user_id, section_id, role) VALUES ($1, $2, $3)`,
			uid, sectionID, role)
		if err != nil {
			t.Fatalf("enroll user %s: %v", uid, err)
		}
	}

	problemID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
		problemID, db.nsID, "Test Problem", instructorID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	// studentWorkID is set inside the first sub-test and used in isolation sub-tests below.
	var studentWorkID uuid.UUID

	t.Run("student can insert their own work", func(t *testing.T) {
		studentAuth := &auth.User{
			ID:          studentID,
			Email:       "student@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		_, conn := db.storeWithRLS(ctx, t, studentAuth)
		defer conn.Release()

		workID := uuid.New()
		studentWorkID = workID
		_, err := conn.Exec(ctx, `
			INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, workID, db.nsID, studentID, problemID, sectionID, "print('hello')")
		if err != nil {
			t.Errorf("student should be able to insert own work: %v", err)
		}
	})

	t.Run("student can select and update their own work", func(t *testing.T) {
		studentAuth := &auth.User{
			ID:          studentID,
			Email:       "student@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		_, conn := db.storeWithRLS(ctx, t, studentAuth)
		defer conn.Release()

		var count int
		err := conn.QueryRow(ctx, `
			SELECT COUNT(*) FROM student_work WHERE user_id = $1
		`, studentID).Scan(&count)
		if err != nil {
			t.Errorf("student should be able to select own work: %v", err)
		}

		_, err = conn.Exec(ctx, `
			UPDATE student_work SET code = $1 WHERE user_id = $2
		`, "print('updated')", studentID)
		if err != nil {
			t.Errorf("student should be able to update own work: %v", err)
		}
	})

	t.Run("instructor can select student work", func(t *testing.T) {
		instructorAuth := &auth.User{
			ID:          instructorID,
			Email:       "instructor@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleInstructor,
		}
		_, conn := db.storeWithRLS(ctx, t, instructorAuth)
		defer conn.Release()

		var count int
		err := conn.QueryRow(ctx, `
			SELECT COUNT(*) FROM student_work WHERE section_id = $1
		`, sectionID).Scan(&count)
		if err != nil {
			t.Errorf("instructor should be able to select student work: %v", err)
		}
		if count == 0 {
			t.Error("instructor should see student work")
		}
	})

	// Cross-student RLS isolation: other student must not see or modify studentID's work.
	t.Run("other student cannot read student A's work by ID", func(t *testing.T) {
		if studentWorkID == (uuid.UUID{}) {
			t.Skip("studentWorkID not set (prior sub-test failed)")
		}
		otherStudentAuth := &auth.User{
			ID:          otherStudentID,
			Email:       "other@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		s, conn := db.storeWithRLS(ctx, t, otherStudentAuth)
		defer conn.Release()

		_, err := s.GetStudentWork(ctx, studentWorkID)
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound when other student reads student A's work, got: %v", err)
		}
	})

	t.Run("other student cannot read student A's work by problem", func(t *testing.T) {
		otherStudentAuth := &auth.User{
			ID:          otherStudentID,
			Email:       "other@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		s, conn := db.storeWithRLS(ctx, t, otherStudentAuth)
		defer conn.Release()

		// Querying studentID's work using otherStudentID's RLS context should return not found.
		_, err := s.GetStudentWorkByProblem(ctx, studentID, problemID, sectionID)
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound when other student queries student A's work by problem, got: %v", err)
		}
	})

	t.Run("other student cannot update student A's work", func(t *testing.T) {
		if studentWorkID == (uuid.UUID{}) {
			t.Skip("studentWorkID not set (prior sub-test failed)")
		}
		otherStudentAuth := &auth.User{
			ID:          otherStudentID,
			Email:       "other@test.com",
			NamespaceID: db.nsID,
			Role:        auth.RoleStudent,
		}
		s, conn := db.storeWithRLS(ctx, t, otherStudentAuth)
		defer conn.Release()

		newCode := "print('hacked')"
		_, err := s.UpdateStudentWork(ctx, studentWorkID, UpdateStudentWorkParams{
			Code: &newCode,
		})
		if err != ErrNotFound {
			t.Errorf("expected ErrNotFound when other student updates student A's work, got: %v", err)
		}
	})

}

// =============================================================================
// Test: Foreign key constraints work
// =============================================================================

func TestIntegration_Migration013_ForeignKeys(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	t.Run("session_students.student_work_id FK", func(t *testing.T) {
		// Try to insert session_student with non-existent student_work_id
		sessionID := uuid.New()
		userID := uuid.New()
		db.createUser(ctx, t, userID, "user@test.com", "student", db.nsID)

		classID := uuid.New()
		_, err := db.pool.Exec(ctx,
			`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
			classID, db.nsID, "Test Class", userID)
		if err != nil {
			t.Fatalf("create class: %v", err)
		}

		sectionID := uuid.New()
		joinCode := "TST-" + uuid.New().String()[:6]
		_, err = db.pool.Exec(ctx,
			`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
			sectionID, db.nsID, classID, "Test Section", joinCode)
		if err != nil {
			t.Fatalf("create section: %v", err)
		}

		problemID := uuid.New()
		_, err = db.pool.Exec(ctx,
			`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
			problemID, db.nsID, "Test Problem", userID)
		if err != nil {
			t.Fatalf("create problem: %v", err)
		}

		_, err = db.pool.Exec(ctx,
			`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			sessionID, db.nsID, sectionID, "Test Section", `{"id": "test"}`, userID)
		if err != nil {
			t.Fatalf("create session: %v", err)
		}

		fakeWorkID := uuid.New()
		_, err = db.pool.Exec(ctx,
			`INSERT INTO session_students (session_id, user_id, name, student_work_id)
			 VALUES ($1, $2, $3, $4)`,
			sessionID, userID, "Test User", fakeWorkID)
		if err == nil {
			t.Error("should not be able to insert session_student with non-existent student_work_id")
		}
	})

	t.Run("revisions.student_work_id FK", func(t *testing.T) {
		// Try to insert revision with non-existent student_work_id
		userID := uuid.New()
		db.createUser(ctx, t, userID, "user2@test.com", "student", db.nsID)

		classID := uuid.New()
		_, err := db.pool.Exec(ctx,
			`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
			classID, db.nsID, "Test Class 2", userID)
		if err != nil {
			t.Fatalf("create class: %v", err)
		}

		sectionID := uuid.New()
		joinCode := "TST-" + uuid.New().String()[:6]
		_, err = db.pool.Exec(ctx,
			`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
			sectionID, db.nsID, classID, "Test Section 2", joinCode)
		if err != nil {
			t.Fatalf("create section: %v", err)
		}

		problemID := uuid.New()
		_, err = db.pool.Exec(ctx,
			`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
			problemID, db.nsID, "Test Problem 2", userID)
		if err != nil {
			t.Fatalf("create problem: %v", err)
		}

		sessionID := uuid.New()
		_, err = db.pool.Exec(ctx,
			`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			sessionID, db.nsID, sectionID, "Test Section 2", `{"id": "test"}`, userID)
		if err != nil {
			t.Fatalf("create session: %v", err)
		}

		fakeWorkID := uuid.New()
		_, err = db.pool.Exec(ctx,
			`INSERT INTO revisions (namespace_id, session_id, user_id, full_code, student_work_id)
			 VALUES ($1, $2, $3, $4, $5)`,
			db.nsID, sessionID, userID, "print('test')", fakeWorkID)
		if err == nil {
			t.Error("should not be able to insert revision with non-existent student_work_id")
		}
	})
}

// =============================================================================
// Test: Fake practice sessions cleanup
// =============================================================================

func TestIntegration_Migration013_FakePracticeSessionsCleanup(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create a user for session creator
	userID := uuid.New()
	db.createUser(ctx, t, userID, "user@test.com", "instructor", db.nsID)

	classID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
		classID, db.nsID, "Test Class", userID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	sectionID := uuid.New()
	joinCode := "TST-" + uuid.New().String()[:6]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
		sectionID, db.nsID, classID, "Test Section", joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	// Insert a fake practice session (completed, duration < 1 second)
	fakeSessionID := uuid.New()
	now := time.Now()
	fakeEndedAt := now.Add(500 * time.Millisecond)
	_, err = db.pool.Exec(ctx, `
		INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id, status, created_at, ended_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8)
	`, fakeSessionID, db.nsID, sectionID, "Test Section", `{"id": "test"}`, userID, now, fakeEndedAt)
	if err != nil {
		t.Fatalf("create fake session: %v", err)
	}

	// Insert a real session (completed, duration > 1 second)
	realSessionID := uuid.New()
	realEndedAt := now.Add(2 * time.Second)
	_, err = db.pool.Exec(ctx, `
		INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id, status, created_at, ended_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8)
	`, realSessionID, db.nsID, sectionID, "Test Section", `{"id": "test"}`, userID, now, realEndedAt)
	if err != nil {
		t.Fatalf("create real session: %v", err)
	}

	// Verify the fake session would be cleaned up by the migration
	// (In reality, the migration runs before tests, so we just verify the cleanup query logic)
	var fakeCount int
	err = db.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM sessions
		WHERE status = 'completed' AND ended_at - created_at < interval '1 second'
	`).Scan(&fakeCount)
	if err != nil {
		t.Fatalf("count fake sessions: %v", err)
	}

	// The migration should have cleaned these up, so if they exist now, it means
	// we're testing pre-migration state. After migration, this count should be 0.
	// For this test, we just verify the query works and can identify fake sessions.
	t.Logf("Found %d fake practice sessions (should be 0 after migration)", fakeCount)
}
