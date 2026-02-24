package store

import (
	"context"

	"github.com/google/uuid"
)

const studentWorkColumns = `id, namespace_id, user_id, problem_id, section_id, code, execution_settings, created_at, last_update`

func scanStudentWork(row interface{ Scan(dest ...any) error }) (*StudentWork, error) {
	var sw StudentWork
	err := row.Scan(
		&sw.ID, &sw.NamespaceID, &sw.UserID, &sw.ProblemID, &sw.SectionID,
		&sw.Code, &sw.ExecutionSettings, &sw.CreatedAt, &sw.LastUpdate,
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
		&swp.Code, &swp.ExecutionSettings, &swp.CreatedAt, &swp.LastUpdate,
		// Problem fields
		&swp.Problem.ID, &swp.Problem.NamespaceID, &swp.Problem.Title, &swp.Problem.Description,
		&swp.Problem.StarterCode, &swp.Problem.TestCases, &swp.Problem.ExecutionSettings,
		&swp.Problem.AuthorID, &swp.Problem.ClassID, &swp.Problem.Tags, &swp.Problem.Solution,
		&swp.Problem.CreatedAt, &swp.Problem.UpdatedAt,
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
		sw.code, sw.execution_settings, sw.created_at, sw.last_update,
		p.id, p.namespace_id, p.title, p.description, p.starter_code, p.test_cases, p.execution_settings,
		p.author_id, p.class_id, p.tags, p.solution, p.created_at, p.updated_at
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
	query := `SELECT sw.id, sw.namespace_id, sw.user_id, sw.problem_id, sw.section_id, sw.code, sw.execution_settings, sw.created_at, sw.last_update
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

// Compile-time check that Store implements StudentWorkRepository.
var _ StudentWorkRepository = (*Store)(nil)
