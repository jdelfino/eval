// Integration tests for migration 026: session_students.last_run_summary.
//
// Verifies:
//   - last_run_summary exists, is nullable, and is JSONB after up
//   - the column is dropped after down (rollback to 025)
//
// These guard against migration syntax and rollback errors for the G4 F8
// per-student run-summary column.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" go test ./internal/store/... -run TestIntegration_Migration026
package store

import (
	"testing"

	"github.com/jdelfino/eval/go-backend/internal/testutil"
)

// TestIntegration_Migration026_Up verifies that last_run_summary exists, is
// nullable, and is of type jsonb after the up migration.
func TestIntegration_Migration026_Up(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 26)

	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'session_students'
		  AND column_name = 'last_run_summary'
		  AND is_nullable = 'YES'
		  AND data_type = 'jsonb'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query column: %v", err)
	}
	if count != 1 {
		t.Errorf("expected nullable jsonb column last_run_summary, found %d", count)
	}
}

// TestIntegration_Migration026_Down verifies that rolling back migration 026
// removes the last_run_summary column from session_students.
func TestIntegration_Migration026_Down(t *testing.T) {
	t.Parallel()

	db := testutil.SetupMigrationTestDB(t, 26)

	// Roll back to migration 025.
	db.MigrateTo(t, 25)

	var count int
	err := db.Pool.QueryRow(t.Context(), `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_name = 'session_students'
		  AND column_name = 'last_run_summary'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query columns: %v", err)
	}
	if count != 0 {
		t.Errorf("expected last_run_summary absent after down migration, found %d", count)
	}
}
