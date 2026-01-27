package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ListRevisions retrieves all revisions for a session, optionally filtered by user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]Revision, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, namespace_id, session_id, user_id, timestamp,
		       is_diff, diff, full_code, base_revision_id, execution_result
		FROM revisions WHERE session_id = $1`

	args := []any{sessionID}
	if userID != nil {
		query += fmt.Sprintf(" AND user_id = $%d", 2)
		args = append(args, *userID)
	}
	query += " ORDER BY timestamp"

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revisions []Revision
	for rows.Next() {
		var rev Revision
		if err := rows.Scan(
			&rev.ID,
			&rev.NamespaceID,
			&rev.SessionID,
			&rev.UserID,
			&rev.Timestamp,
			&rev.IsDiff,
			&rev.Diff,
			&rev.FullCode,
			&rev.BaseRevisionID,
			&rev.ExecutionResult,
		); err != nil {
			return nil, err
		}
		revisions = append(revisions, rev)
	}
	return revisions, rows.Err()
}

// CreateRevision creates a new revision and returns the created record.
func (s *Store) CreateRevision(ctx context.Context, params CreateRevisionParams) (*Revision, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO revisions (namespace_id, session_id, user_id, is_diff, diff, full_code, base_revision_id, execution_result)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, namespace_id, session_id, user_id, timestamp,
		          is_diff, diff, full_code, base_revision_id, execution_result`

	var rev Revision
	err = conn.QueryRow(ctx, query,
		params.NamespaceID,
		params.SessionID,
		params.UserID,
		params.IsDiff,
		params.Diff,
		params.FullCode,
		params.BaseRevisionID,
		params.ExecutionResult,
	).Scan(
		&rev.ID,
		&rev.NamespaceID,
		&rev.SessionID,
		&rev.UserID,
		&rev.Timestamp,
		&rev.IsDiff,
		&rev.Diff,
		&rev.FullCode,
		&rev.BaseRevisionID,
		&rev.ExecutionResult,
	)
	if err != nil {
		return nil, err
	}

	return &rev, nil
}

// Compile-time check that Store implements RevisionRepository.
var _ RevisionRepository = (*Store)(nil)
