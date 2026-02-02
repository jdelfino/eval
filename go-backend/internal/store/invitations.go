package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// computeInvitationStatus derives the status from timestamps.
func computeInvitationStatus(consumedAt *time.Time, revokedAt *time.Time, expiresAt time.Time) string {
	if consumedAt != nil {
		return "consumed"
	}
	if revokedAt != nil {
		return "revoked"
	}
	if time.Now().After(expiresAt) {
		return "expired"
	}
	return "pending"
}

func scanInvitation(row interface{ Scan(dest ...any) error }) (*Invitation, error) {
	var inv Invitation
	err := row.Scan(
		&inv.ID,
		&inv.Email,
		&inv.UserID,
		&inv.TargetRole,
		&inv.NamespaceID,
		&inv.CreatedBy,
		&inv.CreatedAt,
		&inv.UpdatedAt,
		&inv.ExpiresAt,
		&inv.ConsumedAt,
		&inv.ConsumedBy,
		&inv.RevokedAt,
	)
	if err != nil {
		return nil, err
	}
	inv.Status = computeInvitationStatus(inv.ConsumedAt, inv.RevokedAt, inv.ExpiresAt)
	return &inv, nil
}

const invitationColumns = `id, email, user_id, target_role, namespace_id, created_by, created_at, updated_at, expires_at, consumed_at, consumed_by, revoked_at`

// ListInvitations retrieves invitations with optional filters.
func (s *Store) ListInvitations(ctx context.Context, filters InvitationFilters) ([]Invitation, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if filters.NamespaceID != nil {
		conditions = append(conditions, fmt.Sprintf("namespace_id = $%d", argIdx))
		args = append(args, *filters.NamespaceID)
	}

	if filters.Status != nil {
		switch *filters.Status {
		case "pending":
			conditions = append(conditions, "consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()")
		case "consumed":
			conditions = append(conditions, "consumed_at IS NOT NULL")
		case "revoked":
			conditions = append(conditions, "revoked_at IS NOT NULL")
		case "expired":
			conditions = append(conditions, "consumed_at IS NULL AND revoked_at IS NULL AND expires_at <= now()")
		}
	}

	query := "SELECT " + invitationColumns + " FROM invitations"
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.q.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, *inv)
	}
	return invitations, rows.Err()
}

// GetInvitation retrieves an invitation by ID.
func (s *Store) GetInvitation(ctx context.Context, id uuid.UUID) (*Invitation, error) {
	query := "SELECT " + invitationColumns + " FROM invitations WHERE id = $1"
	inv, err := scanInvitation(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return inv, nil
}

// CreateInvitation creates a new invitation and returns it.
func (s *Store) CreateInvitation(ctx context.Context, params CreateInvitationParams) (*Invitation, error) {
	query := `INSERT INTO invitations (email, target_role, namespace_id, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + invitationColumns

	inv, err := scanInvitation(s.q.QueryRow(ctx, query,
		params.Email,
		params.TargetRole,
		params.NamespaceID,
		params.CreatedBy,
		params.ExpiresAt,
	))
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// RevokeInvitation sets revoked_at on an invitation and returns it.
func (s *Store) RevokeInvitation(ctx context.Context, id uuid.UUID) (*Invitation, error) {
	query := `UPDATE invitations SET revoked_at = now(), updated_at = now()
		WHERE id = $1 AND revoked_at IS NULL AND consumed_at IS NULL
		RETURNING ` + invitationColumns

	inv, err := scanInvitation(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return inv, nil
}

// ConsumeInvitation marks an invitation as consumed by a user.
func (s *Store) ConsumeInvitation(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*Invitation, error) {
	query := `UPDATE invitations SET consumed_at = now(), consumed_by = $2, user_id = $2, updated_at = now()
		WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
		RETURNING ` + invitationColumns

	inv, err := scanInvitation(s.q.QueryRow(ctx, query, id, userID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return inv, nil
}

// Compile-time check that Store implements InvitationRepository.
var _ InvitationRepository = (*Store)(nil)
