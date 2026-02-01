package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// GetUserByID retrieves a user by their primary key ID.
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE id = $1`

	var user User
	err = conn.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

// GetUserByExternalID retrieves a user by their Identity Platform uid (external_id).
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByExternalID(ctx context.Context, externalID string) (*User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE external_id = $1`

	var user User
	err = conn.QueryRow(ctx, query, externalID).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

// UpdateUser updates a user's mutable fields and returns the updated user.
// Returns ErrNotFound if the user does not exist.
func (s *Store) UpdateUser(ctx context.Context, id uuid.UUID, params UpdateUserParams) (*User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		UPDATE users
		SET display_name = COALESCE($2, display_name),
		    updated_at = now()
		WHERE id = $1
		RETURNING id, external_id, email, role, namespace_id, display_name, created_at, updated_at`

	var user User
	err = conn.QueryRow(ctx, query, id, params.DisplayName).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

// GetUserByEmail retrieves a user by email address.
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE email = $1`

	var user User
	err = conn.QueryRow(ctx, query, email).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

// ListUsers retrieves users with optional filters.
func (s *Store) ListUsers(ctx context.Context, filters UserFilters) ([]User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE 1=1`

	var args []any
	argIdx := 1

	if filters.NamespaceID != nil {
		query += fmt.Sprintf(" AND namespace_id = $%d", argIdx)
		args = append(args, *filters.NamespaceID)
		argIdx++
	}

	if filters.Role != nil {
		query += fmt.Sprintf(" AND role = $%d", argIdx)
		args = append(args, *filters.Role)
		argIdx++ //nolint:ineffassign
	}

	query += " ORDER BY created_at"

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID,
			&u.ExternalID,
			&u.Email,
			&u.Role,
			&u.NamespaceID,
			&u.DisplayName,
			&u.CreatedAt,
			&u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateUserAdmin updates a user's fields as an admin and returns the updated user.
// Uses dynamic SET clauses so that nullable fields (namespace_id, display_name) can
// be explicitly cleared by passing a non-nil pointer to an empty/zero value.
// Returns ErrNotFound if the user does not exist.
func (s *Store) UpdateUserAdmin(ctx context.Context, id uuid.UUID, params UpdateUserAdminParams) (*User, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	setClauses := []string{"updated_at = now()"}
	args := []any{id}
	argIdx := 2

	if params.Email != nil {
		setClauses = append(setClauses, fmt.Sprintf("email = $%d", argIdx))
		args = append(args, *params.Email)
		argIdx++
	}
	if params.DisplayName != nil {
		setClauses = append(setClauses, fmt.Sprintf("display_name = $%d", argIdx))
		args = append(args, *params.DisplayName)
		argIdx++
	}
	if params.Role != nil {
		setClauses = append(setClauses, fmt.Sprintf("role = $%d", argIdx))
		args = append(args, *params.Role)
		argIdx++
	}
	if params.NamespaceID != nil {
		setClauses = append(setClauses, fmt.Sprintf("namespace_id = $%d", argIdx))
		args = append(args, *params.NamespaceID)
		argIdx++ //nolint:ineffassign
	}

	query := fmt.Sprintf(`
		UPDATE users
		SET %s
		WHERE id = $1
		RETURNING id, external_id, email, role, namespace_id, display_name, created_at, updated_at`,
		strings.Join(setClauses, ", "))

	var user User
	err = conn.QueryRow(ctx, query, args...).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

// DeleteUser deletes a user by ID.
// Returns ErrNotFound if the user does not exist.
func (s *Store) DeleteUser(ctx context.Context, id uuid.UUID) error {
	conn, err := s.conn(ctx)
	if err != nil {
		return err
	}

	tag, err := conn.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountUsersByRole counts users grouped by role within a namespace.
func (s *Store) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT role, COUNT(*)
		FROM users
		WHERE namespace_id = $1
		GROUP BY role`

	rows, err := conn.Query(ctx, query, namespaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return nil, err
		}
		counts[role] = count
	}
	return counts, rows.Err()
}

// Compile-time check that Store implements UserRepository.
var _ UserRepository = (*Store)(nil)
