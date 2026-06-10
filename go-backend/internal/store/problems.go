package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

const problemColumns = `id, namespace_id, title, description, starter_code, test_cases,
		       author_id, class_id, tags, solution, language, created_at, updated_at`

func scanProblem(row interface{ Scan(dest ...any) error }) (*Problem, error) {
	var p Problem
	err := row.Scan(
		&p.ID, &p.NamespaceID, &p.Title, &p.Description,
		&p.StarterCode, &p.TestCases,
		&p.AuthorID, &p.ClassID, &p.Tags, &p.Solution,
		&p.Language, &p.CreatedAt, &p.UpdatedAt,
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
		if filters.IncludePublic {
			// Return problems in this class OR classless (public) problems
			query += " AND (class_id = " + ac.Next(*filters.ClassID) + " OR class_id IS NULL)"
		} else {
			query += " AND class_id = " + ac.Next(*filters.ClassID)
		}
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
		p.TestCounts = countTestCases(p.TestCases)
		problems = append(problems, *p)
	}
	return problems, rows.Err()
}

// countTestCases parses a test_cases JSONB array and returns a TestCounts struct.
// Returns {0, 0} for nil or unparseable input.
// Uses a kind-only struct to avoid full case materialization.
func countTestCases(raw json.RawMessage) *TestCounts {
	counts := &TestCounts{}
	if len(raw) == 0 {
		return counts
	}
	var rows []struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		return counts
	}
	for _, r := range rows {
		switch r.Kind {
		case "io":
			counts.IO++
		case "pytest":
			counts.Pytest++
		}
	}
	return counts
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
		                      author_id, class_id, tags, solution, language)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING ` + problemColumns

	// Default to 'python' if language is not specified.
	language := params.Language
	if language == "" {
		language = "python"
	}

	p, err := scanProblem(s.q.QueryRow(ctx, query,
		params.NamespaceID, params.Title, params.Description, params.StarterCode,
		params.TestCases, params.AuthorID, params.ClassID,
		params.Tags, params.Solution, language,
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

	// language: if provided (non-nil), set it; otherwise keep current value
	if params.Language != nil {
		query += "\n		    language           = " + ac.Next(*params.Language) + ","
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

// GetPublicProblem retrieves a problem's public fields by ID, including class name.
// Returns ErrNotFound if the problem does not exist.
//
// The author's display_name is retrieved via the public_author_display_name()
// SECURITY DEFINER function (migration 023) so the query works under the
// public RLS context (app.role='public'), which has no SELECT policy on users.
// The function exposes display_name only — never email or other user columns.
func (s *Store) GetPublicProblem(ctx context.Context, id uuid.UUID) (*PublicProblem, error) {
	query := `SELECT p.id, p.title, p.description, p.starter_code, p.class_id,
	                 c.name AS class_name, p.tags,
	                 public_author_display_name(p.author_id) AS author_name,
	                 p.updated_at, p.language, p.test_cases
	          FROM problems p
	          LEFT JOIN classes c ON c.id = p.class_id
	          WHERE p.id = $1`
	row := s.q.QueryRow(ctx, query, id)
	var pp PublicProblem
	var tags []string
	var rawTestCases []byte
	err := row.Scan(
		&pp.ID, &pp.Title, &pp.Description, &pp.StarterCode, &pp.ClassID,
		&pp.ClassName, &tags, &pp.AuthorName, &pp.UpdatedAt, &pp.Language,
		&rawTestCases,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}
	if tags == nil {
		pp.Tags = []string{}
	} else {
		pp.Tags = tags
	}
	pp.TestCases = buildPublicTestCaseSummaries(rawTestCases)
	return &pp, nil
}

// buildPublicTestCaseSummaries converts raw test_cases JSONB into input-side-only
// PublicTestCaseSummary entries. It never includes expected_output, test_code,
// match_type, or attached file contents.
//
// io cases: Summary = first line of Input (empty string when no stdin).
// pytest cases: Summary = TargetPath; Name falls back to TargetPath when empty.
func buildPublicTestCaseSummaries(raw []byte) []PublicTestCaseSummary {
	if len(raw) == 0 {
		return []PublicTestCaseSummary{}
	}
	cases, err := UnmarshalIOTestCases(raw)
	if err != nil || len(cases) == 0 {
		return []PublicTestCaseSummary{}
	}
	summaries := make([]PublicTestCaseSummary, 0, len(cases))
	for _, tc := range cases {
		switch c := tc.(type) {
		case *IOTestCaseIO:
			summary := firstLine(c.Input)
			summaries = append(summaries, PublicTestCaseSummary{
				Kind:    "io",
				Name:    c.Name,
				Summary: summary,
			})
		case *IOTestCasePytest:
			name := c.Name
			if name == "" {
				name = c.TargetPath
			}
			summaries = append(summaries, PublicTestCaseSummary{
				Kind:    "pytest",
				Name:    name,
				Summary: c.TargetPath,
			})
		}
	}
	return summaries
}

// firstLine returns the first line of s, or the whole string if there is no newline.
func firstLine(s string) string {
	line, _, _ := strings.Cut(s, "\n")
	return line
}

// Compile-time check that Store implements ProblemRepository.
var _ ProblemRepository = (*Store)(nil)
