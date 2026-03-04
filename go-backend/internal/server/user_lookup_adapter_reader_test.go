package server

import (
	"context"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// stubUserReaderOnly implements store.UserReader but NOT store.UserRepository.
// This verifies that NewUserLookupAdapter accepts a store.UserReader,
// which is the narrower interface after the split.
//
// This file will not compile until NewUserLookupAdapter is changed to accept
// store.UserReader instead of store.UserRepository.
type stubUserReaderOnly struct{}

func (stubUserReaderOnly) GetUserByID(_ context.Context, _ uuid.UUID) (*store.User, error) {
	return nil, nil
}

func (stubUserReaderOnly) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return nil, nil
}

func (stubUserReaderOnly) GetUserByEmail(_ context.Context, _ string) (*store.User, error) {
	return nil, nil
}

// Compile-time check: stubUserReaderOnly satisfies store.UserReader.
var _ store.UserReader = stubUserReaderOnly{}

// Compile-time check: NewUserLookupAdapter accepts store.UserReader.
// This will FAIL to compile until the production code is updated.
var _ = NewUserLookupAdapter(stubUserReaderOnly{})
