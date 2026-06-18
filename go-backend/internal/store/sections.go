package store

import (
	"context"

	"github.com/google/uuid"
)

// sectionColumns lists the base sections table columns (qualified-free) used by
// write-returning queries that operate on a single row without the pointer JOIN.
// Such rows have no derived current_problem_id (it stays nil).
const sectionColumns = `id, namespace_id, class_id, name, semester, join_code, active, current_session_id, created_at, updated_at`

// sectionReadColumns selects the section row plus the pointer session's problem
// id, derived via a LEFT JOIN on the pointer session (alias `cur`). It assumes
// the FROM clause aliases the sections table as `sec` and joins
// `LEFT JOIN sessions cur ON cur.id = sec.current_session_id`.
// NULLIF guards against sessions whose problem JSON has an empty-string id
// (e.g. a blank-session create path); '' is not a valid uuid and would otherwise
// raise 22P02 on the cast.
const sectionReadColumns = `sec.id, sec.namespace_id, sec.class_id, sec.name, sec.semester, sec.join_code, sec.active, sec.current_session_id, NULLIF(cur.problem->>'id', '')::uuid, sec.created_at, sec.updated_at`

// sectionReadFrom is the FROM/JOIN clause matching sectionReadColumns.
const sectionReadFrom = `FROM sections sec LEFT JOIN sessions cur ON cur.id = sec.current_session_id`

// scanSection scans a base sections row (no current_problem_id). CurrentProblemID
// is left nil.
func scanSection(row interface{ Scan(dest ...any) error }) (*Section, error) {
	var sec Section
	err := row.Scan(
		&sec.ID,
		&sec.NamespaceID,
		&sec.ClassID,
		&sec.Name,
		&sec.Semester,
		&sec.JoinCode,
		&sec.Active,
		&sec.CurrentSessionID,
		&sec.CreatedAt,
		&sec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &sec, nil
}

// scanSectionRead scans a section row produced by sectionReadColumns, including
// the derived current_problem_id.
func scanSectionRead(row interface{ Scan(dest ...any) error }) (*Section, error) {
	var sec Section
	err := row.Scan(
		&sec.ID,
		&sec.NamespaceID,
		&sec.ClassID,
		&sec.Name,
		&sec.Semester,
		&sec.JoinCode,
		&sec.Active,
		&sec.CurrentSessionID,
		&sec.CurrentProblemID,
		&sec.CreatedAt,
		&sec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &sec, nil
}

// ListSectionsByClass retrieves all sections for a given class.
// RLS policies filter results based on the user's role and namespace.
func (s *Store) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]Section, error) {
	query := "SELECT " + sectionReadColumns + " " + sectionReadFrom + " WHERE sec.class_id = $1 ORDER BY sec.created_at"

	rows, err := s.q.Query(ctx, query, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []Section
	for rows.Next() {
		sec, err := scanSectionRead(rows)
		if err != nil {
			return nil, err
		}
		sections = append(sections, *sec)
	}
	return sections, rows.Err()
}

// GetSection retrieves a section by its ID.
// Returns ErrNotFound if the section does not exist.
func (s *Store) GetSection(ctx context.Context, id uuid.UUID) (*Section, error) {
	query := "SELECT " + sectionReadColumns + " " + sectionReadFrom + " WHERE sec.id = $1"
	sec, err := scanSectionRead(s.q.QueryRow(ctx, query, id))
	if err != nil {
		return nil, HandleNotFound(err)
	}
	return sec, nil
}

// CreateSection creates a new section and returns the created record.
func (s *Store) CreateSection(ctx context.Context, params CreateSectionParams) (*Section, error) {
	query := `INSERT INTO sections (namespace_id, class_id, name, semester, join_code)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + sectionColumns

	sec, err := scanSection(s.q.QueryRow(ctx, query,
		params.NamespaceID, params.ClassID, params.Name, params.Semester, params.JoinCode,
	))
	if err != nil {
		return nil, err
	}
	return sec, nil
}

// UpdateSection updates a section's mutable fields and returns the updated record.
// Returns ErrNotFound if the section does not exist.
func (s *Store) UpdateSection(ctx context.Context, id uuid.UUID, params UpdateSectionParams) (*Section, error) {
	query := `UPDATE sections
		SET name = COALESCE($2, name), semester = COALESCE($3, semester),
		    active = COALESCE($4, active), updated_at = now()
		WHERE id = $1
		RETURNING ` + sectionColumns

	sec, err := scanSection(s.q.QueryRow(ctx, query, id, params.Name, params.Semester, params.Active))
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return nil, e
		}
		return nil, HandleNotFound(err)
	}
	return sec, nil
}

// DeleteSection deletes a section by its ID.
// Returns ErrNotFound if the section does not exist.
func (s *Store) DeleteSection(ctx context.Context, id uuid.UUID) error {
	tag, err := s.q.Exec(ctx, "DELETE FROM sections WHERE id = $1", id)
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

// ListMySections retrieves sections the user is enrolled in with class info.
func (s *Store) ListMySections(ctx context.Context, userID uuid.UUID) ([]MySectionInfo, error) {
	const query = `
		SELECT s.id, s.namespace_id, s.class_id, s.name, s.semester, s.join_code, s.active,
		       s.current_session_id, NULLIF(cur.problem->>'id', '')::uuid, s.created_at, s.updated_at, c.name
		FROM sections s
		JOIN section_memberships sm ON sm.section_id = s.id
		JOIN classes c ON c.id = s.class_id
		LEFT JOIN sessions cur ON cur.id = s.current_session_id
		WHERE sm.user_id = $1
		ORDER BY s.created_at`

	rows, err := s.q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []MySectionInfo
	for rows.Next() {
		var info MySectionInfo
		// Scans section columns + derived current_problem_id + class name; can't reuse scanSection.
		if err := rows.Scan(
			&info.Section.ID, &info.Section.NamespaceID, &info.Section.ClassID,
			&info.Section.Name, &info.Section.Semester, &info.Section.JoinCode,
			&info.Section.Active, &info.Section.CurrentSessionID, &info.Section.CurrentProblemID,
			&info.Section.CreatedAt, &info.Section.UpdatedAt,
			&info.ClassName,
		); err != nil {
			return nil, err
		}
		results = append(results, info)
	}
	return results, rows.Err()
}

// UpdateSectionJoinCode updates a section's join code.
// Returns ErrNotFound if the section does not exist.
func (s *Store) UpdateSectionJoinCode(ctx context.Context, id uuid.UUID, joinCode string) (*Section, error) {
	query := `UPDATE sections SET join_code = $2, updated_at = now()
		WHERE id = $1
		RETURNING ` + sectionColumns

	sec, err := scanSection(s.q.QueryRow(ctx, query, id, joinCode))
	if err != nil {
		if e := HandleForbidden(err); e != err {
			return nil, e
		}
		return nil, HandleNotFound(err)
	}
	return sec, nil
}

// SetSectionCurrentSession sets the section's current-session pointer to the
// given session (G4 section-pointer model). Returns ErrNotFound if the section
// does not exist.
func (s *Store) SetSectionCurrentSession(ctx context.Context, sectionID, sessionID uuid.UUID) error {
	tag, err := s.q.Exec(ctx,
		`UPDATE sections SET current_session_id = $2, updated_at = now() WHERE id = $1`,
		sectionID, sessionID)
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

// ClearSectionCurrentSession clears the section's current-session pointer
// (SET current_session_id = NULL). Returns ErrNotFound if the section does not
// exist.
//
// G4-R3 (staleness rule): this is the ONLY code path that clears the pointer.
// It is wired exclusively to DELETE /sections/{id}/current (the explicit,
// optional end-of-class action). It must NEVER be called automatically from any
// session create/end/delete path — a stale pointer is the correct late-join
// target and is left in place on purpose.
func (s *Store) ClearSectionCurrentSession(ctx context.Context, sectionID uuid.UUID) error {
	tag, err := s.q.Exec(ctx,
		`UPDATE sections SET current_session_id = NULL, updated_at = now() WHERE id = $1`,
		sectionID)
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

// Compile-time check that Store implements SectionRepository.
var _ SectionRepository = (*Store)(nil)
