package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ListSessions retrieves all sessions visible to the current user.
// Results can be filtered by section_id and/or status.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSessions(ctx context.Context, filters SessionFilters) ([]Session, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, creator_id, participants,
		       status, created_at, last_activity, ended_at
		FROM sessions WHERE 1=1`

	args := []any{}
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
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var sess Session
		if err := rows.Scan(
			&sess.ID,
			&sess.NamespaceID,
			&sess.SectionID,
			&sess.SectionName,
			&sess.Problem,
			&sess.FeaturedStudentID,
			&sess.FeaturedCode,
			&sess.CreatorID,
			&sess.Participants,
			&sess.Status,
			&sess.CreatedAt,
			&sess.LastActivity,
			&sess.EndedAt,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

// GetSession retrieves a session by its ID.
// Returns ErrNotFound if the session does not exist.
func (s *Store) GetSession(ctx context.Context, id uuid.UUID) (*Session, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, creator_id, participants,
		       status, created_at, last_activity, ended_at
		FROM sessions
		WHERE id = $1`

	var sess Session
	err = conn.QueryRow(ctx, query, id).Scan(
		&sess.ID,
		&sess.NamespaceID,
		&sess.SectionID,
		&sess.SectionName,
		&sess.Problem,
		&sess.FeaturedStudentID,
		&sess.FeaturedCode,
		&sess.CreatorID,
		&sess.Participants,
		&sess.Status,
		&sess.CreatedAt,
		&sess.LastActivity,
		&sess.EndedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &sess, nil
}

// CreateSession creates a new session and returns the created record.
func (s *Store) CreateSession(ctx context.Context, params CreateSessionParams) (*Session, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO sessions (namespace_id, section_id, section_name, problem, creator_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

	var sess Session
	err = conn.QueryRow(ctx, query,
		params.NamespaceID,
		params.SectionID,
		params.SectionName,
		params.Problem,
		params.CreatorID,
	).Scan(
		&sess.ID,
		&sess.NamespaceID,
		&sess.SectionID,
		&sess.SectionName,
		&sess.Problem,
		&sess.FeaturedStudentID,
		&sess.FeaturedCode,
		&sess.CreatorID,
		&sess.Participants,
		&sess.Status,
		&sess.CreatedAt,
		&sess.LastActivity,
		&sess.EndedAt,
	)
	if err != nil {
		return nil, err
	}

	return &sess, nil
}

// UpdateSession updates a session's mutable fields and returns the updated record.
// Returns ErrNotFound if the session does not exist.
func (s *Store) UpdateSession(ctx context.Context, id uuid.UUID, params UpdateSessionParams) (*Session, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		UPDATE sessions
		SET last_activity = now()`

	args := []any{id}
	argIdx := 2

	if params.FeaturedStudentID != nil {
		query += fmt.Sprintf(",\n		    featured_student_id = $%d", argIdx)
		args = append(args, *params.FeaturedStudentID)
		argIdx++
	}

	if params.FeaturedCode != nil {
		query += fmt.Sprintf(",\n		    featured_code = $%d", argIdx)
		args = append(args, *params.FeaturedCode)
		argIdx++
	}

	if params.Status != nil {
		query += fmt.Sprintf(",\n		    status = $%d", argIdx)
		args = append(args, *params.Status)
		argIdx++
	}

	if params.EndedAt != nil {
		query += fmt.Sprintf(",\n		    ended_at = $%d", argIdx)
		args = append(args, *params.EndedAt)
	}

	query += `
		WHERE id = $1
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

	var sess Session
	err = conn.QueryRow(ctx, query, args...).Scan(
		&sess.ID,
		&sess.NamespaceID,
		&sess.SectionID,
		&sess.SectionName,
		&sess.Problem,
		&sess.FeaturedStudentID,
		&sess.FeaturedCode,
		&sess.CreatorID,
		&sess.Participants,
		&sess.Status,
		&sess.CreatedAt,
		&sess.LastActivity,
		&sess.EndedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &sess, nil
}

// Compile-time check that Store implements SessionRepository.
var _ SessionRepository = (*Store)(nil)
