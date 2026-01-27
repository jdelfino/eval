package store

import (
	"context"
)

// ListNamespaces retrieves all namespaces visible to the current user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListNamespaces(ctx context.Context) ([]Namespace, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at
		FROM namespaces
		ORDER BY id`

	rows, err := conn.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var namespaces []Namespace
	for rows.Next() {
		var ns Namespace
		if err := rows.Scan(
			&ns.ID,
			&ns.DisplayName,
			&ns.Active,
			&ns.MaxInstructors,
			&ns.MaxStudents,
			&ns.CreatedAt,
			&ns.CreatedBy,
			&ns.UpdatedAt,
		); err != nil {
			return nil, err
		}
		namespaces = append(namespaces, ns)
	}
	return namespaces, rows.Err()
}

// GetNamespace retrieves a namespace by its ID.
// Returns ErrNotFound if the namespace does not exist.
func (s *Store) GetNamespace(ctx context.Context, id string) (*Namespace, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at
		FROM namespaces
		WHERE id = $1`

	var ns Namespace
	err = conn.QueryRow(ctx, query, id).Scan(
		&ns.ID,
		&ns.DisplayName,
		&ns.Active,
		&ns.MaxInstructors,
		&ns.MaxStudents,
		&ns.CreatedAt,
		&ns.CreatedBy,
		&ns.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &ns, nil
}

// CreateNamespace creates a new namespace and returns the created record.
func (s *Store) CreateNamespace(ctx context.Context, params CreateNamespaceParams) (*Namespace, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO namespaces (id, display_name, max_instructors, max_students, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at`

	var ns Namespace
	err = conn.QueryRow(ctx, query,
		params.ID,
		params.DisplayName,
		params.MaxInstructors,
		params.MaxStudents,
		params.CreatedBy,
	).Scan(
		&ns.ID,
		&ns.DisplayName,
		&ns.Active,
		&ns.MaxInstructors,
		&ns.MaxStudents,
		&ns.CreatedAt,
		&ns.CreatedBy,
		&ns.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &ns, nil
}

// UpdateNamespace updates a namespace's mutable fields and returns the updated record.
// Returns ErrNotFound if the namespace does not exist.
func (s *Store) UpdateNamespace(ctx context.Context, id string, params UpdateNamespaceParams) (*Namespace, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		UPDATE namespaces
		SET display_name    = COALESCE($2, display_name),
		    active          = COALESCE($3, active),
		    max_instructors = COALESCE($4, max_instructors),
		    max_students    = COALESCE($5, max_students),
		    updated_at      = now()
		WHERE id = $1
		RETURNING id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at`

	var ns Namespace
	err = conn.QueryRow(ctx, query,
		id,
		params.DisplayName,
		params.Active,
		params.MaxInstructors,
		params.MaxStudents,
	).Scan(
		&ns.ID,
		&ns.DisplayName,
		&ns.Active,
		&ns.MaxInstructors,
		&ns.MaxStudents,
		&ns.CreatedAt,
		&ns.CreatedBy,
		&ns.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &ns, nil
}

// Compile-time check that Store implements NamespaceRepository.
var _ NamespaceRepository = (*Store)(nil)
