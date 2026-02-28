package middleware

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// PreviewMiddleware returns a middleware that implements instructor preview-as-student mode.
//
// When the X-Preview-Section header is present on a request, this middleware:
//  1. Verifies the caller is an instructor or above (not a student).
//  2. Looks up the instructor's preview student via previewRepo.
//  3. Swaps the authenticated user in context to the preview student's identity.
//  4. Attaches a PreviewContext so downstream handlers know they are in preview mode.
//
// ORDERING REQUIREMENT: This middleware MUST run after UserLoader (needs user in context)
// and BEFORE RLSContextMiddleware (RLS reads auth.UserFromContext to set session variables;
// swapping before RLS means all DB queries execute as the preview student).
//
// When the header is absent, the middleware is a no-op and calls next without modification.
func PreviewMiddleware(previewRepo store.PreviewRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			sectionHeader := r.Header.Get("X-Preview-Section")
			if sectionHeader == "" {
				// No preview header — pass through unchanged.
				next.ServeHTTP(w, r)
				return
			}

			// Require an authenticated user.
			instructor := auth.UserFromContext(ctx)
			if instructor == nil {
				writeJSONError(w, r, http.StatusForbidden, "authentication required")
				return
			}

			// Only instructors and above may use preview mode.
			// Students are explicitly rejected; they cannot preview as another student.
			if instructor.Role == auth.RoleStudent {
				writeJSONError(w, r, http.StatusForbidden, "preview mode requires instructor or higher role")
				return
			}

			// Parse the section UUID from the header.
			sectionID, err := uuid.Parse(sectionHeader)
			if err != nil {
				writeJSONError(w, r, http.StatusBadRequest, "invalid X-Preview-Section: must be a valid UUID")
				return
			}

			// Look up the instructor's preview student.
			ps, err := previewRepo.GetPreviewStudent(ctx, instructor.ID)
			if err != nil {
				if errors.Is(err, store.ErrNotFound) {
					writeJSONError(w, r, http.StatusPreconditionFailed,
						"preview not initialized, call POST /sections/{id}/preview first")
					return
				}
				writeJSONError(w, r, http.StatusInternalServerError, "internal error")
				return
			}

			// Build the preview student's auth.User. Use the instructor's namespace
			// because the preview student is in the same namespace.
			previewUser := &auth.User{
				ID:          ps.StudentUserID,
				Role:        auth.RoleStudent,
				NamespaceID: instructor.NamespaceID,
				// Email is not critical for RLS; omit to avoid a DB round-trip.
			}

			// Swap the identity in context and attach preview state.
			ctx = auth.WithUser(ctx, previewUser)
			ctx = auth.WithPreviewContext(ctx, auth.PreviewContext{
				OriginalUser: instructor,
				SectionID:    sectionID,
			})

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
