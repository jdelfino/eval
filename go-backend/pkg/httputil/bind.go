// Package httputil provides HTTP utilities for JSON binding, validation, and response writing.
package httputil

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-playground/validator/v10"
)

// validate is the shared validator instance
var validate = validator.New(validator.WithRequiredStructEnabled())

// ValidationError represents a single field validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// BindJSON decodes JSON body into T and validates using struct tags.
// On decode error: writes 400 Bad Request with {"error": "invalid JSON body"}
// On validation error: writes 422 Unprocessable Entity with {"errors": [...]}
// On success: returns pointer to decoded value, nil error
func BindJSON[T any](w http.ResponseWriter, r *http.Request) (*T, error) {
	// Limit request body to 1MB
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var payload T

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		// Check for body too large
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			WriteError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return nil, err
		}
		// Handle empty body or malformed JSON
		if errors.Is(err, io.EOF) || err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON body")
			return nil, err
		}
	}

	if err := validate.Struct(payload); err != nil {
		var validationErrors validator.ValidationErrors
		if errors.As(err, &validationErrors) {
			errs := make([]ValidationError, 0, len(validationErrors))
			for _, fe := range validationErrors {
				errs = append(errs, ValidationError{
					Field:   toJSONFieldName(fe),
					Message: buildValidationMessage(fe),
				})
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string][]ValidationError{"errors": errs})
			return nil, err
		}
		// Non-validation error during validation
		WriteError(w, http.StatusBadRequest, "invalid JSON body")
		return nil, err
	}

	return &payload, nil
}

// toJSONFieldName extracts the JSON field name from a FieldError
func toJSONFieldName(fe validator.FieldError) string {
	// Get the field name in lowercase (json convention)
	name := fe.Field()
	if len(name) > 0 {
		return strings.ToLower(name[:1]) + name[1:]
	}
	return name
}

// buildValidationMessage creates a human-readable validation error message
func buildValidationMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return "must be at least " + fe.Param() + " characters"
	case "max":
		return "must be at most " + fe.Param() + " characters"
	case "gte":
		return "must be greater than or equal to " + fe.Param()
	case "lte":
		return "must be less than or equal to " + fe.Param()
	case "gt":
		return "must be greater than " + fe.Param()
	case "lt":
		return "must be less than " + fe.Param()
	default:
		return "failed validation: " + fe.Tag()
	}
}

// WriteJSON writes a JSON response with the given status code
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// WriteError writes a JSON error response with the given status code and message
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}
