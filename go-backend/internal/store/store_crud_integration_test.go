package store

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

// =============================================================================
// Namespace CRUD Tests
// =============================================================================

func TestIntegration_CreateNamespace(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	// Use the test namespace for setup user
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, fmt.Sprintf("creator-%s@test.com", db.nsID), "instructor", db.nsID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	maxInst := 5
	maxStu := 100

	createNSID := "ns-create-" + uuid.New().String()
	t.Cleanup(func() {
		_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id = $1", createNSID)
	})

	t.Run("successful creation", func(t *testing.T) {
		var ns Namespace
		err := conn.QueryRow(ctx,
			`INSERT INTO namespaces (id, display_name, max_instructors, max_students, created_by)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at`,
			createNSID, "Create NS Test", &maxInst, &maxStu, &createdBy,
		).Scan(&ns.ID, &ns.DisplayName, &ns.Active, &ns.MaxInstructors, &ns.MaxStudents, &ns.CreatedAt, &ns.CreatedBy, &ns.UpdatedAt)
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
		if ns.CreatedBy == nil || *ns.CreatedBy != createdBy {
			t.Errorf("expected created_by %s, got %v", createdBy, ns.CreatedBy)
		}
		if ns.CreatedAt.IsZero() {
			t.Error("expected non-zero created_at")
		}
	})

	t.Run("record exists after creation", func(t *testing.T) {
		var count int
		err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM namespaces WHERE id = $1", createNSID).Scan(&count)
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

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getNamespace := func(id string) (*Namespace, error) {
		var ns Namespace
		err := conn.QueryRow(ctx,
			`SELECT id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at
			 FROM namespaces WHERE id = $1`, id).Scan(
			&ns.ID, &ns.DisplayName, &ns.Active, &ns.MaxInstructors, &ns.MaxStudents, &ns.CreatedAt, &ns.CreatedBy, &ns.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &ns, nil
	}

	t.Run("found", func(t *testing.T) {
		ns, err := getNamespace(db.nsID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ns.ID != db.nsID {
			t.Errorf("expected id %s, got %s", db.nsID, ns.ID)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getNamespace("nonexistent-" + uuid.New().String())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

func TestIntegration_ListNamespaces(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	// Use a prefix to scope our listing query
	prefix := "ns-list-" + uuid.New().String()[:8]
	nsA := prefix + "-a"
	nsB := prefix + "-b"
	nsC := prefix + "-c"

	listNamespaces := func() ([]Namespace, error) {
		rows, err := conn.Query(ctx,
			`SELECT id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at
			 FROM namespaces WHERE id LIKE $1 ORDER BY id`, prefix+"%")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var namespaces []Namespace
		for rows.Next() {
			var ns Namespace
			if err := rows.Scan(&ns.ID, &ns.DisplayName, &ns.Active, &ns.MaxInstructors, &ns.MaxStudents, &ns.CreatedAt, &ns.CreatedBy, &ns.UpdatedAt); err != nil {
				return nil, err
			}
			namespaces = append(namespaces, ns)
		}
		return namespaces, rows.Err()
	}

	t.Run("empty result", func(t *testing.T) {
		results, err := listNamespaces()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected 0 namespaces, got %d", len(results))
		}
	})

	t.Run("multiple records ordered by id", func(t *testing.T) {
		db.createNamespace(ctx, t, nsB, "NS B")
		db.createNamespace(ctx, t, nsA, "NS A")
		db.createNamespace(ctx, t, nsC, "NS C")
		t.Cleanup(func() {
			_, _ = db.pool.Exec(ctx, "DELETE FROM namespaces WHERE id IN ($1, $2, $3)", nsA, nsB, nsC)
		})

		results, err := listNamespaces()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 3 {
			t.Fatalf("expected 3 namespaces, got %d", len(results))
		}
		if results[0].ID != nsA || results[1].ID != nsB || results[2].ID != nsC {
			t.Errorf("expected order %s, %s, %s, got %s, %s, %s", nsA, nsB, nsC, results[0].ID, results[1].ID, results[2].ID)
		}
	})
}

func TestIntegration_UpdateNamespace(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateNamespace := func(id string, params UpdateNamespaceParams) (*Namespace, error) {
		var ns Namespace
		err := conn.QueryRow(ctx,
			`UPDATE namespaces
			 SET display_name    = COALESCE($2, display_name),
			     active          = COALESCE($3, active),
			     max_instructors = COALESCE($4, max_instructors),
			     max_students    = COALESCE($5, max_students),
			     updated_at      = now()
			 WHERE id = $1
			 RETURNING id, display_name, active, max_instructors, max_students, created_at, created_by, updated_at`,
			id, params.DisplayName, params.Active, params.MaxInstructors, params.MaxStudents,
		).Scan(&ns.ID, &ns.DisplayName, &ns.Active, &ns.MaxInstructors, &ns.MaxStudents, &ns.CreatedAt, &ns.CreatedBy, &ns.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &ns, nil
	}

	t.Run("partial update display_name only", func(t *testing.T) {
		newName := "Updated Name"
		ns, err := updateNamespace(db.nsID, UpdateNamespaceParams{DisplayName: &newName})
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
		newName := "Whatever"
		_, err := updateNamespace("nonexistent-"+uuid.New().String(), UpdateNamespaceParams{DisplayName: &newName})
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Class CRUD Tests
// =============================================================================

func TestIntegration_CreateClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID

	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	t.Run("successful creation", func(t *testing.T) {
		desc := "A test class"
		var c Class
		err := conn.QueryRow(ctx,
			`INSERT INTO classes (namespace_id, name, description, created_by)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, namespace_id, name, description, created_by, created_at, updated_at`,
			nsID, "CS101", &desc, createdBy,
		).Scan(&c.ID, &c.NamespaceID, &c.Name, &c.Description, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
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

	t.Run("record exists after creation", func(t *testing.T) {
		var count int
		err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM classes WHERE namespace_id = $1", nsID).Scan(&count)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 record, got %d", count)
		}
	})
}

func TestIntegration_GetClass(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	// namespace scoped to db.nsID (was "test-ns-get-class"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getClass := func(id uuid.UUID) (*Class, error) {
		var c Class
		err := conn.QueryRow(ctx,
			`SELECT id, namespace_id, name, description, created_by, created_at, updated_at
			 FROM classes WHERE id = $1`, id).Scan(
			&c.ID, &c.NamespaceID, &c.Name, &c.Description, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &c, nil
	}

	t.Run("found", func(t *testing.T) {
		c, err := getClass(classID)
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
		_, err := getClass(uuid.New())
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
	// namespace scoped to db.nsID (was "test-ns-list-classes"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listClasses := func() ([]Class, error) {
		rows, err := conn.Query(ctx,
			`SELECT id, namespace_id, name, description, created_by, created_at, updated_at
			 FROM classes WHERE namespace_id = $1 ORDER BY created_at`, nsID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var classes []Class
		for rows.Next() {
			var c Class
			if err := rows.Scan(&c.ID, &c.NamespaceID, &c.Name, &c.Description, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
				return nil, err
			}
			classes = append(classes, c)
		}
		return classes, rows.Err()
	}

	t.Run("empty result", func(t *testing.T) {
		results, err := listClasses()
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

		results, err := listClasses()
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
	// namespace scoped to db.nsID (was "test-ns-update-class"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateClass := func(id uuid.UUID, params UpdateClassParams) (*Class, error) {
		var c Class
		err := conn.QueryRow(ctx,
			`UPDATE classes
			 SET name        = COALESCE($2, name),
			     description = COALESCE($3, description),
			     updated_at  = now()
			 WHERE id = $1
			 RETURNING id, namespace_id, name, description, created_by, created_at, updated_at`,
			id, params.Name, params.Description,
		).Scan(&c.ID, &c.NamespaceID, &c.Name, &c.Description, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &c, nil
	}

	t.Run("partial update name only", func(t *testing.T) {
		newName := "CS102"
		c, err := updateClass(classID, UpdateClassParams{Name: &newName})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if c.Name != "CS102" {
			t.Errorf("expected name CS102, got %s", c.Name)
		}
	})

	t.Run("not found", func(t *testing.T) {
		newName := "Whatever"
		_, err := updateClass(uuid.New(), UpdateClassParams{Name: &newName})
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
	// namespace scoped to db.nsID (was "test-ns-delete-class"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	deleteClass := func(id uuid.UUID) error {
		tag, err := conn.Exec(ctx, "DELETE FROM classes WHERE id = $1", id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}

	t.Run("successful deletion", func(t *testing.T) {
		if err := deleteClass(classID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM classes WHERE id = $1", classID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("class should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		err := deleteClass(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Section CRUD Tests
// =============================================================================

func TestIntegration_CreateSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	// namespace scoped to db.nsID (was "test-ns-create-section"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	t.Run("successful creation", func(t *testing.T) {
		semester := "Fall 2025"
		var sec Section
		err := conn.QueryRow(ctx,
			`INSERT INTO sections (namespace_id, class_id, name, semester, join_code)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`,
			nsID, classID, "Section A", &semester, "JOIN-CREATE",
		).Scan(&sec.ID, &sec.NamespaceID, &sec.ClassID, &sec.Name, &sec.Semester, &sec.JoinCode, &sec.Active, &sec.CreatedAt, &sec.UpdatedAt)
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
		if sec.JoinCode != "JOIN-CREATE" {
			t.Errorf("expected join_code JOIN-CREATE, got %s", sec.JoinCode)
		}
		if !sec.Active {
			t.Error("expected active to be true by default")
		}
		if sec.ID == uuid.Nil {
			t.Error("expected non-nil UUID id")
		}
	})

	t.Run("record exists after creation", func(t *testing.T) {
		var count int
		err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM sections WHERE class_id = $1", classID).Scan(&count)
		if err != nil {
			t.Fatalf("query: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 record, got %d", count)
		}
	})
}

func TestIntegration_GetSection(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	// namespace scoped to db.nsID (was "test-ns-get-section"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-GET")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getSection := func(id uuid.UUID) (*Section, error) {
		var sec Section
		err := conn.QueryRow(ctx,
			`SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
			 FROM sections WHERE id = $1`, id).Scan(
			&sec.ID, &sec.NamespaceID, &sec.ClassID, &sec.Name, &sec.Semester, &sec.JoinCode, &sec.Active, &sec.CreatedAt, &sec.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &sec, nil
	}

	t.Run("found", func(t *testing.T) {
		sec, err := getSection(sectionID)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.ID != sectionID {
			t.Errorf("expected id %s, got %s", sectionID, sec.ID)
		}
		if sec.Name != "Section A" {
			t.Errorf("expected name 'Section A', got %s", sec.Name)
		}
		if sec.JoinCode != "JOIN-GET" {
			t.Errorf("expected join_code JOIN-GET, got %s", sec.JoinCode)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getSection(uuid.New())
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
	// namespace scoped to db.nsID (was "test-ns-list-sections"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listSectionsByClass := func(cid uuid.UUID) ([]Section, error) {
		rows, err := conn.Query(ctx,
			`SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
			 FROM sections WHERE class_id = $1 ORDER BY created_at`, cid)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var sections []Section
		for rows.Next() {
			var sec Section
			if err := rows.Scan(&sec.ID, &sec.NamespaceID, &sec.ClassID, &sec.Name, &sec.Semester, &sec.JoinCode, &sec.Active, &sec.CreatedAt, &sec.UpdatedAt); err != nil {
				return nil, err
			}
			sections = append(sections, sec)
		}
		return sections, rows.Err()
	}

	t.Run("empty result", func(t *testing.T) {
		results, err := listSectionsByClass(uuid.New())
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

		results, err := listSectionsByClass(classID)
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
	// namespace scoped to db.nsID (was "test-ns-update-section"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-UPDATE")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	updateSection := func(id uuid.UUID, params UpdateSectionParams) (*Section, error) {
		var sec Section
		err := conn.QueryRow(ctx,
			`UPDATE sections
			 SET name       = COALESCE($2, name),
			     semester   = COALESCE($3, semester),
			     active     = COALESCE($4, active),
			     updated_at = now()
			 WHERE id = $1
			 RETURNING id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at`,
			id, params.Name, params.Semester, params.Active,
		).Scan(&sec.ID, &sec.NamespaceID, &sec.ClassID, &sec.Name, &sec.Semester, &sec.JoinCode, &sec.Active, &sec.CreatedAt, &sec.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &sec, nil
	}

	t.Run("partial update name only", func(t *testing.T) {
		newName := "Section B"
		sec, err := updateSection(sectionID, UpdateSectionParams{Name: &newName})
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
		newName := "Whatever"
		_, err := updateSection(uuid.New(), UpdateSectionParams{Name: &newName})
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
	// namespace scoped to db.nsID (was "test-ns-delete-section"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-DELETE")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	deleteSection := func(id uuid.UUID) error {
		tag, err := conn.Exec(ctx, "DELETE FROM sections WHERE id = $1", id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}

	t.Run("successful deletion", func(t *testing.T) {
		if err := deleteSection(sectionID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM sections WHERE id = $1", sectionID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("section should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		err := deleteSection(uuid.New())
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("expected ErrNotFound, got: %v", err)
		}
	})
}

// =============================================================================
// Membership CRUD Tests
// =============================================================================

func TestIntegration_CreateMembership(t *testing.T) {
	db := setupIntegrationDB(t)
	defer db.close()
	ctx := context.Background()

	nsID := db.nsID
	// namespace scoped to db.nsID (was "test-ns-create-membership"

	userID := uuid.New()
	db.createUser(ctx, t, userID, "member@test.com", "student", nsID)
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-MEMBER")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	createMembership := func(params CreateMembershipParams) (*SectionMembership, error) {
		var m SectionMembership
		err := conn.QueryRow(ctx,
			`INSERT INTO section_memberships (user_id, section_id, role)
			 VALUES ($1, $2, $3)
			 RETURNING id, user_id, section_id, role, joined_at`,
			params.UserID, params.SectionID, params.Role,
		).Scan(&m.ID, &m.UserID, &m.SectionID, &m.Role, &m.JoinedAt)
		if err != nil {
			return nil, HandleDuplicate(err)
		}
		return &m, nil
	}

	t.Run("successful creation", func(t *testing.T) {
		m, err := createMembership(CreateMembershipParams{UserID: userID, SectionID: sectionID, Role: "student"})
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
		_, err := createMembership(CreateMembershipParams{UserID: userID, SectionID: sectionID, Role: "student"})
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
	// namespace scoped to db.nsID (was "test-ns-joincode-get"
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "UNIQUE-JOIN-CODE")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	getSectionByJoinCode := func(code string) (*Section, error) {
		var sec Section
		err := conn.QueryRow(ctx,
			`SELECT id, namespace_id, class_id, name, semester, join_code, active, created_at, updated_at
			 FROM sections WHERE join_code = $1`, code).Scan(
			&sec.ID, &sec.NamespaceID, &sec.ClassID, &sec.Name, &sec.Semester, &sec.JoinCode, &sec.Active, &sec.CreatedAt, &sec.UpdatedAt)
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return &sec, nil
	}

	t.Run("found", func(t *testing.T) {
		sec, err := getSectionByJoinCode("UNIQUE-JOIN-CODE")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sec.ID != sectionID {
			t.Errorf("expected id %s, got %s", sectionID, sec.ID)
		}
		if sec.JoinCode != "UNIQUE-JOIN-CODE" {
			t.Errorf("expected join_code UNIQUE-JOIN-CODE, got %s", sec.JoinCode)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := getSectionByJoinCode("NONEXISTENT-CODE")
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
	// namespace scoped to db.nsID (was "test-ns-delete-membership"

	userID := uuid.New()
	db.createUser(ctx, t, userID, "member@test.com", "student", nsID)
	createdBy := uuid.New()
	db.createUser(ctx, t, createdBy, "creator@test.com", "instructor", nsID)
	classID := uuid.New()
	db.createClass(ctx, t, classID, nsID, "CS101", createdBy)
	sectionID := uuid.New()
	db.createSection(ctx, t, sectionID, nsID, classID, "Section A", "JOIN-DEL-MEM")
	db.createMembership(ctx, t, userID, sectionID, "student")

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	deleteMembership := func(secID, uid uuid.UUID) error {
		tag, err := conn.Exec(ctx,
			"DELETE FROM section_memberships WHERE section_id = $1 AND user_id = $2", secID, uid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}

	t.Run("successful deletion", func(t *testing.T) {
		if err := deleteMembership(sectionID, userID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var count int
		if err := conn.QueryRow(ctx, "SELECT COUNT(*) FROM section_memberships WHERE section_id = $1 AND user_id = $2", sectionID, userID).Scan(&count); err != nil {
			t.Fatalf("count query: %v", err)
		}
		if count != 0 {
			t.Error("membership should be deleted")
		}
	})

	t.Run("not found", func(t *testing.T) {
		err := deleteMembership(sectionID, uuid.New())
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
	// namespace scoped to db.nsID (was "test-ns-list-members"

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

	conn, err := db.pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	listMembers := func(secID uuid.UUID) ([]SectionMembership, error) {
		rows, err := conn.Query(ctx,
			`SELECT id, user_id, section_id, role, joined_at
			 FROM section_memberships WHERE section_id = $1 ORDER BY joined_at`, secID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var members []SectionMembership
		for rows.Next() {
			var m SectionMembership
			if err := rows.Scan(&m.ID, &m.UserID, &m.SectionID, &m.Role, &m.JoinedAt); err != nil {
				return nil, err
			}
			members = append(members, m)
		}
		return members, rows.Err()
	}

	t.Run("empty result", func(t *testing.T) {
		results, err := listMembers(uuid.New())
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

		results, err := listMembers(sectionID)
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
