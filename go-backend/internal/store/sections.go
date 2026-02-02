package store

import (
	"context"

	"github.com/google/uuid"
)

// ListSectionsByClass retrieves all sections for a given class.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]Section, error) {
	const query = `
		SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
		FROM sections
		WHERE class_id = $1
		ORDER BY created_at`

	rows, err := s.q.Query(ctx, query, classID)
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
	const query = `
		SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
		FROM sections
		WHERE id = $1`

	var sec Section
	err := s.q.QueryRow(ctx, query, id).Scan(
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
	const query = `
		INSERT INTO sections (namespace_id, class_id, name, semester, join_code)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`

	var sec Section
	err := s.q.QueryRow(ctx, query,
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
	const query = `
		UPDATE sections
		SET name       = COALESCE($2, name),
		    semester   = COALESCE($3, semester),
		    active     = COALESCE($4, active),
		    updated_at = now()
		WHERE id = $1
		RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`

	var sec Section
	err := s.q.QueryRow(ctx, query,
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
	tag, err := s.q.Exec(ctx, "DELETE FROM sections WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListMySections retrieves sections the user is enrolled in with class info.
func (s *Store) ListMySections(ctx context.Context, userID uuid.UUID) ([]MySectionInfo, error) {
	const query = `
		SELECT s.id, s.namespace_id, s.class_id, s.name, s.semester, s.join_code, s.active,
		       s.created_at, s.updated_at, c.name
		FROM sections s
		JOIN section_memberships sm ON sm.section_id = s.id
		JOIN classes c ON c.id = s.class_id
		WHERE sm.user_id = $1
		ORDER BY s.created_at`

	rows, err := s.q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []MySectionInfo
	for rows.Next() {
		var info MySectionInfo
		if err := rows.Scan(
			&info.Section.ID,
			&info.Section.NamespaceID,
			&info.Section.ClassID,
			&info.Section.Name,
			&info.Section.Semester,
			&info.Section.JoinCode,
			&info.Section.Active,
			&info.Section.CreatedAt,
			&info.Section.UpdatedAt,
			&info.ClassName,
		); err != nil {
			return nil, err
		}
		results = append(results, info)
	}
	return results, rows.Err()
}

// UpdateSectionJoinCode updates a section's join code.
// Returns ErrNotFound if the section does not exist.
func (s *Store) UpdateSectionJoinCode(ctx context.Context, id uuid.UUID, joinCode string) (*Section, error) {
	const query = `
		UPDATE sections
		SET join_code = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`

	var sec Section
	err := s.q.QueryRow(ctx, query, id, joinCode).Scan(
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

// Compile-time check that Store implements SectionRepository.
var _ SectionRepository = (*Store)(nil)
