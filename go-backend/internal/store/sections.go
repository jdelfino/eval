package store

import (
	"context"

	"github.com/google/uuid"
)

// ListSectionsByClass retrieves all sections for a given class.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]Section, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
		FROM sections
		WHERE class_id = $1
		ORDER BY created_at`

	rows, err := conn.Query(ctx, query, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []Section
	for rows.Next() {
		var sec Section
		if err := rows.Scan(
			&sec.ID,
			&sec.NamespaceID,
			&sec.ClassID,
			&sec.Name,
			&sec.Semester,
			&sec.JoinCode,
			&sec.Active,
			&sec.CreatedAt,
			&sec.UpdatedAt,
		); err != nil {
			return nil, err
		}
		sections = append(sections, sec)
	}
	return sections, rows.Err()
}

// GetSection retrieves a section by its ID.
// Returns ErrNotFound if the section does not exist.
func (s *Store) GetSection(ctx context.Context, id uuid.UUID) (*Section, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
		FROM sections
		WHERE id = $1`

	var sec Section
	err = conn.QueryRow(ctx, query, id).Scan(
		&sec.ID,
		&sec.NamespaceID,
		&sec.ClassID,
		&sec.Name,
		&sec.Semester,
		&sec.JoinCode,
		&sec.Active,
		&sec.CreatedAt,
		&sec.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &sec, nil
}

// CreateSection creates a new section and returns the created record.
func (s *Store) CreateSection(ctx context.Context, params CreateSectionParams) (*Section, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO sections (namespace_id, class_id, name, semester, join_code)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`

	var sec Section
	err = conn.QueryRow(ctx, query,
		params.NamespaceID,
		params.ClassID,
		params.Name,
		params.Semester,
		params.JoinCode,
	).Scan(
		&sec.ID,
		&sec.NamespaceID,
		&sec.ClassID,
		&sec.Name,
		&sec.Semester,
		&sec.JoinCode,
		&sec.Active,
		&sec.CreatedAt,
		&sec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &sec, nil
}

// UpdateSection updates a section's mutable fields and returns the updated record.
// Returns ErrNotFound if the section does not exist.
func (s *Store) UpdateSection(ctx context.Context, id uuid.UUID, params UpdateSectionParams) (*Section, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		UPDATE sections
		SET name       = COALESCE($2, name),
		    semester   = COALESCE($3, semester),
		    active     = COALESCE($4, active),
		    updated_at = now()
		WHERE id = $1
		RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`

	var sec Section
	err = conn.QueryRow(ctx, query,
		id,
		params.Name,
		params.Semester,
		params.Active,
	).Scan(
		&sec.ID,
		&sec.NamespaceID,
		&sec.ClassID,
		&sec.Name,
		&sec.Semester,
		&sec.JoinCode,
		&sec.Active,
		&sec.CreatedAt,
		&sec.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &sec, nil
}

// DeleteSection deletes a section by its ID.
// Returns ErrNotFound if the section does not exist.
func (s *Store) DeleteSection(ctx context.Context, id uuid.UUID) error {
	conn, err := s.conn(ctx)
	if err != nil {
		return err
	}

	tag, err := conn.Exec(ctx, "DELETE FROM sections WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Compile-time check that Store implements SectionRepository.
var _ SectionRepository = (*Store)(nil)
