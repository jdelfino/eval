package store

import (
	"context"

	"github.com/google/uuid"
)

const sessionStudentColumns = `id, session_id, user_id, name, code, execution_settings, last_update`

func scanSessionStudent(row interface{ Scan(dest ...any) error }) (*SessionStudent, error) {
	var ss SessionStudent
	err := row.Scan(
		&ss.ID, &ss.SessionID, &ss.UserID, &ss.Name,
		&ss.Code, &ss.ExecutionSettings, &ss.LastUpdate,
	)
	if err != nil {
		return nil, err
	}
	return &ss, nil
}

// JoinSession adds a student to a session. If the student is already in the session,
// the name is updated (idempotent). Also appends the user to the session's participants array.
func (s *Store) JoinSession(ctx context.Context, params JoinSessionParams) (*SessionStudent, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after commit

	insertQuery := `INSERT INTO session_students (session_id, user_id, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (session_id, user_id) DO UPDATE SET name = EXCLUDED.name
		RETURNING ` + sessionStudentColumns

	ss, err := scanSessionStudent(tx.QueryRow(ctx, insertQuery, params.SessionID, params.UserID, params.Name))
	if err != nil {
		return nil, err
	}

	// Append user to session participants if not already present
	const updateParticipants = `
		UPDATE sessions SET participants = array_append(participants, $2)
		WHERE id = $1 AND NOT ($2 = ANY(participants))`

	_, err = tx.Exec(ctx, updateParticipants, params.SessionID, params.UserID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return ss, nil
}

// UpdateCode updates a student's code in a session and refreshes the session's last_activity.
// Returns ErrNotFound if the student is not in the session.
func (s *Store) UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*SessionStudent, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after commit

	updateQuery := `UPDATE session_students SET code = $3, last_update = now()
		WHERE session_id = $1 AND user_id = $2
		RETURNING ` + sessionStudentColumns

	ss, err := scanSessionStudent(tx.QueryRow(ctx, updateQuery, sessionID, userID, code))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	// Update session last_activity
	_, err = tx.Exec(ctx, "UPDATE sessions SET last_activity = now() WHERE id = $1", sessionID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return ss, nil
}

// ListSessionStudents retrieves all students in a session.
func (s *Store) ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]SessionStudent, error) {
	query := "SELECT " + sessionStudentColumns + " FROM session_students WHERE session_id = $1 ORDER BY last_update DESC"

	rows, err := s.q.Query(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var students []SessionStudent
	for rows.Next() {
		ss, err := scanSessionStudent(rows)
		if err != nil {
			return nil, err
		}
		students = append(students, *ss)
	}
	return students, rows.Err()
}

// GetSessionStudent retrieves a single student's record in a session.
// Returns ErrNotFound if the student is not in the session.
func (s *Store) GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*SessionStudent, error) {
	query := "SELECT " + sessionStudentColumns + " FROM session_students WHERE session_id = $1 AND user_id = $2"
	ss, err := scanSessionStudent(s.q.QueryRow(ctx, query, sessionID, userID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return ss, nil
}

// Compile-time check that Store implements SessionStudentRepository.
var _ SessionStudentRepository = (*Store)(nil)
