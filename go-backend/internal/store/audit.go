package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ListAuditLogs retrieves audit log entries with optional filters.
func (s *Store) ListAuditLogs(ctx context.Context, filters AuditLogFilters) ([]AuditLog, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	query := `SELECT id, namespace_id, action, actor_id, target_id, target_type, details, created_at
		FROM audit_logs WHERE 1=1`
	args := []any{}
	argIdx := 1

	if filters.Action != nil {
		query += fmt.Sprintf(" AND action = $%d", argIdx)
		args = append(args, *filters.Action)
		argIdx++
	}
	if filters.ActorID != nil {
		query += fmt.Sprintf(" AND actor_id = $%d", argIdx)
		args = append(args, *filters.ActorID)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	if filters.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIdx)
		args = append(args, filters.Limit)
		argIdx++
	}
	if filters.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIdx)
		args = append(args, filters.Offset)
		argIdx++
	}

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list audit logs: %w", err)
	}
	defer rows.Close()

	var logs []AuditLog
	for rows.Next() {
		var l AuditLog
		if err := rows.Scan(&l.ID, &l.NamespaceID, &l.Action, &l.ActorID,
			&l.TargetID, &l.TargetType, &l.Details, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit logs: %w", err)
	}

	if logs == nil {
		logs = []AuditLog{}
	}
	return logs, nil
}

// CreateAuditLog creates a new audit log entry.
func (s *Store) CreateAuditLog(ctx context.Context, params CreateAuditLogParams) (*AuditLog, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	const query = `INSERT INTO audit_logs (namespace_id, action, actor_id, target_id, target_type, details)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, namespace_id, action, actor_id, target_id, target_type, details, created_at`

	var l AuditLog
	err = conn.QueryRow(ctx, query,
		params.NamespaceID, params.Action, params.ActorID,
		params.TargetID, params.TargetType, params.Details,
	).Scan(&l.ID, &l.NamespaceID, &l.Action, &l.ActorID,
		&l.TargetID, &l.TargetType, &l.Details, &l.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create audit log: %w", err)
	}

	return &l, nil
}

// AdminStats returns aggregate system statistics.
func (s *Store) AdminStats(ctx context.Context) (*AdminStats, error) {
	conn, err := s.conn(ctx)
	if err != nil {
		return nil, err
	}

	stats := &AdminStats{
		UsersByRole: make(map[string]int),
	}

	// Users by role
	rows, err := conn.Query(ctx, `SELECT role, COUNT(*) FROM users GROUP BY role`)
	if err != nil {
		return nil, fmt.Errorf("count users by role: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return nil, fmt.Errorf("scan user role count: %w", err)
		}
		stats.UsersByRole[role] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user role counts: %w", err)
	}

	// Class count
	err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM classes`).Scan(&stats.ClassCount)
	if err != nil {
		return nil, fmt.Errorf("count classes: %w", err)
	}

	// Section count
	err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM sections`).Scan(&stats.SectionCount)
	if err != nil {
		return nil, fmt.Errorf("count sections: %w", err)
	}

	// Active sessions
	err = conn.QueryRow(ctx, `SELECT COUNT(*) FROM sessions WHERE status = 'active'`).Scan(&stats.ActiveSessions)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("count active sessions: %w", err)
	}

	return stats, nil
}

// ClearData deletes all data except the specified user. For dev/test use only.
func (s *Store) ClearData(ctx context.Context, keepUserID uuid.UUID) error {
	tx, err := s.beginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Delete in dependency order
	tables := []string{
		"revisions",
		"session_students",
		"sessions",
		"section_memberships",
		"sections",
		"problems",
		"classes",
		"audit_logs",
	}
	for _, table := range tables {
		if _, err := tx.Exec(ctx, fmt.Sprintf("DELETE FROM %s", table)); err != nil {
			return fmt.Errorf("clear %s: %w", table, err)
		}
	}

	// Delete all users except the admin
	if _, err := tx.Exec(ctx, "DELETE FROM users WHERE id != $1", keepUserID); err != nil {
		return fmt.Errorf("clear users: %w", err)
	}

	// Delete namespaces that have no users
	if _, err := tx.Exec(ctx, `DELETE FROM namespaces WHERE id NOT IN (SELECT DISTINCT namespace_id FROM users WHERE namespace_id IS NOT NULL)`); err != nil {
		return fmt.Errorf("clear namespaces: %w", err)
	}

	return tx.Commit(ctx)
}
