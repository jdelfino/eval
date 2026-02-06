package store

import (
	"context"
)

const namespaceColumns = `id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at`

func scanNamespace(row interface{ Scan(dest ...any) error }) (*Namespace, error) {
	var ns Namespace
	err := row.Scan(
		&ns.ID, &ns.DisplayName, &ns.Active,
		&ns.MaxInstructors, &ns.MaxStudents,
		&ns.CreatedAt, &ns.CreatedBy, &ns.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &ns, nil
}

// ListNamespaces retrieves all namespaces visible to the current user.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListNamespaces(ctx context.Context) ([]Namespace, error) {
	query := "SELECT " + namespaceColumns + " FROM namespaces ORDER BY id"

	rows, err := s.q.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var namespaces []Namespace
	for rows.Next() {
		ns, err := scanNamespace(rows)
		if err != nil {
			return nil, err
		}
		namespaces = append(namespaces, *ns)
	}
	return namespaces, rows.Err()
}

// GetNamespace retrieves a namespace by its ID.
// Returns ErrNotFound if the namespace does not exist.
func (s *Store) GetNamespace(ctx context.Context, id string) (*Namespace, error) {
	query := "SELECT " + namespaceColumns + " FROM namespaces WHERE id = $1"
	ns, err := scanNamespace(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return ns, nil
}

// CreateNamespace creates a new namespace and returns the created record.
func (s *Store) CreateNamespace(ctx context.Context, params CreateNamespaceParams) (*Namespace, error) {
	query := `INSERT INTO namespaces (id, display_name, max_instructors, max_students, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + namespaceColumns

	ns, err := scanNamespace(s.q.QueryRow(ctx, query,
		params.ID, params.DisplayName, params.MaxInstructors, params.MaxStudents, params.CreatedBy,
	))
	if err != nil {
		return nil, err
	}
	return ns, nil
}

// UpdateNamespace updates a namespace's mutable fields and returns the updated record.
// Returns ErrNotFound if the namespace does not exist.
func (s *Store) UpdateNamespace(ctx context.Context, id string, params UpdateNamespaceParams) (*Namespace, error) {
	query := `UPDATE namespaces
		SET display_name = COALESCE($2, display_name), active = COALESCE($3, active),
		    max_instructors = COALESCE($4, max_instructors), max_students = COALESCE($5, max_students),
		    updated_at = now()
		WHERE id = $1
		RETURNING ` + namespaceColumns

	ns, err := scanNamespace(s.q.QueryRow(ctx, query,
		id, params.DisplayName, params.Active, params.MaxInstructors, params.MaxStudents,
	))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return ns, nil
}

// Compile-time check that Store implements NamespaceRepository.
var _ NamespaceRepository = (*Store)(nil)
