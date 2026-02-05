// Integration tests for CRUD operations on namespaces, classes, sections, and memberships.
//
// These tests validate actual Store methods with proper RLS context,
// ensuring that the SQL queries, scanning logic, and RLS policies work
// together as they would in production.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration
package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/internal/auth"
)

// =============================================================================
// Namespace CRUD Tests - calls actual Store methods with RLS
// =============================================================================

func TestIntegration_CreateNamespace(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Use system-admin for namespace operations (can see all namespaces)
	adminID := uuid.New()
	// Create as system-admin (no namespace)
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authUser := &auth.User{
		ID:          adminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	maxInst := 5
	maxStu := 100

	createNSID := "ns-create-" + uuid.New().String()
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", createNSID)
	})

	t.Run("successful creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		ns, err := s.CreateNamespace(ctx, CreateNamespaceParams{
			ID:             createNSID,
			DisplayName:    "Create NS Test",
			MaxInstructors: &maxInst,
			MaxStudents:    &maxStu,
			CreatedBy:      &adminID,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns.ID != createNSID {
			t.Errorf("expected id %s, got %s", createNSID, ns.ID)
		}
		if ns.DisplayName != "Create NS Test" {
			t.Errorf("expected display_name 'Create NS Test', got %s", ns.DisplayName)
		}
		if !ns.Active {
			t.Error("expected active to be true by default")
		}
		if ns.MaxInstructors == nil || *ns.MaxInstructors != 5 {
			t.Errorf("expected max_instructors 5, got %v", ns.MaxInstructors)
		}
		if ns.MaxStudents == nil || *ns.MaxStudents != 100 {
			t.Errorf("expected max_students 100, got %v", ns.MaxStudents)
		}
		if ns.CreatedBy == nil || *ns.CreatedBy != adminID {
			t.Errorf("expected created_by %s, got %v", adminID, ns.CreatedBy)
		}
		if ns.CreatedAt.IsZero() {
			t.Error("expected non-zero created_at")
		}
	})

	t.Run("record exists after creation", func(t *testing.T) {
		var count int
		err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM namespaces WHERE id = $1", createNSID).Scan(&count)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 record, got %d", count)
		}
	})
}

func TestIntegration_GetNamespace(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	userID := uuid.New()
	db.createUser(ctx, t, userID, "user@test.com", "instructor", db.nsID)

	authUser := &auth.User{
		ID:          userID,
		Email:       "user@test.com",
		NamespaceID: db.nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		ns, err := s.GetNamespace(ctx, db.nsID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns.ID != db.nsID {
			t.Errorf("expected id %s, got %s", db.nsID, ns.ID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetNamespace(ctx, "nonexistent-"+uuid.New().String())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_ListNamespaces(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// System admin can see all namespaces
	adminID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authUser := &auth.User{
		ID:          adminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	// Create additional namespaces with a known prefix
	prefix := "ns-list-" + uuid.New().String()[:8]
	nsA := prefix + "-a"
	nsB := prefix + "-b"
	nsC := prefix + "-c"

	db.createNamespace(ctx, t, nsB, "NS B")
	db.createNamespace(ctx, t, nsA, "NS A")
	db.createNamespace(ctx, t, nsC, "NS C")
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id IN ($1, $2, $3)", nsA, nsB, nsC)
	})

	t.Run("system admin sees all namespaces", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListNamespaces(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Should see at least db.nsID plus nsA, nsB, nsC (4 total minimum)
		if len(results) < 4 {
			t.Errorf("expected at least 4 namespaces, got %d", len(results))
		}
	})
}

func TestIntegration_UpdateNamespace(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// System admin is required to update namespaces per RLS policy
	adminID := uuid.New()
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, role) VALUES ($1, $2, $3)`,
		adminID, "sysadmin@test.com", "system-admin")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", adminID)
	})

	authUser := &auth.User{
		ID:          adminID,
		Email:       "sysadmin@test.com",
		NamespaceID: "",
		Role:        auth.RoleSystemAdmin,
	}

	t.Run("partial update display_name only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "Updated Name"
		ns, err := s.UpdateNamespace(ctx, db.nsID, UpdateNamespaceParams{DisplayName: &newName})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns.DisplayName != "Updated Name" {
			t.Errorf("expected display_name 'Updated Name', got %s", ns.DisplayName)
		}
		if !ns.Active {
			t.Error("active should be unchanged (true)")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "Whatever"
		_, err := s.UpdateNamespace(ctx, "nonexistent-"+uuid.New().String(), UpdateNamespaceParams{DisplayName: &newName})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Class CRUD Tests - calls actual Store methods with RLS
// =============================================================================

func TestIntegration_CreateClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		desc := "A test class"
		c, err := s.CreateClass(ctx, CreateClassParams{
			NamespaceID: nsID,
			Name:        "CS101",
			Description: &desc,
			CreatedBy:   createdBy,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.NamespaceID != nsID {
			t.Errorf("expected namespace_id %s, got %s", nsID, c.NamespaceID)
		}
		if c.Name != "CS101" {
			t.Errorf("expected name CS101, got %s", c.Name)
		}
		if c.Description == nil || *c.Description != "A test class" {
			t.Errorf("expected description 'A test class', got %v", c.Description)
		}
		if c.CreatedBy != createdBy {
			t.Errorf("expected created_by %s, got %s", createdBy, c.CreatedBy)
		}
		if c.ID == uuid.Nil {
			t.Error("expected non-nil UUID id")
		}
		if c.CreatedAt.IsZero() {
			t.Error("expected non-zero created_at")
		}
	})
}

func TestIntegration_GetClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		c, err := s.GetClass(ctx, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.ID != classID {
			t.Errorf("expected id %s, got %s", classID, c.ID)
		}
		if c.Name != "CS101" {
			t.Errorf("expected name CS101, got %s", c.Name)
		}
		if c.NamespaceID != nsID {
			t.Errorf("expected namespace_id %s, got %s", nsID, c.NamespaceID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetClass(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_ListClasses(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("empty result before creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListClasses(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 classes, got %d", len(results))
		}
	})

	t.Run("multiple records ordered by created_at", func(t *testing.T) {
		c1 := uuid.New()
		db.createClass(ctx, t, c1, nsID, "CS101", createdBy)
		time.Sleep(10 * time.Millisecond)
		c2 := uuid.New()
		db.createClass(ctx, t, c2, nsID, "CS201", createdBy)

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListClasses(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("expected 2 classes, got %d", len(results))
		}
		if results[0].ID != c1 || results[1].ID != c2 {
			t.Errorf("expected order %s, %s, got %s, %s", c1, c2, results[0].ID, results[1].ID)
		}
	})
}

func TestIntegration_UpdateClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("partial update name only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "CS102"
		c, err := s.UpdateClass(ctx, classID, UpdateClassParams{Name: &newName})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.Name != "CS102" {
			t.Errorf("expected name CS102, got %s", c.Name)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "Whatever"
		_, err := s.UpdateClass(ctx, uuid.New(), UpdateClassParams{Name: &newName})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_DeleteClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful deletion", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		if err := s.DeleteClass(ctx, classID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM classes WHERE id = $1", classID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("class should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteClass(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Section CRUD Tests - calls actual Store methods with RLS
// =============================================================================

func TestIntegration_CreateSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		semester := "Fall 2025"
		joinCode := "JOIN-CREATE-" + uuid.New().String()[:8] // unique join code
		sec, err := s.CreateSection(ctx, CreateSectionParams{
			NamespaceID: nsID,
			ClassID:     classID,
			Name:        "Section A",
			Semester:    &semester,
			JoinCode:    joinCode,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.NamespaceID != nsID {
			t.Errorf("expected namespace_id %s, got %s", nsID, sec.NamespaceID)
		}
		if sec.ClassID != classID {
			t.Errorf("expected class_id %s, got %s", classID, sec.ClassID)
		}
		if sec.Name != "Section A" {
			t.Errorf("expected name 'Section A', got %s", sec.Name)
		}
		if sec.Semester == nil || *sec.Semester != "Fall 2025" {
			t.Errorf("expected semester 'Fall 2025', got %v", sec.Semester)
		}
		if sec.JoinCode != joinCode {
			t.Errorf("expected join_code %s, got %s", joinCode, sec.JoinCode)
		}
		if !sec.Active {
			t.Error("expected active to be true by default")
		}
		if sec.ID == uuid.Nil {
			t.Error("expected non-nil UUID id")
		}
	})
}

func TestIntegration_GetSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-GET")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		sec, err := s.GetSection(ctx, sectionID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.ID != sectionID {
			t.Errorf("expected id %s, got %s", sectionID, sec.ID)
		}
		if sec.Name != "Section A" {
			t.Errorf("expected name 'Section A', got %s", sec.Name)
		}
		expectedJoinCode := uniqueJoinCode(sectionID, "JOIN-GET")
		if sec.JoinCode != expectedJoinCode {
			t.Errorf("expected join_code %s, got %s", expectedJoinCode, sec.JoinCode)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetSection(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_ListSectionsByClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("empty result", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListSectionsByClass(ctx, uuid.New())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 sections, got %d", len(results))
		}
	})

	t.Run("multiple records ordered by created_at", func(t *testing.T) {
		s1 := uuid.New()
		db.createSection(ctx, t, s1, nsID, classID, "Section A", "JOIN-LIST-1")
		time.Sleep(10 * time.Millisecond)
		s2 := uuid.New()
		db.createSection(ctx, t, s2, nsID, classID, "Section B", "JOIN-LIST-2")

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListSectionsByClass(ctx, classID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 2 {
			t.Fatalf("expected 2 sections, got %d", len(results))
		}
		if results[0].ID != s1 || results[1].ID != s2 {
			t.Errorf("expected order %s, %s, got %s, %s", s1, s2, results[0].ID, results[1].ID)
		}
	})
}

func TestIntegration_UpdateSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-UPDATE")
	// RLS requires user to be section instructor to update/delete sections
	db.createMembership(ctx, t, createdBy, sectionID, "instructor")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("partial update name only", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "Section B"
		sec, err := s.UpdateSection(ctx, sectionID, UpdateSectionParams{Name: &newName})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.Name != "Section B" {
			t.Errorf("expected name 'Section B', got %s", sec.Name)
		}
		if !sec.Active {
			t.Error("active should be unchanged (true)")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		newName := "Whatever"
		_, err := s.UpdateSection(ctx, uuid.New(), UpdateSectionParams{Name: &newName})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_DeleteSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-DELETE")
	// RLS requires user to be section instructor to delete sections
	db.createMembership(ctx, t, createdBy, sectionID, "instructor")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful deletion", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		if err := s.DeleteSection(ctx, sectionID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM sections WHERE id = $1", sectionID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("section should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteSection(ctx, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Membership CRUD Tests - calls actual Store methods with RLS
// =============================================================================

func TestIntegration_CreateMembership(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID

	userID := uuid.New()
	db.createUser(ctx, t, userID, "member@test.com", "student", nsID)
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-MEMBER")

	authUser := &auth.User{
		ID:          userID,
		Email:       "member@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleStudent,
	}

	t.Run("successful creation", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		m, err := s.CreateMembership(ctx, CreateMembershipParams{UserID: userID, SectionID: sectionID, Role: "student"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if m.UserID != userID {
			t.Errorf("expected user_id %s, got %s", userID, m.UserID)
		}
		if m.SectionID != sectionID {
			t.Errorf("expected section_id %s, got %s", sectionID, m.SectionID)
		}
		if m.Role != "student" {
			t.Errorf("expected role student, got %s", m.Role)
		}
		if m.ID == uuid.Nil {
			t.Error("expected non-nil UUID id")
		}
		if m.JoinedAt.IsZero() {
			t.Error("expected non-zero joined_at")
		}
	})

	t.Run("duplicate returns ErrDuplicate", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.CreateMembership(ctx, CreateMembershipParams{UserID: userID, SectionID: sectionID, Role: "student"})
		if !errors.Is(err, ErrDuplicate) {
			t.Errorf("expected ErrDuplicate, got: %v", err)
		}
	})
}

func TestIntegration_GetSectionByJoinCode(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "UNIQUE")
	expectedJoinCode := uniqueJoinCode(sectionID, "UNIQUE")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		sec, err := s.GetSectionByJoinCode(ctx, expectedJoinCode)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.ID != sectionID {
			t.Errorf("expected id %s, got %s", sectionID, sec.ID)
		}
		if sec.JoinCode != expectedJoinCode {
			t.Errorf("expected join_code %s, got %s", expectedJoinCode, sec.JoinCode)
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		_, err := s.GetSectionByJoinCode(ctx, "NONEXISTENT-CODE-"+uuid.New().String()[:8])
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_DeleteMembership(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID

	userID := uuid.New()
	db.createUser(ctx, t, userID, "member@test.com", "student", nsID)
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-DEL-MEM")
	db.createMembership(ctx, t, userID, sectionID, "student")
	// RLS requires instructor to be a section instructor to delete memberships
	db.createMembership(ctx, t, createdBy, sectionID, "instructor")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("successful deletion", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		if err := s.DeleteMembership(ctx, sectionID, userID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM section_memberships WHERE section_id = $1 AND user_id = $2", sectionID, userID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("membership should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		err := s.DeleteMembership(ctx, sectionID, uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_ListMembers(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID

	user1 := uuid.New()
	user2 := uuid.New()
	db.createUser(ctx, t, user1, "stu1@test.com", "student", nsID)
	db.createUser(ctx, t, user2, "stu2@test.com", "student", nsID)
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-LIST-MEM")

	authUser := &auth.User{
		ID:          createdBy,
		Email:       "creator@test.com",
		NamespaceID: nsID,
		Role:        auth.RoleInstructor,
	}

	t.Run("empty result", func(t *testing.T) {
		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListMembers(ctx, uuid.New())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 members, got %d", len(results))
		}
	})

	t.Run("multiple members ordered by joined_at", func(t *testing.T) {
		db.createMembership(ctx, t, user1, sectionID, "student")
		time.Sleep(10 * time.Millisecond)
		db.createMembership(ctx, t, user2, sectionID, "student")
		db.createMembership(ctx, t, createdBy, sectionID, "instructor")

		s, conn := db.storeWithRLS(ctx, t, authUser)
		defer conn.Release()

		results, err := s.ListMembers(ctx, sectionID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 3 {
			t.Fatalf("expected 3 members, got %d", len(results))
		}
		if results[0].UserID != user1 {
			t.Errorf("expected first member %s, got %s", user1, results[0].UserID)
		}
	})
}
