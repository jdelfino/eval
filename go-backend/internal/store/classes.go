package store

import (
	"context"

	"github.com/google/uuid"
)

// ListClasses retrieves all classes visible to the current user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListClasses(ctx context.Context) ([]Class, error) {
	const query = `
		SELECT id, namespace_id, name, description, created_by, created_at, updated_at
		FROM classes
		ORDER BY created_at`

	rows, err := s.q.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var classes []Class
	for rows.Next() {
		var c Class
		if err := rows.Scan(
			&c.ID,
			&c.NamespaceID,
			&c.Name,
			&c.Description,
			&c.CreatedBy,
			&c.CreatedAt,
			&c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		classes = append(classes, c)
	}
	return classes, rows.Err()
}

// GetClass retrieves a class by its ID.
// Returns ErrNotFound if the class does not exist.
func (s *Store) GetClass(ctx context.Context, id uuid.UUID) (*Class, error) {
	const query = `
		SELECT id, namespace_id, name, description, created_by, created_at, updated_at
		FROM classes
		WHERE id = $1`

	var c Class
	err := s.q.QueryRow(ctx, query, id).Scan(
		&c.ID,
		&c.NamespaceID,
		&c.Name,
		&c.Description,
		&c.CreatedBy,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &c, nil
}

// CreateClass creates a new class and returns the created record.
func (s *Store) CreateClass(ctx context.Context, params CreateClassParams) (*Class, error) {
	const query = `
		INSERT INTO classes (namespace_id, name, description, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, namespace_id, name, description, created_by, created_at, updated_at`

	var c Class
	err := s.q.QueryRow(ctx, query,
		params.NamespaceID,
		params.Name,
		params.Description,
		params.CreatedBy,
	).Scan(
		&c.ID,
		&c.NamespaceID,
		&c.Name,
		&c.Description,
		&c.CreatedBy,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &c, nil
}

// UpdateClass updates a class's mutable fields and returns the updated record.
// Returns ErrNotFound if the class does not exist.
func (s *Store) UpdateClass(ctx context.Context, id uuid.UUID, params UpdateClassParams) (*Class, error) {
	const query = `
		UPDATE classes
		SET name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at  = now()
		WHERE id = $1
		RETURNING id, namespace_id, name, description, created_by, created_at, updated_at`

	var c Class
	err := s.q.QueryRow(ctx, query,
		id,
		params.Name,
		params.Description,
	).Scan(
		&c.ID,
		&c.NamespaceID,
		&c.Name,
		&c.Description,
		&c.CreatedBy,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &c, nil
}

// DeleteClass deletes a class by its ID.
// Returns ErrNotFound if the class does not exist.
func (s *Store) DeleteClass(ctx context.Context, id uuid.UUID) error {
	tag, err := s.q.Exec(ctx, "DELETE FROM classes WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListClassInstructorNames returns distinct instructor display names (or emails)
// for all sections of a class, using a single joined query.
func (s *Store) ListClassInstructorNames(ctx context.Context, classID uuid.UUID) ([]string, error) {
	const query = `
		SELECT DISTINCT COALESCE(u.display_name, u.email)
		FROM sections s
		JOIN section_memberships sm ON sm.section_id = s.id
		JOIN users u ON u.id = sm.user_id
		WHERE s.class_id = $1
		  AND sm.role = 'instructor'
		ORDER BY 1`

	rows, err := s.q.Query(ctx, query, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// Compile-time check that Store implements ClassRepository.
var _ ClassRepository = (*Store)(nil)
