package store

import (
	"context"

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

// Compile-time check that Store implements UserRepository.
var _ UserRepository = (*Store)(nil)
