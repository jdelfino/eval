package httputil

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestPayload is a struct with validation tags for testing
type TestPayload struct {
	Name  string `json:"name" validate:"required,min=2"`
	Email string `json:"email" validate:"required,email"`
	Age   int    `json:"age" validate:"gte=0,lte=150"`
}

func TestBindJSON_ValidPayload(t *testing.T) {
	body := `{"name": "John Doe", "email": "john@example.com", "age": 30}`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err != nil {
		t.Fatalf("BindJSON returned error for valid payload: %v", err)
	}
	if result == nil {
		t.Fatal("BindJSON returned nil result for valid payload")
	}
	if result.Name != "John Doe" {
		t.Errorf("Name = %q, want %q", result.Name, "John Doe")
	}
	if result.Email != "john@example.com" {
		t.Errorf("Email = %q, want %q", result.Email, "john@example.com")
	}
	if result.Age != 30 {
		t.Errorf("Age = %d, want %d", result.Age, 30)
	}
}

func TestBindJSON_MalformedJSON(t *testing.T) {
	body := `{"name": "John Doe", "email": }`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for malformed JSON")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for malformed JSON")
	}
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusBadRequest)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&errResp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}
	if errResp["error"] != "invalid JSON body" {
		t.Errorf("Error message = %q, want %q", errResp["error"], "invalid JSON body")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

func TestBindJSON_EmptyBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(""))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for empty body")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for empty body")
	}
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestBindJSON_ValidationError_MissingRequired(t *testing.T) {
	body := `{"age": 30}`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for validation failure")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for validation failure")
	}
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusUnprocessableEntity)
	}

	var errResp struct {
		Errors []ValidationError `json:"errors"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&errResp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}

	if len(errResp.Errors) == 0 {
		t.Fatal("Expected validation errors, got none")
	}

	// Should have errors for name and email (both required)
	fieldErrors := make(map[string]bool)
	for _, ve := range errResp.Errors {
		fieldErrors[ve.Field] = true
	}
	if !fieldErrors["name"] {
		t.Error("Expected validation error for 'name' field")
	}
	if !fieldErrors["email"] {
		t.Error("Expected validation error for 'email' field")
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

func TestBindJSON_ValidationError_InvalidEmail(t *testing.T) {
	body := `{"name": "John", "email": "not-an-email", "age": 30}`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for invalid email")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for invalid email")
	}
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusUnprocessableEntity)
	}

	var errResp struct {
		Errors []ValidationError `json:"errors"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&errResp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}

	found := false
	for _, ve := range errResp.Errors {
		if ve.Field == "email" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected validation error for 'email' field")
	}
}

func TestBindJSON_ValidationError_AgeOutOfRange(t *testing.T) {
	body := `{"name": "John", "email": "john@example.com", "age": 200}`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for age out of range")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for age out of range")
	}
	if rr.Code != http.StatusUnprocessableEntity {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusUnprocessableEntity)
	}

	var errResp struct {
		Errors []ValidationError `json:"errors"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&errResp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}

	found := false
	for _, ve := range errResp.Errors {
		if ve.Field == "age" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected validation error for 'age' field")
	}
}

func TestBindJSON_BodyTooLarge(t *testing.T) {
	// Create a body larger than 1MB
	largeBody := strings.Repeat("a", 1<<20+1)
	body := `{"name": "` + largeBody + `", "email": "john@example.com", "age": 30}`
	req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	result, err := BindJSON[TestPayload](rr, req)

	if err == nil {
		t.Fatal("BindJSON should return error for oversized body")
	}
	if result != nil {
		t.Fatal("BindJSON should return nil result for oversized body")
	}
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusRequestEntityTooLarge)
	}

	var errResp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&errResp); err != nil {
		t.Fatalf("Failed to decode error response: %v", err)
	}
	if errResp["error"] != "request body too large" {
		t.Errorf("Error message = %q, want %q", errResp["error"], "request body too large")
	}
}

func TestWriteJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]string{"message": "hello"}

	WriteJSON(rr, http.StatusOK, data)

	if rr.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusOK)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["message"] != "hello" {
		t.Errorf("message = %q, want %q", resp["message"], "hello")
	}
}

func TestWriteJSON_CustomStatus(t *testing.T) {
	rr := httptest.NewRecorder()
	data := map[string]string{"status": "created"}

	WriteJSON(rr, http.StatusCreated, data)

	if rr.Code != http.StatusCreated {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusCreated)
	}
}

func TestWriteError(t *testing.T) {
	rr := httptest.NewRecorder()

	WriteError(rr, http.StatusBadRequest, "something went wrong")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusBadRequest)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "something went wrong" {
		t.Errorf("error = %q, want %q", resp["error"], "something went wrong")
	}
}

func TestWriteError_NotFound(t *testing.T) {
	rr := httptest.NewRecorder()

	WriteError(rr, http.StatusNotFound, "resource not found")

	if rr.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusNotFound)
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "resource not found" {
		t.Errorf("error = %q, want %q", resp["error"], "resource not found")
	}
}

func TestWriteInternalError(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	testErr := errors.New("database connection failed")

	WriteInternalError(rr, req, testErr, "internal error")

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want %d", rr.Code, http.StatusInternalServerError)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if resp["error"] != "internal error" {
		t.Errorf("error = %q, want %q", resp["error"], "internal error")
	}
}
