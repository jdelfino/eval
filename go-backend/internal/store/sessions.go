package store

import (
	"context"
	"encoding/json"
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
		argIdx++ //nolint:ineffassign // keep argIdx consistent for future filters
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
		argIdx++
	}

	if params.ClearEndedAt {
		query += ",\n		    ended_at = NULL"
	}

	if params.ClearFeatured {
		query += ",\n		    featured_student_id = NULL"
		query += ",\n		    featured_code = NULL"
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

// ListSessionHistory retrieves sessions based on user role.
// Instructors see sessions they created; students see sessions they participated in.
func (s *Store) ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters SessionHistoryFilters) ([]Session, error) {
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

	// Role-aware filtering
	if isCreator {
		query += fmt.Sprintf(" AND creator_id = $%d", argIdx)
		args = append(args, userID)
		argIdx++
	} else {
		query += fmt.Sprintf(" AND $%d = ANY(participants)", argIdx)
		args = append(args, userID)
		argIdx++
	}

	if filters.ClassID != nil {
		query += fmt.Sprintf(" AND section_id IN (SELECT id FROM sections WHERE class_id = $%d)", argIdx)
		args = append(args, *filters.ClassID)
		argIdx++
	}

	if filters.Search != nil {
		query += fmt.Sprintf(" AND section_name ILIKE '%%' || $%d || '%%'", argIdx)
		args = append(args, *filters.Search)
		argIdx++ //nolint:ineffassign // keep argIdx consistent for future filters
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

// UpdateSessionProblem updates the problem JSON snapshot and last_activity for a session.
// Returns ErrNotFound if the session does not exist.
func (s *Store) UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*Session, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		UPDATE sessions
		SET problem = $2, last_activity = now()
		WHERE id = $1
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

	var sess Session
	err = conn.QueryRow(ctx, query, id, problem).Scan(
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
