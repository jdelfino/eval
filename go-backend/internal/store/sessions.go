package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// sessionColumns is the standard column list for session queries.
const sessionColumns = `id, namespace_id, section_id, section_name, problem,
		       featured_student_id, featured_code, featured_execution_settings,
		       creator_id, participants,
		       status, created_at, last_activity, ended_at`

// scanSession scans a row into a Session struct.
// The row must contain columns in sessionColumns order.
func scanSession(row pgx.Row) (*Session, error) {
	var sess Session
	err := row.Scan(
		&sess.ID,
		&sess.NamespaceID,
		&sess.SectionID,
		&sess.SectionName,
		&sess.Problem,
		&sess.FeaturedStudentID,
		&sess.FeaturedCode,
		&sess.FeaturedExecutionSettings,
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

// scanSessions scans multiple rows into a slice of Sessions.
// Each row must contain columns in sessionColumns order.
func scanSessions(rows pgx.Rows) ([]Session, error) {
	var sessions []Session
	for rows.Next() {
		sess, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, *sess)
	}
	return sessions, rows.Err()
}

// ListSessions retrieves all sessions visible to the current user.
// Results can be filtered by section_id and/or status.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSessions(ctx context.Context, filters SessionFilters) ([]Session, error) {
	query := `SELECT ` + sessionColumns + ` FROM sessions WHERE 1=1`

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

	return scanSessions(rows)
}

// GetSession retrieves a session by its ID.
// Returns ErrNotFound if the session does not exist.
func (s *Store) GetSession(ctx context.Context, id uuid.UUID) (*Session, error) {
	query := `SELECT ` + sessionColumns + ` FROM sessions WHERE id = $1`

	sess, err := scanSession(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return sess, nil
}

// CreateSession creates a new session and returns the created record.
func (s *Store) CreateSession(ctx context.Context, params CreateSessionParams) (*Session, error) {
	query := `
		INSERT INTO sessions (namespace_id, section_id, section_name, problem, creator_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + sessionColumns

	return scanSession(s.q.QueryRow(ctx, query,
		params.NamespaceID,
		params.SectionID,
		params.SectionName,
		params.Problem,
		params.CreatorID,
	))
}

// EndActiveSessions marks all active sessions in a section as completed
// and returns their IDs.
func (s *Store) EndActiveSessions(ctx context.Context, sectionID uuid.UUID) ([]uuid.UUID, error) {
	query := `
		UPDATE sessions
		SET status = 'completed', ended_at = now(), last_activity = now()
		WHERE section_id = $1 AND status = 'active'
		RETURNING id`

	rows, err := s.q.Query(ctx, query, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// UpdateSession updates a session's mutable fields and returns the updated record.
// Returns ErrNotFound if the session does not exist.
func (s *Store) UpdateSession(ctx context.Context, id uuid.UUID, params UpdateSessionParams) (*Session, error) {
	query := `
		UPDATE sessions
		SET last_activity = now()`

	ac := newArgCounter(2, id)

	// ClearFeatured NULLs all featured fields first; explicit FeaturedCode /
	// FeaturedExecutionSettings may then override specific columns (used by
	// the "Show Solution" code-only featuring path).
	if params.ClearFeatured {
		query += ",\n		    featured_student_id = NULL"
		query += ",\n		    featured_code = NULL"
		query += ",\n		    featured_execution_settings = NULL"
	}

	if params.FeaturedStudentID != nil {
		query += ",\n		    featured_student_id = " + ac.Next(*params.FeaturedStudentID)
	}

	if params.FeaturedCode != nil {
		query += ",\n		    featured_code = " + ac.Next(*params.FeaturedCode)
	}

	if params.FeaturedExecutionSettings != nil {
		query += ",\n		    featured_execution_settings = " + ac.Next(params.FeaturedExecutionSettings)
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

	query += `
		WHERE id = $1
		RETURNING ` + sessionColumns

	sess, err := scanSession(s.q.QueryRow(ctx, query, ac.args...))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return sess, nil
}

// ListSessionHistory retrieves sessions based on user role.
// Instructors see sessions they created; students see sessions they participated in.
func (s *Store) ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters SessionHistoryFilters) ([]Session, error) {
	query := `SELECT ` + sessionColumns + ` FROM sessions WHERE 1=1`

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

	return scanSessions(rows)
}

// UpdateSessionProblem updates the problem JSON snapshot and last_activity for a session.
// Returns ErrNotFound if the session does not exist.
func (s *Store) UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*Session, error) {
	query := `
		UPDATE sessions
		SET problem = $2, last_activity = now()
		WHERE id = $1
		RETURNING ` + sessionColumns

	sess, err := scanSession(s.q.QueryRow(ctx, query, id, problem))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return sess, nil
}

// FindCompletedSessionByProblem finds the most recent completed session in a section
// whose problem JSON contains the given problem ID.
// Returns ErrNotFound if no matching session exists.
func (s *Store) FindCompletedSessionByProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*Session, error) {
	query := `SELECT ` + sessionColumns + ` FROM sessions
		WHERE section_id = $1 AND status = 'completed' AND problem->>'id' = $2::text
		ORDER BY created_at DESC LIMIT 1`

	sess, err := scanSession(s.q.QueryRow(ctx, query, sectionID, problemID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sess, nil
}

// CreateSessionReplacingActive atomically ends active sessions and creates a new one.
func (s *Store) CreateSessionReplacingActive(ctx context.Context, params CreateSessionParams) (*Session, []uuid.UUID, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// End active sessions in the section
	endQuery := `
		UPDATE sessions
		SET status = 'completed', ended_at = now(), last_activity = now()
		WHERE section_id = $1 AND status = 'active'
		RETURNING id`

	rows, err := tx.Query(ctx, endQuery, params.SectionID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var endedIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, nil, err
		}
		endedIDs = append(endedIDs, id)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Create the new session
	createQuery := `
		INSERT INTO sessions (namespace_id, section_id, section_name, problem, creator_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + sessionColumns

	sess, err := scanSession(tx.QueryRow(ctx, createQuery,
		params.NamespaceID,
		params.SectionID,
		params.SectionName,
		params.Problem,
		params.CreatorID,
	))
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return sess, endedIDs, nil
}

// ReopenSessionReplacingActive atomically ends other active sessions and reopens the given one.
func (s *Store) ReopenSessionReplacingActive(ctx context.Context, id uuid.UUID, sectionID uuid.UUID) (*Session, []uuid.UUID, error) {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// End active sessions in the section (excluding the one being reopened)
	endQuery := `
		UPDATE sessions
		SET status = 'completed', ended_at = now(), last_activity = now()
		WHERE section_id = $1 AND status = 'active' AND id != $2
		RETURNING id`

	rows, err := tx.Query(ctx, endQuery, sectionID, id)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var endedIDs []uuid.UUID
	for rows.Next() {
		var endedID uuid.UUID
		if err := rows.Scan(&endedID); err != nil {
			return nil, nil, err
		}
		endedIDs = append(endedIDs, endedID)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Reopen the session
	reopenQuery := `
		UPDATE sessions
		SET status = 'active', ended_at = NULL, last_activity = now()
		WHERE id = $1
		RETURNING ` + sessionColumns

	sess, err := scanSession(tx.QueryRow(ctx, reopenQuery, id))
	if err != nil {
		return nil, nil, HandleNotFound(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	return sess, endedIDs, nil
}

// Compile-time check that Store implements SessionRepository.
var _ SessionRepository = (*Store)(nil)
