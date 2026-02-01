package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ListProblems retrieves all problems visible to the current user.
// If classID is non-nil, results are filtered to that class.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListProblems(ctx context.Context, classID *uuid.UUID) ([]Problem, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, namespace_id, title, description, starter_code, test_cases,
		       execution_settings, author_id, class_id, tags, solution, created_at, updated_at
		FROM problems`

	var args []any
	if classID != nil {
		query += " WHERE class_id = $1"
		args = append(args, *classID)
	}
	query += " ORDER BY created_at"

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		var p Problem
		if err := rows.Scan(
			&p.ID,
			&p.NamespaceID,
			&p.Title,
			&p.Description,
			&p.StarterCode,
			&p.TestCases,
			&p.ExecutionSettings,
			&p.AuthorID,
			&p.ClassID,
			&p.Tags,
			&p.Solution,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		problems = append(problems, p)
	}
	return problems, rows.Err()
}

// ListProblemsFiltered retrieves problems with extended filters.
func (s *Store) ListProblemsFiltered(ctx context.Context, filters ProblemFilters) ([]Problem, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, namespace_id, title, description, starter_code, test_cases,
		       execution_settings, author_id, class_id, tags, solution, created_at, updated_at
		FROM problems
		WHERE 1=1`

	var args []any
	argIdx := 1

	if filters.ClassID != nil {
		query += fmt.Sprintf(" AND class_id = $%d", argIdx)
		args = append(args, *filters.ClassID)
		argIdx++
	}

	if filters.AuthorID != nil {
		query += fmt.Sprintf(" AND author_id = $%d", argIdx)
		args = append(args, *filters.AuthorID)
		argIdx++
	}

	if len(filters.Tags) > 0 {
		query += fmt.Sprintf(" AND tags && $%d", argIdx)
		args = append(args, filters.Tags)
		argIdx++
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

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []Problem
	for rows.Next() {
		var p Problem
		if err := rows.Scan(
			&p.ID,
			&p.NamespaceID,
			&p.Title,
			&p.Description,
			&p.StarterCode,
			&p.TestCases,
			&p.ExecutionSettings,
			&p.AuthorID,
			&p.ClassID,
			&p.Tags,
			&p.Solution,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		problems = append(problems, p)
	}
	return problems, rows.Err()
}

// GetProblem retrieves a problem by its ID.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) GetProblem(ctx context.Context, id uuid.UUID) (*Problem, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		SELECT id, namespace_id, title, description, starter_code, test_cases,
		       execution_settings, author_id, class_id, tags, solution, created_at, updated_at
		FROM problems
		WHERE id = $1`

	var p Problem
	err = conn.QueryRow(ctx, query, id).Scan(
		&p.ID,
		&p.NamespaceID,
		&p.Title,
		&p.Description,
		&p.StarterCode,
		&p.TestCases,
		&p.ExecutionSettings,
		&p.AuthorID,
		&p.ClassID,
		&p.Tags,
		&p.Solution,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &p, nil
}

// CreateProblem creates a new problem and returns the created record.
func (s *Store) CreateProblem(ctx context.Context, params CreateProblemParams) (*Problem, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `
		INSERT INTO problems (namespace_id, title, description, starter_code, test_cases,
		                      execution_settings, author_id, class_id, tags, solution)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, namespace_id, title, description, starter_code, test_cases,
		          execution_settings, author_id, class_id, tags, solution, created_at, updated_at`

	var p Problem
	err = conn.QueryRow(ctx, query,
		params.NamespaceID,
		params.Title,
		params.Description,
		params.StarterCode,
		params.TestCases,
		params.ExecutionSettings,
		params.AuthorID,
		params.ClassID,
		params.Tags,
		params.Solution,
	).Scan(
		&p.ID,
		&p.NamespaceID,
		&p.Title,
		&p.Description,
		&p.StarterCode,
		&p.TestCases,
		&p.ExecutionSettings,
		&p.AuthorID,
		&p.ClassID,
		&p.Tags,
		&p.Solution,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

// UpdateProblem updates a problem's mutable fields and returns the updated record.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) UpdateProblem(ctx context.Context, id uuid.UUID, params UpdateProblemParams) (*Problem, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	// Build dynamic update query for fields that may or may not be provided.
	// COALESCE handles optional string fields; JSONB fields use explicit SET logic.
	query := `
		UPDATE problems
		SET title             = COALESCE($2, title),
		    description       = COALESCE($3, description),
		    starter_code      = COALESCE($4, starter_code),`

	args := []any{id, params.Title, params.Description, params.StarterCode}
	argIdx := 5

	// test_cases: if provided (non-nil), set it; otherwise keep current value
	if params.TestCases != nil {
		query += fmt.Sprintf("\n		    test_cases         = $%d,", argIdx)
		args = append(args, params.TestCases)
		argIdx++
	}

	// execution_settings: if provided (non-nil), set it; otherwise keep current value
	if params.ExecutionSettings != nil {
		query += fmt.Sprintf("\n		    execution_settings = $%d,", argIdx)
		args = append(args, params.ExecutionSettings)
		argIdx++
	}

	// class_id: if provided (non-nil), set it; otherwise keep current value
	if params.ClassID != nil {
		query += fmt.Sprintf("\n		    class_id           = $%d,", argIdx)
		args = append(args, *params.ClassID)
		argIdx++
	}

	// tags: if provided (non-nil), set it; otherwise keep current value
	if params.Tags != nil {
		query += fmt.Sprintf("\n		    tags               = $%d,", argIdx)
		args = append(args, params.Tags)
		argIdx++
	}

	// solution: if provided (non-nil), set it; otherwise keep current value
	if params.Solution != nil {
		query += fmt.Sprintf("\n		    solution           = $%d,", argIdx)
		args = append(args, *params.Solution)
		argIdx++ //nolint:ineffassign // keep argIdx consistent for future fields
	}

	query += `
		    updated_at        = now()
		WHERE id = $1
		RETURNING id, namespace_id, title, description, starter_code, test_cases,
		          execution_settings, author_id, class_id, tags, solution, created_at, updated_at`

	var p Problem
	err = conn.QueryRow(ctx, query, args...).Scan(
		&p.ID,
		&p.NamespaceID,
		&p.Title,
		&p.Description,
		&p.StarterCode,
		&p.TestCases,
		&p.ExecutionSettings,
		&p.AuthorID,
		&p.ClassID,
		&p.Tags,
		&p.Solution,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &p, nil
}

// DeleteProblem deletes a problem by its ID.
// Returns ErrNotFound if the problem does not exist.
func (s *Store) DeleteProblem(ctx context.Context, id uuid.UUID) error {
	conn, err := s.conn(ctx)
	if err != nil {
		return err
	}

	tag, err := conn.Exec(ctx, "DELETE FROM problems WHERE id = $1", id)
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
