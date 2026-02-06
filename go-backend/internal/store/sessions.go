package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

// ListSessions retrieves all sessions visible to the current user.
// Results can be filtered by section_id and/or status.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSessions(ctx context.Context, filters SessionFilters) ([]Session, error) {
	query := `
		SELECT id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, creator_id, participants,
		       status, created_at, last_activity, ended_at
		FROM sessions WHERE 1=1`

	ac := newArgCounter(1)

	if filters.SectionID != nil {
		query += " AND section_id = " + ac.Next(*filters.SectionID)
	}
	if filters.Status != nil {
		query += " AND status = " + ac.Next(*filters.Status)
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.q.Query(ctx, query, ac.args...)
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
	const query = `
		SELECT id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, creator_id, participants,
		       status, created_at, last_activity, ended_at
		FROM sessions
		WHERE id = $1`

	var sess Session
	err := s.q.QueryRow(ctx, query, id).Scan(
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
	const query = `
		INSERT INTO sessions (namespace_id, section_id, section_name, problem, creator_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

	var sess Session
	err := s.q.QueryRow(ctx, query,
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
	query := `
		UPDATE sessions
		SET last_activity = now()`

	ac := newArgCounter(2, id)

	if params.FeaturedStudentID != nil {
		query += ",\n		    featured_student_id = " + ac.Next(*params.FeaturedStudentID)
	}

	if params.FeaturedCode != nil {
		query += ",\n		    featured_code = " + ac.Next(*params.FeaturedCode)
	}

	if params.Status != nil {
		query += ",\n		    status = " + ac.Next(*params.Status)
	}

	if params.EndedAt != nil {
		query += ",\n		    ended_at = " + ac.Next(*params.EndedAt)
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
	err := s.q.QueryRow(ctx, query, ac.args...).Scan(
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
	query := `
		SELECT id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, creator_id, participants,
		       status, created_at, last_activity, ended_at
		FROM sessions WHERE 1=1`

	ac := newArgCounter(1)

	// Role-aware filtering
	if isCreator {
		query += " AND creator_id = " + ac.Next(userID)
	} else {
		query += " AND " + ac.Next(userID) + " = ANY(participants)"
	}

	if filters.ClassID != nil {
		query += " AND section_id IN (SELECT id FROM sections WHERE class_id = " + ac.Next(*filters.ClassID) + ")"
	}

	if filters.Search != nil {
		query += " AND section_name ILIKE '%' || " + ac.Next(*filters.Search) + " || '%'"
	}

	query += " ORDER BY created_at DESC"

	rows, err := s.q.Query(ctx, query, ac.args...)
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
	const query = `
		UPDATE sessions
		SET problem = $2, last_activity = now()
		WHERE id = $1
		RETURNING id, namespace_id, section_id, section_name, problem,
		          featured_student_id, featured_code, creator_id, participants,
		          status, created_at, last_activity, ended_at`

	var sess Session
	err := s.q.QueryRow(ctx, query, id, problem).Scan(
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
