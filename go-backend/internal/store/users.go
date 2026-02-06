package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

const userColumns = `id, external_id, email, role, namespace_id, display_name, created_at, updated_at`

func scanUser(row interface{ Scan(dest ...any) error }) (*User, error) {
	var u User
	err := row.Scan(
		&u.ID,
		&u.ExternalID,
		&u.Email,
		&u.Role,
		&u.NamespaceID,
		&u.DisplayName,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByID retrieves a user by their primary key ID.
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	query := "SELECT " + userColumns + " FROM users WHERE id = $1"
	u, err := scanUser(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return u, nil
}

// GetUserByExternalID retrieves a user by their Identity Platform uid (external_id).
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByExternalID(ctx context.Context, externalID string) (*User, error) {
	query := "SELECT " + userColumns + " FROM users WHERE external_id = $1"
	u, err := scanUser(s.q.QueryRow(ctx, query, externalID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return u, nil
}

// UpdateUser updates a user's mutable fields and returns the updated user.
// Returns ErrNotFound if the user does not exist.
func (s *Store) UpdateUser(ctx context.Context, id uuid.UUID, params UpdateUserParams) (*User, error) {
	query := `UPDATE users
		SET display_name = COALESCE($2, display_name), updated_at = now()
		WHERE id = $1
		RETURNING ` + userColumns

	u, err := scanUser(s.q.QueryRow(ctx, query, id, params.DisplayName))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return u, nil
}

// GetUserByEmail retrieves a user by email address.
// Returns ErrNotFound if the user does not exist.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	query := "SELECT " + userColumns + " FROM users WHERE email = $1"
	u, err := scanUser(s.q.QueryRow(ctx, query, email))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return u, nil
}

// ListUsers retrieves users with optional filters.
func (s *Store) ListUsers(ctx context.Context, filters UserFilters) ([]User, error) {
	query := "SELECT " + userColumns + " FROM users WHERE 1=1"

	ac := newArgCounter(1)

	if filters.NamespaceID != nil {
		query += " AND namespace_id = " + ac.Next(*filters.NamespaceID)
	}

	if filters.Role != nil {
		query += " AND role = " + ac.Next(*filters.Role)
	}

	query += " ORDER BY created_at"

	rows, err := s.q.Query(ctx, query, ac.args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, rows.Err()
}

// UpdateUserAdmin updates a user's fields as an admin and returns the updated user.
// Uses dynamic SET clauses so that nullable fields (namespace_id, display_name) can
// be explicitly cleared by passing a non-nil pointer to an empty/zero value.
// Returns ErrNotFound if the user does not exist.
func (s *Store) UpdateUserAdmin(ctx context.Context, id uuid.UUID, params UpdateUserAdminParams) (*User, error) {
	setClauses := []string{"updated_at = now()"}
	ac := newArgCounter(2, id)

	if params.Email != nil {
		setClauses = append(setClauses, "email = "+ac.Next(*params.Email))
	}
	if params.DisplayName != nil {
		setClauses = append(setClauses, "display_name = "+ac.Next(*params.DisplayName))
	}
	if params.Role != nil {
		setClauses = append(setClauses, "role = "+ac.Next(*params.Role))
	}
	if params.NamespaceID != nil {
		setClauses = append(setClauses, "namespace_id = "+ac.Next(*params.NamespaceID))
	}

	query := fmt.Sprintf(`UPDATE users SET %s WHERE id = $1 RETURNING `+userColumns,
		strings.Join(setClauses, ", "))

	u, err := scanUser(s.q.QueryRow(ctx, query, ac.args...))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return u, nil
}

// DeleteUser deletes a user by ID.
// Returns ErrNotFound if the user does not exist.
func (s *Store) DeleteUser(ctx context.Context, id uuid.UUID) error {
	tag, err := s.q.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
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
	const query = `
		SELECT role, COUNT(*)
		FROM users
		WHERE namespace_id = $1
		GROUP BY role`

	rows, err := s.q.Query(ctx, query, namespaceID)
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

// CreateUser creates a new user and returns it.
func (s *Store) CreateUser(ctx context.Context, params CreateUserParams) (*User, error) {
	query := `INSERT INTO users (external_id, email, role, namespace_id, display_name)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + userColumns

	u, err := scanUser(s.q.QueryRow(ctx, query,
		params.ExternalID, params.Email, params.Role, params.NamespaceID, params.DisplayName,
	))
	if err != nil {
		return nil, err
	}
	return u, nil
}

// UpsertUser inserts a user or updates them on external_id conflict.
// Used by the bootstrap CLI to idempotently create admin users.
func (s *Store) UpsertUser(ctx context.Context, params CreateUserParams) (*User, error) {
	query := `INSERT INTO users (external_id, email, role, namespace_id, display_name)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (external_id) DO UPDATE
		SET email = EXCLUDED.email,
		    role = EXCLUDED.role,
		    namespace_id = EXCLUDED.namespace_id,
		    display_name = EXCLUDED.display_name,
		    updated_at = now()
		RETURNING ` + userColumns

	u, err := scanUser(s.q.QueryRow(ctx, query,
		params.ExternalID, params.Email, params.Role, params.NamespaceID, params.DisplayName,
	))
	if err != nil {
		return nil, err
	}
	return u, nil
}

// Compile-time check that Store implements UserRepository.
var _ UserRepository = (*Store)(nil)
