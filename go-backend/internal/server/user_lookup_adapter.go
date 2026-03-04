package server

import (
	"context"

	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// UserLookupAdapter bridges store.UserReader to middleware.UserLookup.
// This avoids an import cycle between middleware and store packages.
// It accepts the narrower store.UserReader interface because only
// GetUserByExternalID is needed for authentication lookups.
type UserLookupAdapter struct {
	repo store.UserReader
}

// NewUserLookupAdapter creates an adapter that wraps a store.UserReader.
func NewUserLookupAdapter(repo store.UserReader) *UserLookupAdapter {
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
