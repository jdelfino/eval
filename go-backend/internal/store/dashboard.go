package store

import (
	"context"

	"github.com/google/uuid"
)

// InstructorDashboard returns classes with sections, student counts, and active session IDs
// for an instructor. Uses a single query that joins classes, sections, memberships, and sessions.
// RLS policies handle namespace filtering automatically.
// Classes without sections are included (LEFT JOIN on sections).
func (s *Store) InstructorDashboard(ctx context.Context, userID uuid.UUID) ([]DashboardClass, error) {
	const query = `
		SELECT
			c.id   AS class_id,
			c.name AS class_name,
			sec.id   AS section_id,
			sec.name AS section_name,
			sec.join_code AS section_join_code,
			sec.semester AS section_semester,
			COALESCE(sm.student_count, 0) AS student_count,
			sess.active_id AS active_session_id
		FROM classes c
		LEFT JOIN sections sec ON sec.class_id = c.id
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS student_count
			FROM section_memberships
			WHERE section_id = sec.id AND role = 'student'
		) sm ON true
		LEFT JOIN LATERAL (
			SELECT id AS active_id
			FROM sessions
			WHERE section_id = sec.id AND status = 'active'
			ORDER BY created_at DESC
			LIMIT 1
		) sess ON true
		WHERE c.created_by = $1
		   OR sec.id IN (
		       SELECT section_id FROM section_memberships
		       WHERE user_id = $1 AND role = 'instructor'
		   )
		ORDER BY c.name, sec.name`

	rows, err := s.q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	classMap := make(map[uuid.UUID]*DashboardClass)
	var classOrder []uuid.UUID

	for rows.Next() {
		var (
			classID         uuid.UUID
			className       string
			sectionID       *uuid.UUID // nullable for classes without sections
			sectionName     *string    // nullable for classes without sections
			sectionJoinCode *string    // nullable for classes without sections
			sectionSemester *string    // nullable
			studentCount    int
			activeSessionID *uuid.UUID // nullable if no active session
		)
		if err := rows.Scan(&classID, &className, &sectionID, &sectionName, &sectionJoinCode, &sectionSemester, &studentCount, &activeSessionID); err != nil {
			return nil, err
		}

		dc, exists := classMap[classID]
		if !exists {
			dc = &DashboardClass{
				ID:       classID,
				Name:     className,
				Sections: []DashboardSection{},
			}
			classMap[classID] = dc
			classOrder = append(classOrder, classID)
		}

		// Only add section if one exists (sectionID is non-null)
		if sectionID != nil && sectionName != nil && sectionJoinCode != nil {
			dc.Sections = append(dc.Sections, DashboardSection{
				ID:              *sectionID,
				Name:            *sectionName,
				JoinCode:        *sectionJoinCode,
				Semester:        sectionSemester,
				StudentCount:    studentCount,
				ActiveSessionID: activeSessionID,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]DashboardClass, 0, len(classOrder))
	for _, id := range classOrder {
		result = append(result, *classMap[id])
	}
	return result, nil
}
