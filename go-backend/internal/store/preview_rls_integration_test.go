// Integration tests for RLS policies on the preview_students table.
//
// Migration 017 defines three RLS policies on preview_students:
//   - SELECT: instructor sees only their own row; system-admin sees all
//   - INSERT: instructors-or-higher (instructor, namespace-admin, system-admin)
//   - DELETE: instructor deletes their own row; system-admin deletes any row
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestRLS_PreviewStudents
package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
)

// insertPreviewStudentRow inserts a preview_students row directly as the
// superuser (bypassing RLS), so we have data to test SELECT/DELETE policies.
func (db *integrationDB) insertPreviewStudentRow(ctx context.Context, t *testing.T, instructorID, studentUserID uuid.UUID) {
	t.Helper()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO preview_students (instructor_id, student_user_id) VALUES ($1, $2)`,
		instructorID, studentUserID)
	if err != nil {
		t.Fatalf("insertPreviewStudentRow: %v", err)
	}
}

// countPreviewStudentRowsAs counts rows in preview_students visible to user via RLS.
func (db *integrationDB) countPreviewStudentRowsAs(ctx context.Context, t *testing.T, user *auth.User) int {
	t.Helper()

	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()

	if err := db.setRLSContext(ctx, conn, user); err != nil {
		t.Fatalf("setRLSContext: %v", err)
	}

	var count int
	err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM preview_students`).Scan(&count)
	if err != nil {
		t.Fatalf("count preview_students: %v", err)
	}
	return count
}

// =============================================================================
// SELECT policy tests
// =============================================================================

func TestRLS_PreviewStudents_InstructorCanSeeOwnRow(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Create two instructors so each has an independent row.
	instructorAID := uuid.New()
	studentAID := uuid.New()
	db.createUser(ctx, t, instructorAID, "instr-a-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentAID, "student-a-rls@preview.test", "student", db.nsID)
	db.insertPreviewStudentRow(ctx, t, instructorAID, studentAID)

	instructorUser := &auth.User{
		ID:          instructorAID,
		Email:       "instr-a-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	count := db.countPreviewStudentRowsAs(ctx, t, instructorUser)
	if count != 1 {
		t.Errorf("instructor should see exactly 1 row (their own), got %d", count)
	}
}

func TestRLS_PreviewStudents_InstructorCannotSeeOtherInstructorRow(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Instructor A's preview row.
	instructorAID := uuid.New()
	studentAID := uuid.New()
	db.createUser(ctx, t, instructorAID, "instr-a2-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentAID, "student-a2-rls@preview.test", "student", db.nsID)
	db.insertPreviewStudentRow(ctx, t, instructorAID, studentAID)

	// Instructor B — different instructor, same namespace, no preview row of their own.
	instructorBID := uuid.New()
	db.createUser(ctx, t, instructorBID, "instr-b2-rls@preview.test", "instructor", db.nsID)

	instructorBUser := &auth.User{
		ID:          instructorBID,
		Email:       "instr-b2-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	// Instructor B should see 0 rows — the SELECT policy filters by app_user_id().
	count := db.countPreviewStudentRowsAs(ctx, t, instructorBUser)
	if count != 0 {
		t.Errorf("instructor B should not see instructor A's preview_students row, got count=%d", count)
	}
}

// =============================================================================
// INSERT policy tests
// =============================================================================

func TestRLS_PreviewStudents_InstructorCanInsert(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-insert-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentID, "student-insert-rls@preview.test", "student", db.nsID)

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instr-insert-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()

	if err := db.setRLSContext(ctx, conn, instructorUser); err != nil {
		t.Fatalf("setRLSContext: %v", err)
	}

	_, insertErr := conn.Exec(ctx,
		`INSERT INTO preview_students (instructor_id, student_user_id) VALUES ($1, $2)`,
		instructorID, studentID)
	if insertErr != nil {
		t.Errorf("instructor should be able to INSERT a preview_students row, got error: %v", insertErr)
	}
}

func TestRLS_PreviewStudents_StudentCannotInsert(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// We need a user ID to insert as instructor_id; it must exist in users.
	// Use another instructor so FK doesn't fail independently of the RLS check.
	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-stu-insert-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentID, "student-stu-insert-rls@preview.test", "student", db.nsID)

	studentUser := &auth.User{
		ID:          studentID,
		Email:       "student-stu-insert-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleStudent,
	}

	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()

	if err := db.setRLSContext(ctx, conn, studentUser); err != nil {
		t.Fatalf("setRLSContext: %v", err)
	}

	// A student trying to insert should get a 42501 insufficient_privilege error.
	_, insertErr := conn.Exec(ctx,
		`INSERT INTO preview_students (instructor_id, student_user_id) VALUES ($1, $2)`,
		instructorID, studentID)
	if insertErr == nil {
		t.Error("student should NOT be able to INSERT a preview_students row")
	} else if !isForbiddenPgError(insertErr) {
		t.Errorf("expected 42501 insufficient_privilege, got: %v", insertErr)
	}
}

// =============================================================================
// DELETE policy tests
// =============================================================================

func TestRLS_PreviewStudents_InstructorCanDeleteOwnRow(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	instructorID := uuid.New()
	studentID := uuid.New()
	db.createUser(ctx, t, instructorID, "instr-del-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentID, "student-del-rls@preview.test", "student", db.nsID)
	db.insertPreviewStudentRow(ctx, t, instructorID, studentID)

	instructorUser := &auth.User{
		ID:          instructorID,
		Email:       "instr-del-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()

	if err := db.setRLSContext(ctx, conn, instructorUser); err != nil {
		t.Fatalf("setRLSContext: %v", err)
	}

	tag, err := conn.Exec(ctx,
		`DELETE FROM preview_students WHERE instructor_id = $1`, instructorID)
	if err != nil {
		t.Fatalf("DELETE should not error for instructor deleting own row: %v", err)
	}
	if tag.RowsAffected() != 1 {
		t.Errorf("expected 1 row deleted, got %d", tag.RowsAffected())
	}
}

func TestRLS_PreviewStudents_InstructorCannotDeleteOtherInstructorRow(t *testing.T) {
	t.Parallel()
	db := setupIntegrationDB(t)

	ctx := context.Background()

	// Instructor A has a preview row.
	instructorAID := uuid.New()
	studentAID := uuid.New()
	db.createUser(ctx, t, instructorAID, "instr-a-del-rls@preview.test", "instructor", db.nsID)
	db.createUser(ctx, t, studentAID, "student-a-del-rls@preview.test", "student", db.nsID)
	db.insertPreviewStudentRow(ctx, t, instructorAID, studentAID)

	// Instructor B tries to delete instructor A's row.
	instructorBID := uuid.New()
	db.createUser(ctx, t, instructorBID, "instr-b-del-rls@preview.test", "instructor", db.nsID)

	instructorBUser := &auth.User{
		ID:          instructorBID,
		Email:       "instr-b-del-rls@preview.test",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	conn, err := db.appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer conn.Release()

	if err := db.setRLSContext(ctx, conn, instructorBUser); err != nil {
		t.Fatalf("setRLSContext: %v", err)
	}

	// DELETE is silently blocked by RLS (USING clause hides the row — 0 rows affected, no error).
	tag, err := conn.Exec(ctx,
		`DELETE FROM preview_students WHERE instructor_id = $1`, instructorAID)
	if err != nil {
		t.Fatalf("unexpected error on blocked delete: %v", err)
	}
	if tag.RowsAffected() != 0 {
		t.Errorf("instructor B should not be able to delete instructor A's row, got %d rows affected", tag.RowsAffected())
	}

	// Verify the row still exists (superuser check).
	var count int
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM preview_students WHERE instructor_id = $1`, instructorAID).Scan(&count); err != nil {
		t.Fatalf("count preview_students: %v", err)
	}
	if count != 1 {
		t.Errorf("instructor A's row should still exist after blocked delete, got count=%d", count)
	}
}
