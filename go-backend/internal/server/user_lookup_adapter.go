package server

import (
	"context"

	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
)

// UserLookupAdapter bridges store.UserRepository to middleware.UserLookup.
// This avoids an import cycle between middleware and store packages.
type UserLookupAdapter struct {
	repo store.UserRepository
}

// NewUserLookupAdapter creates an adapter that wraps a store.UserRepository.
func NewUserLookupAdapter(repo store.UserRepository) *UserLookupAdapter {
	return &UserLookupAdapter{repo: repo}
}

// GetUserByExternalID looks up a user by external ID and maps the result
// to a middleware.UserRecord.
func (a *UserLookupAdapter) GetUserByExternalID(ctx context.Context, externalID string) (*custommw.UserRecord, error) {
	user, err := a.repo.GetUserByExternalID(ctx, externalID)
	if err != nil {
		return nil, err
	}
	return &custommw.UserRecord{
		ID:          user.ID,
		Email:       user.Email,
		Role:        user.Role,
		NamespaceID: user.NamespaceID,
	}, nil
}

// Compile-time check that UserLookupAdapter implements middleware.UserLookup.
var _ custommw.UserLookup = (*UserLookupAdapter)(nil)
