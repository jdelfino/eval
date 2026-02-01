package store

import (
	"context"

	"github.com/google/uuid"
)

// InstructorDashboard returns classes with sections, student counts, and active session IDs
// for an instructor. Uses a single query that joins classes, sections, memberships, and sessions.
// RLS policies handle namespace filtering automatically.
func (s *Store) InstructorDashboard(ctx context.Context, userID uuid.UUID) ([]DashboardClass, error) {
	const query = `
		SELECT
			c.id   AS class_id,
			c.name AS class_name,
			sec.id   AS section_id,
			sec.name AS section_name,
			COALESCE(sm.student_count, 0) AS student_count,
			COALESCE(sess.active_ids, ARRAY[]::uuid[]) AS active_session_ids
		FROM classes c
		JOIN sections sec ON sec.class_id = c.id
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS student_count
			FROM section_memberships
			WHERE section_id = sec.id AND role = 'student'
		) sm ON true
		LEFT JOIN LATERAL (
			SELECT ARRAY_AGG(id) AS active_ids
			FROM sessions
			WHERE section_id = sec.id AND status = 'active'
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
			classID          uuid.UUID
			className        string
			sectionID        uuid.UUID
			sectionName      string
			studentCount     int
			activeSessionIDs []uuid.UUID
		)
		if err := rows.Scan(&classID, &className, &sectionID, &sectionName, &studentCount, &activeSessionIDs); err != nil {
			return nil, err
		}

		if activeSessionIDs == nil {
			activeSessionIDs = []uuid.UUID{}
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

		dc.Sections = append(dc.Sections, DashboardSection{
			ID:               sectionID,
			Name:             sectionName,
			StudentCount:     studentCount,
			ActiveSessionIDs: activeSessionIDs,
		})
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
