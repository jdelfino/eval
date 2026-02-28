package auth

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestPreviewContextFrom_NilWhenNotSet(t *testing.T) {
	ctx := context.Background()
	pc := PreviewContextFrom(ctx)
	if pc != nil {
		t.Errorf("PreviewContextFrom() = %v, want nil", pc)
	}
}

func TestIsPreview_FalseWhenNotSet(t *testing.T) {
	ctx := context.Background()
	if IsPreview(ctx) {
		t.Error("IsPreview() = true, want false")
	}
}

func TestWithPreviewContext_RoundTrip(t *testing.T) {
	ctx := context.Background()

	originalUser := &User{
		ID:          uuid.New(),
		Email:       "instructor@test.com",
		NamespaceID: "test-ns",
		Role:        RoleInstructor,
	}
	sectionID := uuid.New()

	pc := PreviewContext{
		OriginalUser: originalUser,
		SectionID:    sectionID,
	}

	ctx = WithPreviewContext(ctx, pc)

	got := PreviewContextFrom(ctx)
	if got == nil {
		t.Fatal("PreviewContextFrom() returned nil, want non-nil")
	}
	if got.OriginalUser != originalUser {
		t.Errorf("OriginalUser = %v, want %v", got.OriginalUser, originalUser)
	}
	if got.SectionID != sectionID {
		t.Errorf("SectionID = %v, want %v", got.SectionID, sectionID)
	}
}

func TestIsPreview_TrueWhenSet(t *testing.T) {
	ctx := context.Background()

	originalUser := &User{
		ID:    uuid.New(),
		Email: "instructor@test.com",
		Role:  RoleInstructor,
	}

	ctx = WithPreviewContext(ctx, PreviewContext{
		OriginalUser: originalUser,
		SectionID:    uuid.New(),
	})

	if !IsPreview(ctx) {
		t.Error("IsPreview() = false, want true")
	}
}

func TestWithPreviewContext_OverwritesExisting(t *testing.T) {
	ctx := context.Background()

	user1 := &User{ID: uuid.New(), Email: "first@test.com", Role: RoleInstructor}
	user2 := &User{ID: uuid.New(), Email: "second@test.com", Role: RoleInstructor}
	section1 := uuid.New()
	section2 := uuid.New()

	ctx = WithPreviewContext(ctx, PreviewContext{OriginalUser: user1, SectionID: section1})
	ctx = WithPreviewContext(ctx, PreviewContext{OriginalUser: user2, SectionID: section2})

	got := PreviewContextFrom(ctx)
	if got == nil {
		t.Fatal("PreviewContextFrom() returned nil")
	}
	if got.OriginalUser.Email != "second@test.com" {
		t.Errorf("OriginalUser.Email = %q, want %q", got.OriginalUser.Email, "second@test.com")
	}
	if got.SectionID != section2 {
		t.Errorf("SectionID = %v, want %v", got.SectionID, section2)
	}
}

func TestPreviewContextFrom_ReturnsPointer(t *testing.T) {
	ctx := context.Background()

	originalUser := &User{
		ID:    uuid.New(),
		Email: "instructor@test.com",
		Role:  RoleInstructor,
	}
	sectionID := uuid.New()

	ctx = WithPreviewContext(ctx, PreviewContext{
		OriginalUser: originalUser,
		SectionID:    sectionID,
	})

	// Two calls should return equal values.
	got1 := PreviewContextFrom(ctx)
	got2 := PreviewContextFrom(ctx)

	if got1 == nil || got2 == nil {
		t.Fatal("PreviewContextFrom() returned nil")
	}
	if got1.SectionID != got2.SectionID {
		t.Errorf("inconsistent SectionID: %v vs %v", got1.SectionID, got2.SectionID)
	}
}
