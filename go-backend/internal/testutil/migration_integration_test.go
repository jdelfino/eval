// Integration tests for MigrationTestDB helper.
//
// Run with:
//
//	DATABASE_URL="postgres://eval:eval_local_password@localhost:5432/eval?sslmode=disable" \
//	  go test -v -race -count=1 ./internal/testutil/... -run TestIntegration
package testutil

import (
	"context"
	"testing"
	"time"
)

// TestIntegration_MigrationTestDB_SmokeTest validates:
//   - Temp DB creation and cleanup
//   - Forward migration (SetupMigrationTestDB to version 1)
//   - Schema existence check (problems table in v1)
//   - Forward migration (MigrateTo v2 adds problems.tags column)
//   - Backward migration (MigrateTo v1 removes problems.tags column)
func TestIntegration_MigrationTestDB_SmokeTest(t *testing.T) {
	// Migrate to version 1 (initial schema).
	db := SetupMigrationTestDB(t, 1)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Verify problems table exists at v1.
	var tableCount int
	row := db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name = 'problems'`)
	if err := row.Scan(&tableCount); err != nil {
		t.Fatalf("query problems table existence: %v", err)
	}
	if tableCount != 1 {
		t.Errorf("expected problems table to exist at v1, got count=%d", tableCount)
	}

	// Verify tags column does NOT exist at v1.
	var tagColCount int
	row = db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'problems' AND column_name = 'tags'`)
	if err := row.Scan(&tagColCount); err != nil {
		t.Fatalf("query tags column existence at v1: %v", err)
	}
	if tagColCount != 0 {
		t.Errorf("expected problems.tags to NOT exist at v1, got count=%d", tagColCount)
	}

	// Advance to version 2 (adds problems.tags).
	db.MigrateTo(t, 2)

	// Verify tags column now exists.
	row = db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'problems' AND column_name = 'tags'`)
	if err := row.Scan(&tagColCount); err != nil {
		t.Fatalf("query tags column existence at v2: %v", err)
	}
	if tagColCount != 1 {
		t.Errorf("expected problems.tags to exist at v2, got count=%d", tagColCount)
	}

	// Roll back to version 1 (removes problems.tags).
	db.MigrateTo(t, 1)

	// Verify tags column is gone again.
	row = db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'problems' AND column_name = 'tags'`)
	if err := row.Scan(&tagColCount); err != nil {
		t.Fatalf("query tags column after rollback: %v", err)
	}
	if tagColCount != 0 {
		t.Errorf("expected problems.tags to NOT exist after rollback to v1, got count=%d", tagColCount)
	}
}
