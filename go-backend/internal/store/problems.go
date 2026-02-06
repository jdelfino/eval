package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

const problemColumns = `id, namespace_id, title, description, starter_code, test_cases,
		       execution_settings, author_id, class_id, tags, solution, created_at, updated_at`

func scanProblem(row interface{ Scan(dest ...any) error }) (*Problem, error) {
	var p Problem
	err := row.Scan(
		&p.ID, &p.NamespaceID, &p.Title, &p.Description,
		&p.StarterCode, &p.TestCases, &p.ExecutionSettings,
		&p.AuthorID, &p.ClassID, &p.Tags, &p.Solution,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ListProblems retrieves all problems visible to the current user.
// If classID is non-nil, results are filtered to that class.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListProblems(ctx context.Context, classID *uuid.UUID) ([]Problem, error) {
	query := "SELECT " + problemColumns + " FROM problems"

	var args []any
	if classID != nil {
		query += " WHERE class_id = $1"
		args = append(args, *classID)
	}
	query += " ORDER BY created_at"

	rows, err := s.q.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		p, err := scanProblem(rows)
		if err != nil {
			return nil, err
		}
		problems = append(problems, *p)
	}
	return problems, rows.Err()
}

// ListProblemsFiltered retrieves problems with extended filters.
func (s *Store) ListProblemsFiltered(ctx context.Context, filters ProblemFilters) ([]Problem, error) {
	query := "SELECT " + problemColumns + " FROM problems WHERE 1=1"

	ac := newArgCounter(1)

	if filters.ClassID != nil {
		query += " AND class_id = " + ac.Next(*filters.ClassID)
	}

	if filters.AuthorID != nil {
		query += " AND author_id = " + ac.Next(*filters.AuthorID)
	}

	if len(filters.Tags) > 0 {
		query += " AND tags && " + ac.Next(filters.Tags)
	}

	if filters.PublicOnly {
		query += " AND class_id IS NULL"
	}

	// Sorting
	sortBy := "created_at"
	switch filters.SortBy {
	case "title":
		sortBy = "title"
	case "updated_at":
		sortBy = "updated_at"
	}
	sortOrder := "ASC"
	if filters.SortOrder == "desc" {
		sortOrder = "DESC"
	}
	query += fmt.Sprintf(" ORDER BY %s %s", sortBy, sortOrder)

	rows, err := s.q.Query(ctx, query, ac.args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		p, err := scanProblem(rows)
		if err != nil {
			return nil, err
		}
		problems = append(problems, *p)
	}
	return problems, rows.Err()
}

// GetProblem retrieves a problem by its ID.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) GetProblem(ctx context.Context, id uuid.UUID) (*Problem, error) {
	query := "SELECT " + problemColumns + " FROM problems WHERE id = $1"
	p, err := scanProblem(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return p, nil
}

// CreateProblem creates a new problem and returns the created record.
func (s *Store) CreateProblem(ctx context.Context, params CreateProblemParams) (*Problem, error) {
	query := `INSERT INTO problems (namespace_id, title, description, starter_code, test_cases,
		                      execution_settings, author_id, class_id, tags, solution)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING ` + problemColumns

	p, err := scanProblem(s.q.QueryRow(ctx, query,
		params.NamespaceID, params.Title, params.Description, params.StarterCode,
		params.TestCases, params.ExecutionSettings, params.AuthorID, params.ClassID,
		params.Tags, params.Solution,
	))
	if err != nil {
		return nil, err
	}
	return p, nil
}

// UpdateProblem updates a problem's mutable fields and returns the updated record.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) UpdateProblem(ctx context.Context, id uuid.UUID, params UpdateProblemParams) (*Problem, error) {
	// Build dynamic update query for fields that may or may not be provided.
	// COALESCE handles optional string fields; JSONB fields use explicit SET logic.
	query := `
		UPDATE problems
		SET title             = COALESCE($2, title),
		    description       = COALESCE($3, description),
		    starter_code      = COALESCE($4, starter_code),`

	ac := newArgCounter(5, id, params.Title, params.Description, params.StarterCode)

	// test_cases: if provided (non-nil), set it; otherwise keep current value
	if params.TestCases != nil {
		query += "\n		    test_cases         = " + ac.Next(params.TestCases) + ","
	}

	// execution_settings: if provided (non-nil), set it; otherwise keep current value
	if params.ExecutionSettings != nil {
		query += "\n		    execution_settings = " + ac.Next(params.ExecutionSettings) + ","
	}

	// class_id: if provided (non-nil), set it; otherwise keep current value
	if params.ClassID != nil {
		query += "\n		    class_id           = " + ac.Next(*params.ClassID) + ","
	}

	// tags: if provided (non-nil), set it; otherwise keep current value
	if params.Tags != nil {
		query += "\n		    tags               = " + ac.Next(params.Tags) + ","
	}

	// solution: if provided (non-nil), set it; otherwise keep current value
	if params.Solution != nil {
		query += "\n		    solution           = " + ac.Next(*params.Solution) + ","
	}

	query += `
		    updated_at        = now()
		WHERE id = $1
		RETURNING ` + problemColumns

	p, err := scanProblem(s.q.QueryRow(ctx, query, ac.args...))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return p, nil
}

// DeleteProblem deletes a problem by its ID.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) DeleteProblem(ctx context.Context, id uuid.UUID) error {
	tag, err := s.q.Exec(ctx, "DELETE FROM problems WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Compile-time check that Store implements ProblemRepository.
var _ ProblemRepository = (*Store)(nil)
