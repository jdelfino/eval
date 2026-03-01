package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PreviewStudent represents a row in the preview_students table,
// linking an instructor to their shadow preview student user.
type PreviewStudent struct {
	InstructorID  uuid.UUID `json:"instructor_id"`
	StudentUserID uuid.UUID `json:"student_user_id"`
	CreatedAt     time.Time `json:"created_at"`
}

// PreviewRepository defines the interface for preview student data access.
// It is pool-scoped (no RLS), injected directly into middleware and handlers.
// Do NOT add this to the Repos interface — it is used independently.
type PreviewRepository interface {
	// GetPreviewStudent retrieves the preview student for the given instructor.
	// Returns ErrNotFound if no preview student exists for this instructor.
	GetPreviewStudent(ctx context.Context, instructorID uuid.UUID) (*PreviewStudent, error)

	// CreatePreviewStudent creates a new shadow student user and registers it as
	// the preview student for the given instructor, all within a transaction.
	// The new user has a NULL external_id (cannot log in directly) and a
	// system-generated email within the given namespace.
	CreatePreviewStudent(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*PreviewStudent, error)

	// EnrollPreviewStudent idempotently enrolls the preview student in a section.
	// Uses INSERT ON CONFLICT DO NOTHING so it is safe to call multiple times.
	EnrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error

	// UnenrollPreviewStudentFromOtherSections removes the preview student from all
	// sections except keepSectionID. Best-effort cleanup — does not return an error
	// if the student is not enrolled in any other sections.
	UnenrollPreviewStudentFromOtherSections(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error

	// UnenrollPreviewStudent removes the preview student from a specific section.
	// No-op if the student is not enrolled in that section.
	UnenrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error

	// DeletePreviewStudent deletes the preview student user for the given instructor.
	// Cascade constraints on the users table automatically clean up all related rows
	// (preview_students, section_memberships, session_students, student_work, revisions).
	// No-op if the instructor has no preview student.
	DeletePreviewStudent(ctx context.Context, instructorID uuid.UUID) error
}

// GetPreviewStudent retrieves the preview student for the given instructor.
// Returns ErrNotFound if no preview student exists for this instructor.
func (s *Store) GetPreviewStudent(ctx context.Context, instructorID uuid.UUID) (*PreviewStudent, error) {
	const query = `
		SELECT ps.instructor_id, ps.student_user_id, ps.created_at
		FROM preview_students ps
		WHERE ps.instructor_id = $1`

	var ps PreviewStudent
	err := s.q.QueryRow(ctx, query, instructorID).Scan(
		&ps.InstructorID,
		&ps.StudentUserID,
		&ps.CreatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return &ps, nil
}

// CreatePreviewStudent creates a new shadow student user and registers it as
// the preview student for the given instructor, within a transaction.
//
// The preview student user has external_id = NULL (cannot log in directly).
// The user's email is a deterministic system address scoped to the instructor.
//
// CreatePreviewStudent is idempotent: if a preview student already exists for
// this instructor (e.g. due to a concurrent request), it rolls back the
// transaction and returns the existing record.
func (s *Store) CreatePreviewStudent(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*PreviewStudent, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Generate a deterministic email for the preview student so it is
	// recognisable in the database without being guessable.
	email := fmt.Sprintf("preview+%s@system.internal", instructorID.String())

	// INSERT the new user with external_id = NULL.
	// We cannot use CreateUser because CreateUserParams.ExternalID is a non-optional
	// string, and preview users must have NULL external_id.
	var studentUserID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, role, namespace_id)
		VALUES ($1, 'student', $2)
		RETURNING id`,
		email, namespaceID,
	).Scan(&studentUserID)
	if err != nil {
		return nil, fmt.Errorf("insert preview user: %w", err)
	}

	// Register the preview student mapping.
	// Use ON CONFLICT (instructor_id) DO NOTHING so that concurrent calls are
	// safe: if another request already inserted the row, we get 0 rows affected
	// rather than a unique-violation error.
	tag, err := tx.Exec(ctx, `
		INSERT INTO preview_students (instructor_id, student_user_id)
		VALUES ($1, $2)
		ON CONFLICT (instructor_id) DO NOTHING`,
		instructorID, studentUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert preview_students: %w", err)
	}

	if tag.RowsAffected() == 0 {
		// Another concurrent request already created the preview student.
		// Roll back our orphan user and return the existing record.
		tx.Rollback(ctx) //nolint:errcheck
		return s.GetPreviewStudent(ctx, instructorID)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.GetPreviewStudent(ctx, instructorID)
}

// EnrollPreviewStudent idempotently enrolls the preview student in a section.
func (s *Store) EnrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	_, err := s.q.Exec(ctx, `
		INSERT INTO section_memberships (user_id, section_id, role)
		VALUES ($1, $2, 'student')
		ON CONFLICT (user_id, section_id) DO NOTHING`,
		studentUserID, sectionID,
	)
	return err
}

// UnenrollPreviewStudentFromOtherSections removes the preview student from all
// sections except keepSectionID.
func (s *Store) UnenrollPreviewStudentFromOtherSections(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error {
	_, err := s.q.Exec(ctx, `
		DELETE FROM section_memberships
		WHERE user_id = $1 AND section_id != $2`,
		studentUserID, keepSectionID,
	)
	return err
}

// UnenrollPreviewStudent removes the preview student from a specific section.
// No-op if the student is not enrolled.
func (s *Store) UnenrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	_, err := s.q.Exec(ctx, `
		DELETE FROM section_memberships
		WHERE user_id = $1 AND section_id = $2`,
		studentUserID, sectionID,
	)
	return err
}

// DeletePreviewStudent deletes the preview student user for the given instructor.
// Within a transaction it:
//  1. Removes the student from all sessions.participants arrays (not covered by FK cascades)
//  2. Deletes the user row — ON DELETE CASCADE cleans up preview_students,
//     section_memberships, session_students, student_work, and revisions.
//
// No-op if the instructor has no preview student.
func (s *Store) DeletePreviewStudent(ctx context.Context, instructorID uuid.UUID) error {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Look up the student user ID so we can scrub the participants arrays.
	var studentUserID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT student_user_id FROM preview_students WHERE instructor_id = $1`,
		instructorID,
	).Scan(&studentUserID)
	if errors.Is(HandleNotFound(err), ErrNotFound) {
		// No preview student — nothing to delete.
		return nil
	}
	if err != nil {
		return fmt.Errorf("lookup preview student: %w", err)
	}

	// Remove from all sessions.participants arrays.
	_, err = tx.Exec(ctx, `
		UPDATE sessions SET participants = array_remove(participants, $1)
		WHERE $1 = ANY(participants)`,
		studentUserID,
	)
	if err != nil {
		return fmt.Errorf("remove from participants: %w", err)
	}

	// Delete the user — cascades handle all FK references.
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, studentUserID)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}

	return tx.Commit(ctx)
}

// Compile-time check that Store implements PreviewRepository.
var _ PreviewRepository = (*Store)(nil)
