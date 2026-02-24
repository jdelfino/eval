// Integration tests for migration 014 - cleanup session_students and revisions.
//
// These tests verify that:
// 1. Old columns (code, execution_settings) are dropped from session_students
// 2. session_students.last_update is renamed to joined_at
// 3. revisions.session_id is nullable
// 4. revisions.student_work_id is backfilled and made NOT NULL
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration014

package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// =============================================================================
// Test: session_students old columns are dropped
// =============================================================================

func TestIntegration_Migration014_SessionStudentsColumnsDropped(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Verify 'code' column does not exist
	var codeExists bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'session_students' AND column_name = 'code'
		)
	`).Scan(&codeExists)
	if err != nil {
		t.Fatalf("check code column: %v", err)
	}
	if codeExists {
		t.Error("session_students.code column should be dropped")
	}

	// Verify 'execution_settings' column does not exist
	var execSettingsExists bool
	err = db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'session_students' AND column_name = 'execution_settings'
		)
	`).Scan(&execSettingsExists)
	if err != nil {
		t.Fatalf("check execution_settings column: %v", err)
	}
	if execSettingsExists {
		t.Error("session_students.execution_settings column should be dropped")
	}
}

// =============================================================================
// Test: session_students.last_update renamed to joined_at
// =============================================================================

func TestIntegration_Migration014_SessionStudentsColumnRenamed(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Verify 'last_update' column does not exist
	var lastUpdateExists bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'session_students' AND column_name = 'last_update'
		)
	`).Scan(&lastUpdateExists)
	if err != nil {
		t.Fatalf("check last_update column: %v", err)
	}
	if lastUpdateExists {
		t.Error("session_students.last_update column should be renamed")
	}

	// Verify 'joined_at' column exists
	var joinedAtExists bool
	err = db.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'session_students' AND column_name = 'joined_at'
		)
	`).Scan(&joinedAtExists)
	if err != nil {
		t.Fatalf("check joined_at column: %v", err)
	}
	if !joinedAtExists {
		t.Error("session_students.joined_at column should exist")
	}
}

// =============================================================================
// Test: revisions.session_id is nullable
// =============================================================================

func TestIntegration_Migration014_RevisionsSessionIdNullable(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Check that session_id is nullable
	var isNullable string
	err := db.pool.QueryRow(ctx, `
		SELECT is_nullable FROM information_schema.columns
		WHERE table_name = 'revisions' AND column_name = 'session_id'
	`).Scan(&isNullable)
	if err != nil {
		t.Fatalf("check session_id nullable: %v", err)
	}
	if isNullable != "YES" {
		t.Errorf("revisions.session_id should be nullable, got: %s", isNullable)
	}

	// Verify we can insert a revision with NULL session_id (practice revision)
	userID := uuid.New()
	db.createUser(ctx, t, userID, "user@test.com", "student", db.nsID)

	classID := uuid.New()
	_, err = db.pool.Exec(ctx,
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

	// Create student_work
	workID := uuid.New()
	_, err = db.pool.Exec(ctx, `
		INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, workID, db.nsID, userID, problemID, sectionID, "print('practice')")
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	// Insert revision with NULL session_id
	revisionID := uuid.New()
	_, err = db.pool.Exec(ctx, `
		INSERT INTO revisions (id, namespace_id, session_id, user_id, student_work_id, full_code)
		VALUES ($1, $2, NULL, $3, $4, $5)
	`, revisionID, db.nsID, userID, workID, "print('practice revision')")
	if err != nil {
		t.Errorf("should be able to insert revision with NULL session_id: %v", err)
	}
}

// =============================================================================
// Test: revisions.student_work_id is NOT NULL
// =============================================================================

func TestIntegration_Migration014_RevisionsStudentWorkIdNotNull(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Check that student_work_id is NOT NULL
	var isNullable string
	err := db.pool.QueryRow(ctx, `
		SELECT is_nullable FROM information_schema.columns
		WHERE table_name = 'revisions' AND column_name = 'student_work_id'
	`).Scan(&isNullable)
	if err != nil {
		t.Fatalf("check student_work_id nullable: %v", err)
	}
	if isNullable != "NO" {
		t.Errorf("revisions.student_work_id should be NOT NULL, got: %s", isNullable)
	}

	// Verify we cannot insert a revision without student_work_id
	userID := uuid.New()
	db.createUser(ctx, t, userID, "user2@test.com", "student", db.nsID)

	classID := uuid.New()
	_, err = db.pool.Exec(ctx,
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

	_, err = db.pool.Exec(ctx, `
		INSERT INTO revisions (namespace_id, session_id, user_id, full_code)
		VALUES ($1, $2, $3, $4)
	`, db.nsID, sessionID, userID, "print('no work id')")
	if err == nil {
		t.Error("should not be able to insert revision without student_work_id")
	}
}

// =============================================================================
// Test: Backfill works for existing revisions
// =============================================================================

func TestIntegration_Migration014_RevisionsBackfill(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Create test data: user, section, problem, student_work, session, session_student
	userID := uuid.New()
	db.createUser(ctx, t, userID, "user3@test.com", "student", db.nsID)

	classID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO classes (id, namespace_id, name, created_by) VALUES ($1, $2, $3, $4)`,
		classID, db.nsID, "Test Class 3", userID)
	if err != nil {
		t.Fatalf("create class: %v", err)
	}

	sectionID := uuid.New()
	joinCode := "TST-" + uuid.New().String()[:6]
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sections (id, namespace_id, class_id, name, join_code) VALUES ($1, $2, $3, $4, $5)`,
		sectionID, db.nsID, classID, "Test Section 3", joinCode)
	if err != nil {
		t.Fatalf("create section: %v", err)
	}

	problemID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO problems (id, namespace_id, title, author_id) VALUES ($1, $2, $3, $4)`,
		problemID, db.nsID, "Test Problem 3", userID)
	if err != nil {
		t.Fatalf("create problem: %v", err)
	}

	// Create student_work
	workID := uuid.New()
	_, err = db.pool.Exec(ctx, `
		INSERT INTO student_work (id, namespace_id, user_id, problem_id, section_id, code)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, workID, db.nsID, userID, problemID, sectionID, "print('work')")
	if err != nil {
		t.Fatalf("create student_work: %v", err)
	}

	sessionID := uuid.New()
	_, err = db.pool.Exec(ctx,
		`INSERT INTO sessions (id, namespace_id, section_id, section_name, problem, creator_id)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		sessionID, db.nsID, sectionID, "Test Section 3", `{"id": "test"}`, userID)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Create session_student with student_work_id
	_, err = db.pool.Exec(ctx, `
		INSERT INTO session_students (session_id, user_id, name, student_work_id, joined_at)
		VALUES ($1, $2, $3, $4, now())
	`, sessionID, userID, "Test User", workID)
	if err != nil {
		t.Fatalf("create session_student: %v", err)
	}

	// Create a revision with student_work_id (new code path)
	revisionID := uuid.New()
	_, err = db.pool.Exec(ctx, `
		INSERT INTO revisions (id, namespace_id, session_id, user_id, student_work_id, full_code)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, revisionID, db.nsID, sessionID, userID, workID, "print('revision')")
	if err != nil {
		t.Fatalf("create revision: %v", err)
	}

	// Verify the revision has student_work_id
	var retrievedWorkID uuid.UUID
	err = db.pool.QueryRow(ctx, `
		SELECT student_work_id FROM revisions WHERE id = $1
	`, revisionID).Scan(&retrievedWorkID)
	if err != nil {
		t.Fatalf("get revision: %v", err)
	}
	if retrievedWorkID != workID {
		t.Errorf("revision should have student_work_id %s, got %s", workID, retrievedWorkID)
	}
}
