package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// Test that Join() creates student_work and stores student_work_id
func TestJoinSession_WithStudentWork_CreatesAndLinksStudentWork(t *testing.T) {
	ss := testSessionStudent()
	userID := ss.UserID
	problemID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	sectionID := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

	// Session with problem JSON containing id field
	sess := testSession()
	sess.ID = ss.SessionID
	sess.Problem = json.RawMessage(fmt.Sprintf(`{"id":"%s","title":"Test Problem"}`, problemID))
	sess.SectionID = sectionID

	var capturedStudentWorkID *uuid.UUID
	studentRepo := &mockSessionStudentRepo{
		joinSessionFn: func(_ context.Context, params store.JoinSessionParams) (*store.SessionStudent, error) {
			capturedStudentWorkID = params.StudentWorkID
			ss.StudentWorkID = params.StudentWorkID
			ss.Code = "# starter code from student_work"
			return ss, nil
		},
	}

	sessionRepo := &mockSessionRepo{
		getSessionFn: func(_ context.Context, id uuid.UUID) (*store.Session, error) {
			if id != ss.SessionID {
				t.Fatalf("unexpected session id: %v", id)
			}
			return sess, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		getOrCreateStudentWorkFn: func(_ context.Context, nsID string, uID, pID, sectID uuid.UUID) (*store.StudentWork, error) {
			if uID != userID {
				t.Errorf("expected user_id %v, got %v", userID, uID)
			}
			if pID != problemID {
				t.Errorf("expected problem_id %v, got %v", problemID, pID)
			}
			if sectID != sectionID {
				t.Errorf("expected section_id %v, got %v", sectionID, sectID)
			}
			return &store.StudentWork{
				ID:          studentWorkID,
				NamespaceID: nsID,
				UserID:      uID,
				ProblemID:   pID,
				SectionID:   sectID,
				Code:        "# starter code from student_work",
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Alice"})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPost, "/sessions/"+ss.SessionID.String()+"/join", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, sessionRepo, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Join(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify student_work_id was passed to JoinSession
	if capturedStudentWorkID == nil {
		t.Fatal("expected student_work_id to be passed to JoinSession, got nil")
	}
	if *capturedStudentWorkID != studentWorkID {
		t.Errorf("expected student_work_id %v, got %v", studentWorkID, *capturedStudentWorkID)
	}

	// Verify response contains code from student_work
	var got store.SessionStudent
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Code != "# starter code from student_work" {
		t.Errorf("expected code from student_work, got %q", got.Code)
	}
}

// Test that UpdateCode() updates student_work instead of session_students.code
func TestUpdateCode_WithStudentWork_UpdatesStudentWorkNotSessionStudents(t *testing.T) {
	ss := testSessionStudent()
	studentWorkID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	ss.StudentWorkID = &studentWorkID
	userID := ss.UserID
	newCode := "print('updated code')"

	var updatedWorkID uuid.UUID
	var updatedParams store.UpdateStudentWorkParams

	studentRepo := &mockSessionStudentRepo{
		getSessionStudentFn: func(_ context.Context, sessID, uID uuid.UUID) (*store.SessionStudent, error) {
			if sessID != ss.SessionID || uID != userID {
				return nil, store.ErrNotFound
			}
			return ss, nil
		},
	}

	workRepo := &mockStudentWorkRepo{
		updateStudentWorkFn: func(_ context.Context, id uuid.UUID, params store.UpdateStudentWorkParams) (*store.StudentWork, error) {
			updatedWorkID = id
			updatedParams = params
			return &store.StudentWork{
				ID:   id,
				Code: *params.Code,
			}, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"code": newCode})
	h := NewSessionStudentHandler(noopPublisher())
	req := httptest.NewRequest(http.MethodPut, "/sessions/"+ss.SessionID.String()+"/code", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := withChiParam(req.Context(), "id", ss.SessionID.String())
	ctx = auth.WithUser(ctx, &auth.User{ID: userID, NamespaceID: "test-ns", Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, studReposWithAllMocks(studentRepo, nil, workRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify UpdateStudentWork was called with correct student_work_id
	if updatedWorkID != studentWorkID {
		t.Errorf("expected UpdateStudentWork to be called with id %v, got %v", studentWorkID, updatedWorkID)
	}
	if updatedParams.Code == nil || *updatedParams.Code != newCode {
		t.Errorf("expected code %q, got %v", newCode, updatedParams.Code)
	}
}

// Helper to create test repos with all mocks
func studReposWithAllMocks(studRepo *mockSessionStudentRepo, sessRepo *mockSessionRepo, workRepo *mockStudentWorkRepo) *sessionStudentTestRepos {
	return &sessionStudentTestRepos{students: studRepo, sessions: sessRepo, studentWork: workRepo}
}
