package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

const sectionProblemColumns = `id, section_id, problem_id, published_by, show_solution, published_at`

func scanSectionProblem(row interface{ Scan(dest ...any) error }) (*SectionProblem, error) {
	var sp SectionProblem
	err := row.Scan(&sp.ID, &sp.SectionID, &sp.ProblemID, &sp.PublishedBy, &sp.ShowSolution, &sp.PublishedAt)
	if err != nil {
		return nil, err
	}
	return &sp, nil
}

func scanPublishedProblemWithStatus(row interface{ Scan(dest ...any) error }) (*PublishedProblemWithStatus, error) {
	var p PublishedProblemWithStatus
	var workID *uuid.UUID
	var workNamespaceID *string
	var workUserID *uuid.UUID
	var workProblemID *uuid.UUID
	var workSectionID *uuid.UUID
	var workCode *string
	var workCreatedAt *time.Time
	var workLastUpdate *time.Time

	err := row.Scan(
		// SectionProblem fields
		&p.ID, &p.SectionID, &p.ProblemID, &p.PublishedBy, &p.ShowSolution, &p.PublishedAt,
		// Problem fields
		&p.Problem.ID, &p.Problem.NamespaceID, &p.Problem.Title, &p.Problem.Description,
		&p.Problem.StarterCode, &p.Problem.TestCases,
		&p.Problem.AuthorID, &p.Problem.ClassID, &p.Problem.Tags, &p.Problem.Solution,
		&p.Problem.Language, &p.Problem.CreatedAt, &p.Problem.UpdatedAt,
		// StudentWork fields (nullable)
		&workID, &workNamespaceID, &workUserID, &workProblemID, &workSectionID,
		&workCode, &workCreatedAt, &workLastUpdate,
	)
	if err != nil {
		return nil, err
	}

	// If student_work exists, populate it
	if workID != nil {
		p.StudentWork = &StudentWork{
			ID:          *workID,
			NamespaceID: *workNamespaceID,
			UserID:      *workUserID,
			ProblemID:   *workProblemID,
			SectionID:   *workSectionID,
			Code:        *workCode,
		}
		if workCreatedAt != nil {
			p.StudentWork.CreatedAt = *workCreatedAt
		}
		if workLastUpdate != nil {
			p.StudentWork.LastUpdate = *workLastUpdate
		}
	}

	return &p, nil
}

// ListSectionProblems retrieves all problems published to a section with student work status.
func (s *Store) ListSectionProblems(ctx context.Context, sectionID, userID uuid.UUID) ([]PublishedProblemWithStatus, error) {
	query := `SELECT
		sp.id, sp.section_id, sp.problem_id, sp.published_by, sp.show_solution, sp.published_at,
		p.id, p.namespace_id, p.title, p.description, p.starter_code, p.test_cases,
		p.author_id, p.class_id, p.tags, p.solution, p.language, p.created_at, p.updated_at,
		sw.id, sw.namespace_id, sw.user_id, sw.problem_id, sw.section_id,
		sw.code, sw.created_at, sw.last_update
		FROM section_problems sp
		LEFT JOIN problems p ON sp.problem_id = p.id
		LEFT JOIN student_work sw ON sw.problem_id = sp.problem_id
			AND sw.section_id = sp.section_id
			AND sw.user_id = $2
		WHERE sp.section_id = $1
		ORDER BY sp.published_at DESC`

	rows, err := s.q.Query(ctx, query, sectionID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []PublishedProblemWithStatus
	for rows.Next() {
		p, err := scanPublishedProblemWithStatus(rows)
		if err != nil {
			return nil, err
		}
		problems = append(problems, *p)
	}
	return problems, rows.Err()
}

// CreateSectionProblem publishes a problem to a section.
func (s *Store) CreateSectionProblem(ctx context.Context, params CreateSectionProblemParams) (*SectionProblem, error) {
	query := `INSERT INTO section_problems (section_id, problem_id, published_by, show_solution)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + sectionProblemColumns

	sp, err := scanSectionProblem(s.q.QueryRow(ctx, query,
		params.SectionID, params.ProblemID, params.PublishedBy, params.ShowSolution,
	))
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return nil, e
		}
		return nil, HandleDuplicate(err)
	}
	return sp, nil
}

// EnsureSectionProblem idempotently ensures a section_problems record exists for the given
// (section, problem) pair. Uses INSERT ON CONFLICT DO NOTHING so it is safe to call even
// when the problem is already published to the section.
func (s *Store) EnsureSectionProblem(ctx context.Context, params CreateSectionProblemParams) error {
	query := `INSERT INTO section_problems (section_id, problem_id, published_by, show_solution)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (section_id, problem_id) DO NOTHING`
	_, err := s.q.Exec(ctx, query, params.SectionID, params.ProblemID, params.PublishedBy, params.ShowSolution)
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return e
		}
		return err
	}
	return nil
}

// UpdateSectionProblem updates a section problem's mutable fields.
func (s *Store) UpdateSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID, params UpdateSectionProblemParams) (*SectionProblem, error) {
	ac := newArgCounter(3, sectionID, problemID)

	setClauses := ""
	if params.ShowSolution != nil {
		setClauses += "show_solution = " + ac.Next(*params.ShowSolution)
	}

	if setClauses == "" {
		// Nothing to update — just fetch current row.
		query := `SELECT ` + sectionProblemColumns + ` FROM section_problems WHERE section_id = $1 AND problem_id = $2`
		sp, err := scanSectionProblem(s.q.QueryRow(ctx, query, sectionID, problemID))
		if err != nil {
			return nil, HandleNotFound(err)
		}
		return sp, nil
	}

	query := `UPDATE section_problems SET ` + setClauses +
		` WHERE section_id = $1 AND problem_id = $2 RETURNING ` + sectionProblemColumns

	sp, err := scanSectionProblem(s.q.QueryRow(ctx, query, ac.args...))
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return nil, e
		}
		return nil, HandleNotFound(err)
	}
	return sp, nil
}

// DeleteSectionProblem removes a problem from a section.
func (s *Store) DeleteSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) error {
	tag, err := s.q.Exec(ctx, "DELETE FROM section_problems WHERE section_id = $1 AND problem_id = $2", sectionID, problemID)
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return e
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetSectionProblem retrieves a single section_problems row by section and problem IDs.
// Returns ErrNotFound if the problem is not published to the section.
func (s *Store) GetSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*SectionProblem, error) {
	query := `SELECT ` + sectionProblemColumns + ` FROM section_problems WHERE section_id = $1 AND problem_id = $2`
	sp, err := scanSectionProblem(s.q.QueryRow(ctx, query, sectionID, problemID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sp, nil
}

// ListSectionsForProblem retrieves all sections where a problem is published.
func (s *Store) ListSectionsForProblem(ctx context.Context, problemID uuid.UUID) ([]SectionProblem, error) {
	query := "SELECT " + sectionProblemColumns + " FROM section_problems WHERE problem_id = $1 ORDER BY published_at DESC"

	rows, err := s.q.Query(ctx, query, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []SectionProblem
	for rows.Next() {
		sp, err := scanSectionProblem(rows)
		if err != nil {
			return nil, err
		}
		sections = append(sections, *sp)
	}
	return sections, rows.Err()
}

// Compile-time check that Store implements SectionProblemRepository.
var _ SectionProblemRepository = (*Store)(nil)
