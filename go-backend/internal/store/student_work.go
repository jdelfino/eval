package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

const studentWorkColumns = `id, namespace_id, user_id, problem_id, section_id, code, execution_settings, test_cases, created_at, last_update`

func scanStudentWork(row interface{ Scan(dest ...any) error }) (*StudentWork, error) {
	var sw StudentWork
	err := row.Scan(
		&sw.ID, &sw.NamespaceID, &sw.UserID, &sw.ProblemID, &sw.SectionID,
		&sw.Code, &sw.ExecutionSettings, &sw.TestCases, &sw.CreatedAt, &sw.LastUpdate,
	)
	if err != nil {
		return nil, err
	}
	return &sw, nil
}

func scanStudentWorkWithProblem(row interface{ Scan(dest ...any) error }) (*StudentWorkWithProblem, error) {
	var swp StudentWorkWithProblem
	err := row.Scan(
		// StudentWork fields
		&swp.ID, &swp.NamespaceID, &swp.UserID, &swp.ProblemID, &swp.SectionID,
		&swp.Code, &swp.ExecutionSettings, &swp.TestCases, &swp.CreatedAt, &swp.LastUpdate,
		// Problem fields
		&swp.Problem.ID, &swp.Problem.NamespaceID, &swp.Problem.Title, &swp.Problem.Description,
		&swp.Problem.StarterCode, &swp.Problem.TestCases, &swp.Problem.ExecutionSettings,
		&swp.Problem.AuthorID, &swp.Problem.ClassID, &swp.Problem.Tags, &swp.Problem.Solution,
		&swp.Problem.Language, &swp.Problem.CreatedAt, &swp.Problem.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &swp, nil
}

// GetOrCreateStudentWork gets or creates student work for a (user, problem, section) triple.
// Uses INSERT ON CONFLICT DO NOTHING, then SELECT to return the record.
func (s *Store) GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*StudentWork, error) {
	// Insert with ON CONFLICT DO NOTHING (idempotent)
	insertQuery := `INSERT INTO student_work (namespace_id, user_id, problem_id, section_id, code, execution_settings)
		VALUES ($1, $2, $3, $4, '', '{}')
		ON CONFLICT (user_id, problem_id, section_id) DO NOTHING`

	_, err := s.q.Exec(ctx, insertQuery, namespaceID, userID, problemID, sectionID)
	if err != nil {
		return nil, err
	}

	// Now SELECT to get the record (whether just inserted or already existed)
	selectQuery := `SELECT ` + studentWorkColumns + `
		FROM student_work
		WHERE user_id = $1 AND problem_id = $2 AND section_id = $3`

	sw, err := scanStudentWork(s.q.QueryRow(ctx, selectQuery, userID, problemID, sectionID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sw, nil
}

// UpdateStudentWork updates a student work's mutable fields.
// Returns ErrNotFound if the student work does not exist.
func (s *Store) UpdateStudentWork(ctx context.Context, id uuid.UUID, params UpdateStudentWorkParams) (*StudentWork, error) {
	query := `UPDATE student_work SET last_update = now()`
	ac := newArgCounter(2, id)

	if params.Code != nil {
		query += ", code = " + ac.Next(*params.Code)
	}
	if params.ExecutionSettings != nil {
		query += ", execution_settings = " + ac.Next(params.ExecutionSettings)
	}
	if params.TestCases != nil {
		query += ", test_cases = " + ac.Next(params.TestCases)
	}

	query += " WHERE id = $1 RETURNING " + studentWorkColumns

	sw, err := scanStudentWork(s.q.QueryRow(ctx, query, ac.args...))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sw, nil
}

// GetStudentWork retrieves student work by ID with problem details.
// Returns ErrNotFound if the student work does not exist.
func (s *Store) GetStudentWork(ctx context.Context, id uuid.UUID) (*StudentWorkWithProblem, error) {
	query := `SELECT
		sw.id, sw.namespace_id, sw.user_id, sw.problem_id, sw.section_id,
		sw.code, sw.execution_settings, sw.test_cases, sw.created_at, sw.last_update,
		p.id, p.namespace_id, p.title, p.description, p.starter_code, p.test_cases, p.execution_settings,
		p.author_id, p.class_id, p.tags, p.solution, p.language, p.created_at, p.updated_at
		FROM student_work sw
		JOIN problems p ON sw.problem_id = p.id
		WHERE sw.id = $1`

	swp, err := scanStudentWorkWithProblem(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return swp, nil
}

// GetStudentWorkByProblem retrieves student work by (user, problem, section).
// Returns ErrNotFound if the student work does not exist.
func (s *Store) GetStudentWorkByProblem(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*StudentWork, error) {
	query := `SELECT ` + studentWorkColumns + `
		FROM student_work
		WHERE user_id = $1 AND problem_id = $2 AND section_id = $3`

	sw, err := scanStudentWork(s.q.QueryRow(ctx, query, userID, problemID, sectionID))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sw, nil
}

// ListStudentWorkBySession retrieves all student work linked to a session.
func (s *Store) ListStudentWorkBySession(ctx context.Context, sessionID uuid.UUID) ([]StudentWork, error) {
	query := `SELECT sw.id, sw.namespace_id, sw.user_id, sw.problem_id, sw.section_id, sw.code, sw.execution_settings, sw.test_cases, sw.created_at, sw.last_update
		FROM student_work sw
		JOIN session_students ss ON ss.student_work_id = sw.id
		WHERE ss.session_id = $1
		ORDER BY sw.last_update DESC`

	rows, err := s.q.Query(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var works []StudentWork
	for rows.Next() {
		sw, err := scanStudentWork(rows)
		if err != nil {
			return nil, err
		}
		works = append(works, *sw)
	}
	return works, rows.Err()
}

// ListStudentProgress returns a progress summary for every student in a section.
// For each student, it reports how many problems they have started and the total
// number of problems published to the section, along with their last-active time.
func (s *Store) ListStudentProgress(ctx context.Context, sectionID uuid.UUID) ([]StudentProgress, error) {
	query := `SELECT
		u.id,
		COALESCE(u.display_name, u.email) AS display_name,
		u.email,
		COUNT(sw.id) AS problems_started,
		(SELECT COUNT(*) FROM section_problems WHERE section_id = $1) AS total_problems,
		MAX(sw.last_update) AS last_active
		FROM section_memberships sm
		JOIN users u ON u.id = sm.user_id
		LEFT JOIN student_work sw ON sw.user_id = sm.user_id AND sw.section_id = $1
		WHERE sm.section_id = $1 AND sm.role = 'student'
		GROUP BY u.id, u.display_name, u.email, sm.joined_at
		ORDER BY COALESCE(MAX(sw.last_update), sm.joined_at) DESC`

	rows, err := s.q.Query(ctx, query, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []StudentProgress
	for rows.Next() {
		var p StudentProgress
		if err := rows.Scan(
			&p.UserID,
			&p.DisplayName,
			&p.Email,
			&p.ProblemsStarted,
			&p.TotalProblems,
			&p.LastActive,
		); err != nil {
			return nil, err
		}
		results = append(results, p)
	}
	return results, rows.Err()
}

// ListStudentWorkForReview returns all problems published to a section along with the
// given student's work (if any) for each problem.
func (s *Store) ListStudentWorkForReview(ctx context.Context, sectionID, studentUserID uuid.UUID) ([]StudentWorkSummary, error) {
	query := `SELECT
		` + prefixCols("p", problemColumns) + `,
		sp.published_at,
		sw.id, sw.namespace_id, sw.user_id, sw.problem_id, sw.section_id,
		sw.code, sw.execution_settings, sw.test_cases, sw.created_at, sw.last_update
		FROM section_problems sp
		JOIN problems p ON p.id = sp.problem_id
		LEFT JOIN student_work sw ON sw.problem_id = sp.problem_id
			AND sw.section_id = sp.section_id
			AND sw.user_id = $2
		WHERE sp.section_id = $1
		ORDER BY sp.published_at DESC`

	rows, err := s.q.Query(ctx, query, sectionID, studentUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []StudentWorkSummary
	for rows.Next() {
		var summary StudentWorkSummary
		var workID *uuid.UUID
		var workNamespaceID *string
		var workUserID *uuid.UUID
		var workProblemID *uuid.UUID
		var workSectionID *uuid.UUID
		var workCode *string
		var workExecutionSettings []byte
		var workTestCases []byte
		var workCreatedAt *time.Time
		var workLastUpdate *time.Time

		if err := rows.Scan(
			// Problem fields
			&summary.Problem.ID, &summary.Problem.NamespaceID, &summary.Problem.Title, &summary.Problem.Description,
			&summary.Problem.StarterCode, &summary.Problem.TestCases, &summary.Problem.ExecutionSettings,
			&summary.Problem.AuthorID, &summary.Problem.ClassID, &summary.Problem.Tags, &summary.Problem.Solution,
			&summary.Problem.Language, &summary.Problem.CreatedAt, &summary.Problem.UpdatedAt,
			// SectionProblem fields
			&summary.PublishedAt,
			// StudentWork fields (nullable)
			&workID, &workNamespaceID, &workUserID, &workProblemID, &workSectionID,
			&workCode, &workExecutionSettings, &workTestCases, &workCreatedAt, &workLastUpdate,
		); err != nil {
			return nil, err
		}

		if workID != nil {
			summary.StudentWork = &StudentWork{
				ID:          *workID,
				NamespaceID: *workNamespaceID,
				UserID:      *workUserID,
				ProblemID:   *workProblemID,
				SectionID:   *workSectionID,
				Code:        *workCode,
			}
			if workExecutionSettings != nil {
				summary.StudentWork.ExecutionSettings = workExecutionSettings
			}
			if workTestCases != nil {
				summary.StudentWork.TestCases = workTestCases
			}
			if workCreatedAt != nil {
				summary.StudentWork.CreatedAt = *workCreatedAt
			}
			if workLastUpdate != nil {
				summary.StudentWork.LastUpdate = *workLastUpdate
			}
		}

		results = append(results, summary)
	}
	return results, rows.Err()
}

// Compile-time check that Store implements StudentWorkRepository.
var _ StudentWorkRepository = (*Store)(nil)
