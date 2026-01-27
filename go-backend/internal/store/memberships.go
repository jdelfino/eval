package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// SectionMembership represents a user's membership in a section.
type SectionMembership struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	SectionID uuid.UUID `json:"section_id"`
	Role      string    `json:"role"` // "instructor" or "student"
	JoinedAt  time.Time `json:"joined_at"`
}

// CreateMembershipParams contains the fields for creating a membership.
type CreateMembershipParams struct {
	UserID    uuid.UUID
	SectionID uuid.UUID
	Role      string
}

// GetSectionByJoinCode retrieves a section by its join code.
// Returns ErrNotFound if no section has the given code.
func (s *Store) GetSectionByJoinCode(ctx context.Context, code string) (*Section, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
		FROM sections
		WHERE join_code = $1`

	var sec Section
	err = conn.QueryRow(ctx, query, code).Scan(
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

// CreateMembership creates a new section membership and returns the created record.
func (s *Store) CreateMembership(ctx context.Context, params CreateMembershipParams) (*SectionMembership, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO section_memberships (user_id, section_id, role)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, section_id, role, joined_at`

	var m SectionMembership
	err = conn.QueryRow(ctx, query,
		params.UserID,
		params.SectionID,
		params.Role,
	).Scan(
		&m.ID,
		&m.UserID,
		&m.SectionID,
		&m.Role,
		&m.JoinedAt,
	)
	if err != nil {
		return nil, err
	}

	return &m, nil
}

// DeleteMembership deletes a user's membership from a section.
// Returns ErrNotFound if the membership does not exist.
func (s *Store) DeleteMembership(ctx context.Context, sectionID, userID uuid.UUID) error {
	conn, err := s.conn(ctx)
	if err != nil {
		return err
	}

	tag, err := conn.Exec(ctx, "DELETE FROM section_memberships WHERE section_id = $1 AND user_id = $2", sectionID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListMembers retrieves all memberships for a given section.
func (s *Store) ListMembers(ctx context.Context, sectionID uuid.UUID) ([]SectionMembership, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, user_id, section_id, role, joined_at
		FROM section_memberships
		WHERE section_id = $1
		ORDER BY joined_at`

	rows, err := conn.Query(ctx, query, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []SectionMembership
	for rows.Next() {
		var m SectionMembership
		if err := rows.Scan(
			&m.ID,
			&m.UserID,
			&m.SectionID,
			&m.Role,
			&m.JoinedAt,
		); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// Compile-time check that Store implements MembershipRepository.
var _ MembershipRepository = (*Store)(nil)
