package httputil

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ParseUUIDParam extracts and parses a UUID URL parameter.
// On error, writes a 400 response and returns uuid.Nil, false.
func ParseUUIDParam(w http.ResponseWriter, r *http.Request, param string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, param))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid "+param)
		return uuid.Nil, false
	}
	return id, true
}
