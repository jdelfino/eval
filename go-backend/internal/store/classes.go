package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// classColumns is the standard column list for class queries.
const classColumns = `id, namespace_id, name, description, created_by, created_at, updated_at`

// scanClass scans a row into a Class struct.
// The row must contain columns in classColumns order.
func scanClass(row pgx.Row) (*Class, error) {
	var c Class
	err := row.Scan(
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

// scanClasses scans multiple rows into a slice of Classes.
// Each row must contain columns in classColumns order.
func scanClasses(rows pgx.Rows) ([]Class, error) {
	var classes []Class
	for rows.Next() {
		c, err := scanClass(rows)
		if err != nil {
			return nil, err
		}
		classes = append(classes, *c)
	}
	return classes, rows.Err()
}

// ListClasses retrieves all classes visible to the current user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListClasses(ctx context.Context) ([]Class, error) {
	query := `SELECT ` + classColumns + ` FROM classes ORDER BY created_at`

	rows, err := s.q.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanClasses(rows)
}

// ListMyClasses retrieves classes the user created OR where they have an instructor
// section membership.
func (s *Store) ListMyClasses(ctx context.Context, userID uuid.UUID) ([]Class, error) {
	const query = `
		SELECT DISTINCT c.id, c.namespace_id, c.name, c.description, c.created_by, c.created_at, c.updated_at
		FROM classes c
		LEFT JOIN sections sec ON sec.class_id = c.id
		WHERE c.created_by = $1
		   OR sec.id IN (
		       SELECT section_id FROM section_memberships
		       WHERE user_id = $1 AND role = 'instructor'
		   )
		ORDER BY c.created_at`

	rows, err := s.q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanClasses(rows)
}

// GetClass retrieves a class by its ID.
// Returns ErrNotFound if the class does not exist.
func (s *Store) GetClass(ctx context.Context, id uuid.UUID) (*Class, error) {
	query := `SELECT ` + classColumns + ` FROM classes WHERE id = $1`

	c, err := scanClass(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return c, nil
}

// CreateClass creates a new class and returns the created record.
func (s *Store) CreateClass(ctx context.Context, params CreateClassParams) (*Class, error) {
	query := `
		INSERT INTO classes (namespace_id, name, description, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + classColumns

	return scanClass(s.q.QueryRow(ctx, query,
		params.NamespaceID,
		params.Name,
		params.Description,
		params.CreatedBy,
	))
}

// UpdateClass updates a class's mutable fields and returns the updated record.
// Returns ErrNotFound if the class does not exist.
func (s *Store) UpdateClass(ctx context.Context, id uuid.UUID, params UpdateClassParams) (*Class, error) {
	query := `
		UPDATE classes
		SET name        = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at  = now()
		WHERE id = $1
		RETURNING ` + classColumns

	c, err := scanClass(s.q.QueryRow(ctx, query,
		id,
		params.Name,
		params.Description,
	))
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return c, nil
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

// ListClassInstructorNames returns a map of user_id -> display name (or email)
// for all instructors across sections of a class.
func (s *Store) ListClassInstructorNames(ctx context.Context, classID uuid.UUID) (map[string]string, error) {
	const query = `
		SELECT DISTINCT u.id, COALESCE(u.display_name, u.email)
		FROM sections s
		JOIN section_memberships sm ON sm.section_id = s.id
		JOIN users u ON u.id = sm.user_id
		WHERE s.class_id = $1
		  AND sm.role = 'instructor'
		ORDER BY 2`

	rows, err := s.q.Query(ctx, query, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := make(map[string]string)
	for rows.Next() {
		var userID, name string
		if err := rows.Scan(&userID, &name); err != nil {
			return nil, err
		}
		names[userID] = name
	}
	return names, rows.Err()
}

// ListClassSectionInstructors returns a map of section_id -> []user_id
// for all instructor memberships across sections of a class.
func (s *Store) ListClassSectionInstructors(ctx context.Context, classID uuid.UUID) (map[string][]string, error) {
	const query = `
		SELECT sm.section_id, sm.user_id
		FROM sections s
		JOIN section_memberships sm ON sm.section_id = s.id
		WHERE s.class_id = $1
		  AND sm.role = 'instructor'
		ORDER BY sm.section_id, sm.joined_at`

	rows, err := s.q.Query(ctx, query, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]string)
	for rows.Next() {
		var sectionID, userID string
		if err := rows.Scan(&sectionID, &userID); err != nil {
			return nil, err
		}
		result[sectionID] = append(result[sectionID], userID)
	}
	return result, rows.Err()
}

// Compile-time check that Store implements ClassRepository.
var _ ClassRepository = (*Store)(nil)
