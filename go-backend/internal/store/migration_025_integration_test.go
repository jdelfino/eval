// Integration tests for migration 025: sections.current_session_id pointer.
//
// Verifies:
//   - current_session_id exists, is nullable, and FKs to sessions after up
//   - the column is dropped after down (rollback to 024)
//
// These guard against migration syntax, rollback, and FK-definition errors in
// the G4 section-pointer model (G4-R3: pointer set/cleared explicitly, never
// auto-cleared).
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration025
package store

import (
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration025_Up verifies that current_session_id exists,
// is nullable, and has a foreign key referencing sessions(id) after the up
// migration.
func TestIntegration_Migration025_Up(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 25)

	// Column exists and is nullable.
	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'sections'
		  AND column_name = 'current_session_id'
		  AND is_nullable = 'YES'
		  AND data_type = 'uuid'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query column: %v", err)
	}
	if count != 1 {
		t.Errorf("expected nullable uuid column current_session_id, found %d", count)
	}

	// Foreign key to sessions exists.
	var fkCount int
	err = db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*)
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		JOIN information_schema.constraint_column_usage ccu
		  ON tc.constraint_name = ccu.constraint_name
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_name = 'sections'
		  AND kcu.column_name = 'current_session_id'
		  AND ccu.table_name = 'sessions'
	`).Scan(&fkCount)
	if err != nil {
		t.Fatalf("query fk: %v", err)
	}
	if fkCount != 1 {
		t.Errorf("expected current_session_id FK to sessions, found %d", fkCount)
	}
}

// TestIntegration_Migration025_Down verifies that rolling back migration 025
// removes the current_session_id column from sections.
func TestIntegration_Migration025_Down(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 25)

	// Roll back to migration 024.
	db.MigrateTo(t, 24)

	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'sections'
		  AND column_name = 'current_session_id'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query columns: %v", err)
	}
	if count != 0 {
		t.Errorf("expected current_session_id absent after down migration, found %d", count)
	}
}
