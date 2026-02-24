package store

import (
	"context"

	"github.com/google/uuid"
)

const revisionColumns = `id, namespace_id, session_id, user_id, timestamp,
		       is_diff, diff, full_code, base_revision_id, execution_result, student_work_id`

func scanRevision(row interface{ Scan(dest ...any) error }) (*Revision, error) {
	var rev Revision
	err := row.Scan(
		&rev.ID, &rev.NamespaceID, &rev.SessionID, &rev.UserID, &rev.Timestamp,
		&rev.IsDiff, &rev.Diff, &rev.FullCode, &rev.BaseRevisionID, &rev.ExecutionResult,
		&rev.StudentWorkID,
	)
	if err != nil {
		return nil, err
	}
	return &rev, nil
}

// ListRevisions retrieves all revisions for a session, optionally filtered by user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]Revision, error) {
	query := "SELECT " + revisionColumns + " FROM revisions WHERE session_id = $1"

	ac := newArgCounter(2, sessionID)
	if userID != nil {
		query += " AND user_id = " + ac.Next(*userID)
	}
	query += " ORDER BY timestamp"

	rows, err := s.q.Query(ctx, query, ac.args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revisions []Revision
	for rows.Next() {
		rev, err := scanRevision(rows)
		if err != nil {
			return nil, err
		}
		revisions = append(revisions, *rev)
	}
	return revisions, rows.Err()
}

// CreateRevision creates a new revision and returns the created record.
func (s *Store) CreateRevision(ctx context.Context, params CreateRevisionParams) (*Revision, error) {
	query := `INSERT INTO revisions (namespace_id, session_id, user_id, is_diff, diff, full_code, base_revision_id, execution_result, student_work_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING ` + revisionColumns

	rev, err := scanRevision(s.q.QueryRow(ctx, query,
		params.NamespaceID, params.SessionID, params.UserID,
		params.IsDiff, params.Diff, params.FullCode,
		params.BaseRevisionID, params.ExecutionResult,
		params.StudentWorkID,
	))
	if err != nil {
		return nil, err
	}
	return rev, nil
}

// Compile-time check that Store implements RevisionRepository.
var _ RevisionRepository = (*Store)(nil)
