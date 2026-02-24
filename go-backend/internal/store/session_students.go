package store

import (
	"context"

	"github.com/google/uuid"
)

const sessionStudentColumns = `id, session_id, user_id, name, joined_at, student_work_id`

func scanSessionStudent(row interface{ Scan(dest ...any) error }) (*SessionStudent, error) {
	var ss SessionStudent
	err := row.Scan(
		&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name,
		&ss.JoinedAt, &ss.StudentWorkID,
	)
	if err != nil {
		return nil, err
	}
	return &ss, nil
}

// JoinSession adds a student to a session. If the student is already in the session,
// the name and student_work_id are updated (idempotent). Also appends the user to the session's participants array.
func (s *Store) JoinSession(ctx context.Context, params JoinSessionParams) (*SessionStudent, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after commit

	insertQuery := `INSERT INTO session_students (session_id, user_id, name, student_work_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (session_id, user_id) DO UPDATE SET name = EXCLUDED.name, student_work_id = EXCLUDED.student_work_id
		RETURNING ` + sessionStudentColumns

	ss, err := scanSessionStudent(tx.QueryRow(ctx, insertQuery, params.SessionID, params.UserID, params.Name, params.StudentWorkID))
	if err != nil {
		return nil, err
	}

	// Append user to session participants via SECURITY DEFINER function
	// (students can't UPDATE sessions directly under RLS)
	_, err = tx.Exec(ctx, "SELECT add_session_participant($1, $2)", params.SessionID, params.UserID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return ss, nil
}

// ListSessionStudents retrieves all students in a session.
// Code and execution_settings are populated from student_work via JOIN.
func (s *Store) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]SessionStudent, error) {
	query := `SELECT
		ss.id, ss.session_id, ss.user_id, ss.name,
		sw.code, sw.execution_settings,
		ss.joined_at, ss.student_work_id
		FROM session_students ss
		JOIN student_work sw ON ss.student_work_id = sw.id
		WHERE ss.session_id = $1
		ORDER BY ss.joined_at DESC`

	rows, err := s.q.Query(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var students []SessionStudent
	for rows.Next() {
		var ss SessionStudent
		err := rows.Scan(
			&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name,
			&ss.Code, &ss.ExecutionSettings,
			&ss.JoinedAt, &ss.StudentWorkID,
		)
		if err != nil {
			return nil, err
		}
		students = append(students, ss)
	}
	return students, rows.Err()
}

// GetSessionStudent retrieves a single student's record in a session.
// Code and execution_settings are populated from student_work via JOIN.
// Returns ErrNotFound if the student is not in the session.
func (s *Store) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*SessionStudent, error) {
	query := `SELECT
		ss.id, ss.session_id, ss.user_id, ss.name,
		sw.code, sw.execution_settings,
		ss.joined_at, ss.student_work_id
		FROM session_students ss
		JOIN student_work sw ON ss.student_work_id = sw.id
		WHERE ss.session_id = $1 AND ss.user_id = $2`
	var ss SessionStudent
	err := s.q.QueryRow(ctx, query, sessionID, userID).Scan(
		&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name,
		&ss.Code, &ss.ExecutionSettings,
		&ss.JoinedAt, &ss.StudentWorkID,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return &ss, nil
}

// Compile-time check that Store implements SessionStudentRepository.
var _ SessionStudentRepository = (*Store)(nil)
