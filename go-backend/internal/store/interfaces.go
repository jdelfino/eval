package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User represents a user in the database.
type User struct {
	ID          uuid.UUID  `json:"id"`
	ExternalID  *string    `json:"external_id"`
	Email       string     `json:"email"`
	Role        string     `json:"role"`
	NamespaceID *string    `json:"namespace_id"`
	DisplayName *string    `json:"display_name"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// UpdateUserParams contains the fields that can be updated on a user.
type UpdateUserParams struct {
	DisplayName *string
}

// Namespace represents a namespace (tenant) in the database.
type Namespace struct {
	ID             string     `json:"id"`
	DisplayName    string     `json:"display_name"`
	Active         bool       `json:"active"`
	MaxInstructors *int       `json:"max_instructors"`
	MaxStudents    *int       `json:"max_students"`
	CreatedAt      time.Time  `json:"created_at"`
	CreatedBy      *uuid.UUID `json:"created_by"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// CreateNamespaceParams contains the fields for creating a namespace.
type CreateNamespaceParams struct {
	ID             string
	DisplayName    string
	MaxInstructors *int
	MaxStudents    *int
	CreatedBy      *uuid.UUID
}

// UpdateNamespaceParams contains the fields that can be updated on a namespace.
type UpdateNamespaceParams struct {
	DisplayName    *string
	Active         *bool
	MaxInstructors *int
	MaxStudents    *int
}

// NamespaceRepository defines the interface for namespace data access.
type NamespaceRepository interface {
	// ListNamespaces retrieves all namespaces visible to the current user (RLS-filtered).
	ListNamespaces(ctx context.Context) ([]Namespace, error)
	// GetNamespace retrieves a namespace by ID.
	// Returns ErrNotFound if the namespace does not exist.
	GetNamespace(ctx context.Context, id string) (*Namespace, error)
	// CreateNamespace creates a new namespace and returns it.
	CreateNamespace(ctx context.Context, params CreateNamespaceParams) (*Namespace, error)
	// UpdateNamespace updates a namespace's mutable fields and returns the updated namespace.
	// Returns ErrNotFound if the namespace does not exist.
	UpdateNamespace(ctx context.Context, id string, params UpdateNamespaceParams) (*Namespace, error)
	// DeleteNamespace permanently deletes a namespace and all related records (FK CASCADE).
	// Returns ErrNotFound if the namespace does not exist.
	DeleteNamespace(ctx context.Context, id string) error
}

// Class represents a class (course) in the database.
type Class struct {
	ID          uuid.UUID  `json:"id"`
	NamespaceID string     `json:"namespace_id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	CreatedBy   uuid.UUID  `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// CreateClassParams contains the fields for creating a class.
type CreateClassParams struct {
	NamespaceID string
	Name        string
	Description *string
	CreatedBy   uuid.UUID
}

// UpdateClassParams contains the fields that can be updated on a class.
type UpdateClassParams struct {
	Name        *string
	Description *string
}

// ClassRepository defines the interface for class data access.
type ClassRepository interface {
	// ListClasses retrieves all classes visible to the current user (RLS-filtered).
	ListClasses(ctx context.Context) ([]Class, error)
	// ListMyClasses retrieves classes the user created OR where the user
	// has an instructor section membership.
	ListMyClasses(ctx context.Context, userID uuid.UUID) ([]Class, error)
	// GetClass retrieves a class by ID.
	// Returns ErrNotFound if the class does not exist.
	GetClass(ctx context.Context, id uuid.UUID) (*Class, error)
	// CreateClass creates a new class and returns it.
	CreateClass(ctx context.Context, params CreateClassParams) (*Class, error)
	// UpdateClass updates a class's mutable fields and returns the updated class.
	// Returns ErrNotFound if the class does not exist.
	UpdateClass(ctx context.Context, id uuid.UUID, params UpdateClassParams) (*Class, error)
	// DeleteClass deletes a class by ID.
	// Returns ErrNotFound if the class does not exist.
	DeleteClass(ctx context.Context, id uuid.UUID) error
	// ListClassInstructorNames returns a map of user_id -> display name (or email)
	// for all instructors across sections of a class.
	ListClassInstructorNames(ctx context.Context, classID uuid.UUID) (map[string]string, error)
	// ListClassSectionInstructors returns a map of section_id -> []user_id
	// for all instructor memberships across sections of a class.
	ListClassSectionInstructors(ctx context.Context, classID uuid.UUID) (map[string][]string, error)
}

// Problem represents a coding exercise in the database.
type Problem struct {
	ID                uuid.UUID       `json:"id"`
	NamespaceID       string          `json:"namespace_id"`
	Title             string          `json:"title"`
	Description       *string         `json:"description"`
	StarterCode       *string         `json:"starter_code"`
	TestCases         json.RawMessage `json:"test_cases"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
	AuthorID          uuid.UUID       `json:"author_id"`
	ClassID           *uuid.UUID      `json:"class_id"`
	Tags              []string        `json:"tags"`
	Solution          *string         `json:"solution"`
	Language          string          `json:"language"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// CreateProblemParams contains the fields for creating a problem.
type CreateProblemParams struct {
	NamespaceID       string
	Title             string
	Description       *string
	StarterCode       *string
	TestCases         json.RawMessage
	ExecutionSettings json.RawMessage
	AuthorID          uuid.UUID
	ClassID           *uuid.UUID
	Tags              []string
	Solution          *string
	Language          string
}

// UpdateProblemParams contains the fields that can be updated on a problem.
type UpdateProblemParams struct {
	Title             *string
	Description       *string
	StarterCode       *string
	TestCases         json.RawMessage
	ExecutionSettings json.RawMessage
	ClassID           *uuid.UUID
	Tags              []string
	Solution          *string
	Language          *string
}

// ProblemFilters contains optional filters for listing problems.
type ProblemFilters struct {
	ClassID       *uuid.UUID
	AuthorID      *uuid.UUID
	Tags          []string
	PublicOnly    bool
	IncludePublic bool // when true and ClassID is set, returns class problems OR classless (public) problems; has no effect when ClassID is nil
	SortBy        string // "created_at", "title", "updated_at"
	SortOrder     string // "asc", "desc"
}

// PublicProblem is the public-facing subset of a problem, exposed without authentication.
type PublicProblem struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Solution    *string    `json:"solution"`
	StarterCode *string    `json:"starter_code"`
	ClassID     *uuid.UUID `json:"class_id"`
	ClassName   *string    `json:"class_name"`
	Tags        []string   `json:"tags"`
}

// ProblemRepository defines the interface for problem data access.
type ProblemRepository interface {
	// ListProblems retrieves all problems visible to the current user (RLS-filtered).
	// If classID is non-nil, results are filtered to that class.
	ListProblems(ctx context.Context, classID *uuid.UUID) ([]Problem, error)
	// ListProblemsFiltered retrieves problems with extended filters.
	ListProblemsFiltered(ctx context.Context, filters ProblemFilters) ([]Problem, error)
	// GetProblem retrieves a problem by ID.
	// Returns ErrNotFound if the problem does not exist.
	GetProblem(ctx context.Context, id uuid.UUID) (*Problem, error)
	// GetPublicProblem retrieves a problem's public fields by ID.
	// Used for unauthenticated public problem pages.
	// Returns ErrNotFound if the problem does not exist.
	GetPublicProblem(ctx context.Context, id uuid.UUID) (*PublicProblem, error)
	// CreateProblem creates a new problem and returns it.
	CreateProblem(ctx context.Context, params CreateProblemParams) (*Problem, error)
	// UpdateProblem updates a problem's mutable fields and returns the updated problem.
	// Returns ErrNotFound if the problem does not exist.
	UpdateProblem(ctx context.Context, id uuid.UUID, params UpdateProblemParams) (*Problem, error)
	// DeleteProblem deletes a problem by ID.
	// Returns ErrNotFound if the problem does not exist.
	DeleteProblem(ctx context.Context, id uuid.UUID) error
}

// Section represents a section (offering) of a class.
type Section struct {
	ID          uuid.UUID `json:"id"`
	NamespaceID string    `json:"namespace_id"`
	ClassID     uuid.UUID `json:"class_id"`
	Name        string    `json:"name"`
	Semester    *string   `json:"semester"`
	JoinCode    string    `json:"join_code"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CreateSectionParams contains the fields for creating a section.
type CreateSectionParams struct {
	NamespaceID string
	ClassID     uuid.UUID
	Name        string
	Semester    *string
	JoinCode    string
}

// UpdateSectionParams contains the fields that can be updated on a section.
type UpdateSectionParams struct {
	Name     *string
	Semester *string
	Active   *bool
}

// MySectionInfo represents a section with its class info for the "my sections" endpoint.
type MySectionInfo struct {
	Section   Section `json:"section"`
	ClassName string  `json:"class_name"`
}

// SectionRepository defines the interface for section data access.
type SectionRepository interface {
	// ListSectionsByClass retrieves all sections for a given class (RLS-filtered).
	ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]Section, error)
	// ListMySections retrieves sections the user is enrolled in with class info.
	ListMySections(ctx context.Context, userID uuid.UUID) ([]MySectionInfo, error)
	// UpdateSectionJoinCode updates a section's join code.
	// Returns ErrNotFound if the section does not exist.
	UpdateSectionJoinCode(ctx context.Context, id uuid.UUID, joinCode string) (*Section, error)
	// GetSection retrieves a section by ID.
	// Returns ErrNotFound if the section does not exist.
	GetSection(ctx context.Context, id uuid.UUID) (*Section, error)
	// CreateSection creates a new section and returns it.
	CreateSection(ctx context.Context, params CreateSectionParams) (*Section, error)
	// UpdateSection updates a section's mutable fields and returns the updated section.
	// Returns ErrNotFound if the section does not exist.
	UpdateSection(ctx context.Context, id uuid.UUID, params UpdateSectionParams) (*Section, error)
	// DeleteSection deletes a section by ID.
	// Returns ErrNotFound if the section does not exist.
	DeleteSection(ctx context.Context, id uuid.UUID) error
}

// Session represents a coding session within a section.
type Session struct {
	ID                        uuid.UUID       `json:"id"`
	NamespaceID               string          `json:"namespace_id"`
	SectionID                 uuid.UUID       `json:"section_id"`
	SectionName               string          `json:"section_name"`
	Problem                   json.RawMessage `json:"problem"`
	FeaturedStudentID         *uuid.UUID      `json:"featured_student_id"`
	FeaturedCode              *string         `json:"featured_code"`
	FeaturedExecutionSettings json.RawMessage `json:"featured_execution_settings"`
	CreatorID                 uuid.UUID       `json:"creator_id"`
	Participants              []uuid.UUID     `json:"participants"`
	Status                    string          `json:"status"`
	CreatedAt                 time.Time       `json:"created_at"`
	LastActivity              time.Time       `json:"last_activity"`
	EndedAt                   *time.Time      `json:"ended_at"`
}

// CreateSessionParams contains the fields for creating a session.
type CreateSessionParams struct {
	NamespaceID string
	SectionID   uuid.UUID
	SectionName string
	Problem     json.RawMessage
	CreatorID   uuid.UUID
}

// UpdateSessionParams contains the fields that can be updated on a session.
type UpdateSessionParams struct {
	FeaturedStudentID         *uuid.UUID
	FeaturedCode              *string
	FeaturedExecutionSettings json.RawMessage
	Status                    *string
	EndedAt                   *time.Time
	ClearEndedAt              bool
	ClearFeatured             bool
}

// SessionHistoryFilters contains optional filters for listing session history.
type SessionHistoryFilters struct {
	ClassID *uuid.UUID
	Search  *string
}

// SessionFilters contains optional filters for listing sessions.
type SessionFilters struct {
	SectionID *uuid.UUID
	Status    *string
}

// SessionRepository defines the interface for session data access.
type SessionRepository interface {
	// ListSessions retrieves all sessions visible to the current user (RLS-filtered).
	// Results can be filtered by section_id and/or status.
	ListSessions(ctx context.Context, filters SessionFilters) ([]Session, error)
	// GetSession retrieves a session by ID.
	// Returns ErrNotFound if the session does not exist.
	GetSession(ctx context.Context, id uuid.UUID) (*Session, error)
	// CreateSession creates a new session and returns it.
	CreateSession(ctx context.Context, params CreateSessionParams) (*Session, error)
	// EndActiveSessions marks all active sessions in a section as completed
	// and returns their IDs. Used to auto-end old sessions when a new one starts.
	EndActiveSessions(ctx context.Context, sectionID uuid.UUID) ([]uuid.UUID, error)
	// UpdateSession updates a session's mutable fields and returns the updated session.
	// Returns ErrNotFound if the session does not exist.
	UpdateSession(ctx context.Context, id uuid.UUID, params UpdateSessionParams) (*Session, error)
	// ListSessionHistory retrieves sessions based on user role.
	// Instructors see sessions they created; students see sessions they participated in.
	ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters SessionHistoryFilters) ([]Session, error)
	// UpdateSessionProblem updates the problem JSON snapshot for an active session.
	// Returns ErrNotFound if the session does not exist.
	UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*Session, error)
	// CreateSessionReplacingActive atomically ends any active sessions in the section
	// and creates a new session, all within a single transaction.
	// Returns the new session and the IDs of ended sessions.
	CreateSessionReplacingActive(ctx context.Context, params CreateSessionParams) (*Session, []uuid.UUID, error)
	// ReopenSessionReplacingActive atomically ends any other active sessions in the section
	// and reopens the given completed session, all within a single transaction.
	// Returns the reopened session and the IDs of ended sessions.
	ReopenSessionReplacingActive(ctx context.Context, id uuid.UUID, sectionID uuid.UUID) (*Session, []uuid.UUID, error)
}

// MembershipRepository defines the interface for section membership data access.
type MembershipRepository interface {
	// GetSectionByJoinCode retrieves a section by its join code.
	// Returns ErrNotFound if no section has the given code.
	GetSectionByJoinCode(ctx context.Context, code string) (*Section, error)
	// CreateMembership creates a new section membership and returns it.
	CreateMembership(ctx context.Context, params CreateMembershipParams) (*SectionMembership, error)
	// DeleteMembership deletes a user's membership from a section.
	// Returns ErrNotFound if the membership does not exist.
	DeleteMembership(ctx context.Context, sectionID, userID uuid.UUID) error
	// ListMembers retrieves all memberships for a given section.
	ListMembers(ctx context.Context, sectionID uuid.UUID) ([]SectionMembership, error)
	// ListMembersByRole retrieves memberships for a given section filtered by role.
	ListMembersByRole(ctx context.Context, sectionID uuid.UUID, role string) ([]SectionMembership, error)
	// DeleteMembershipIfNotLast atomically deletes a membership only if it is not the
	// last member with the given role in the section.
	// Returns ErrLastMember if removal would leave zero members with that role.
	// Returns ErrNotFound if the membership does not exist.
	DeleteMembershipIfNotLast(ctx context.Context, sectionID, userID uuid.UUID, role string) error
}

// SessionStudent represents a student's participation in a session.
// Code and ExecutionSettings are populated from student_work via JOIN.
type SessionStudent struct {
	ID                uuid.UUID       `json:"id"`
	SessionID         uuid.UUID       `json:"session_id"`
	UserID            uuid.UUID       `json:"user_id"`
	Name              string          `json:"name"`
	Code              string          `json:"code"`                      // From student_work
	ExecutionSettings json.RawMessage `json:"execution_settings"`       // From student_work
	JoinedAt          time.Time       `json:"joined_at"`                // When student joined session
	StudentWorkID     *uuid.UUID      `json:"student_work_id,omitempty"` // Link to student_work
}

// JoinSessionParams contains the fields for joining a session.
type JoinSessionParams struct {
	SessionID     uuid.UUID
	UserID        uuid.UUID
	Name          string
	StudentWorkID *uuid.UUID // Link to student_work (Task 4 addition)
}

// SessionStudentRepository defines the interface for session student data access.
type SessionStudentRepository interface {
	// JoinSession adds a student to a session (idempotent via ON CONFLICT).
	JoinSession(ctx context.Context, params JoinSessionParams) (*SessionStudent, error)
	// ListSessionStudents retrieves all students in a session.
	ListSessionStudents(ctx context.Context, sessionID uuid.UUID) ([]SessionStudent, error)
	// GetSessionStudent retrieves a single student's record in a session.
	// Returns ErrNotFound if the student is not in the session.
	GetSessionStudent(ctx context.Context, sessionID, userID uuid.UUID) (*SessionStudent, error)
}

// Revision represents a code revision within a session.
type Revision struct {
	ID              uuid.UUID       `json:"id"`
	NamespaceID     string          `json:"namespace_id"`
	SessionID       *uuid.UUID      `json:"session_id"`           // Optional (nil for practice mode)
	UserID          uuid.UUID       `json:"user_id"`
	Timestamp       time.Time       `json:"timestamp"`
	IsDiff          bool            `json:"is_diff"`
	Diff            *string         `json:"diff"`
	FullCode        *string         `json:"full_code"`
	BaseRevisionID  *uuid.UUID      `json:"base_revision_id"`
	ExecutionResult json.RawMessage `json:"execution_result"`
	StudentWorkID   *uuid.UUID      `json:"student_work_id"`
}

// CreateRevisionParams contains the fields for creating a revision.
type CreateRevisionParams struct {
	NamespaceID     string
	SessionID       *uuid.UUID // Optional (nil for practice mode, Task 4 change)
	UserID          uuid.UUID
	IsDiff          bool
	Diff            *string
	FullCode        *string
	BaseRevisionID  *uuid.UUID
	ExecutionResult json.RawMessage
	StudentWorkID   *uuid.UUID // Required for revisions (Task 4 change)
}

// RevisionRepository defines the interface for revision data access.
type RevisionRepository interface {
	// ListRevisions retrieves all revisions for a session, optionally filtered by user.
	ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]Revision, error)
	// CreateRevision creates a new revision and returns it.
	CreateRevision(ctx context.Context, params CreateRevisionParams) (*Revision, error)
}

// DashboardSection represents a section summary in the instructor dashboard.
type DashboardSection struct {
	ID              uuid.UUID  `json:"id"`
	Name            string     `json:"name"`
	JoinCode        string     `json:"join_code"`
	Semester        *string    `json:"semester,omitempty"`
	StudentCount    int        `json:"studentCount"`
	ActiveSessionID *uuid.UUID `json:"activeSessionId,omitempty"`
}

// DashboardClass represents a class summary in the instructor dashboard.
type DashboardClass struct {
	ID       uuid.UUID          `json:"id"`
	Name     string             `json:"name"`
	Sections []DashboardSection `json:"sections"`
}

// DashboardRepository defines the interface for dashboard data access.
type DashboardRepository interface {
	// InstructorDashboard returns classes with sections (student counts, active session IDs)
	// for the given instructor.
	InstructorDashboard(ctx context.Context, userID uuid.UUID) ([]DashboardClass, error)
}

// CreateUserParams contains the fields for creating a new user.
type CreateUserParams struct {
	ExternalID  string
	Email       string
	Role        string
	NamespaceID *string
	DisplayName *string
}

// UpdateUserAdminParams contains the fields an admin can update on a user.
type UpdateUserAdminParams struct {
	Email       *string
	DisplayName *string
	Role        *string
	NamespaceID *string
}

// UserFilters contains optional filters for listing users.
type UserFilters struct {
	NamespaceID *string
	Role        *string
}

// UserReader defines the read-only lookup operations for users.
// It is a sub-interface of UserRepository, suitable for components that
// only need to look up users (e.g., authentication middleware adapters).
type UserReader interface {
	// GetUserByID retrieves a user by their primary key ID.
	// Returns ErrNotFound if the user does not exist.
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)

	// GetUserByExternalID retrieves a user by their Identity Platform uid (external_id).
	// Returns ErrNotFound if the user does not exist.
	GetUserByExternalID(ctx context.Context, externalID string) (*User, error)

	// GetUserByEmail retrieves a user by email address.
	// Returns ErrNotFound if the user does not exist.
	GetUserByEmail(ctx context.Context, email string) (*User, error)
}

// UserAdmin defines the administrative operations for users.
// It is a sub-interface of UserRepository, suitable for components that
// only need admin-level user management (e.g., admin API handlers).
type UserAdmin interface {
	// ListUsers retrieves users with optional filters.
	ListUsers(ctx context.Context, filters UserFilters) ([]User, error)

	// UpdateUserAdmin updates a user's fields as an admin and returns the updated user.
	// Returns ErrNotFound if the user does not exist.
	UpdateUserAdmin(ctx context.Context, id uuid.UUID, params UpdateUserAdminParams) (*User, error)

	// DeleteUser deletes a user by ID.
	// Returns ErrNotFound if the user does not exist.
	DeleteUser(ctx context.Context, id uuid.UUID) error

	// CountUsersByRole counts users grouped by role within a namespace.
	CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error)
}

// UserRepository defines the full interface for user data access.
// It composes UserReader and UserAdmin and adds user-scoped write operations.
type UserRepository interface {
	UserReader
	UserAdmin

	// UpdateUser updates a user's mutable fields and returns the updated user.
	// Returns ErrNotFound if the user does not exist.
	UpdateUser(ctx context.Context, id uuid.UUID, params UpdateUserParams) (*User, error)

	// CreateUser creates a new user and returns it.
	CreateUser(ctx context.Context, params CreateUserParams) (*User, error)
}

// Invitation represents an invitation in the database.
type Invitation struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	UserID      *uuid.UUID `json:"user_id"`
	TargetRole  string     `json:"target_role"`
	NamespaceID string     `json:"namespace_id"`
	CreatedBy   uuid.UUID  `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ExpiresAt   time.Time  `json:"expires_at"`
	ConsumedAt  *time.Time `json:"consumed_at"`
	ConsumedBy  *uuid.UUID `json:"consumed_by"`
	RevokedAt   *time.Time `json:"revoked_at"`
	Status      string     `json:"status"` // computed: pending, consumed, revoked, expired
}

// CreateInvitationParams contains the fields for creating an invitation.
type CreateInvitationParams struct {
	Email       string
	TargetRole  string
	NamespaceID string
	CreatedBy   uuid.UUID
	ExpiresAt   time.Time
}

// InvitationFilters contains optional filters for listing invitations.
type InvitationFilters struct {
	NamespaceID *string
	Status      *string // filter by computed status
}

// InvitationRepository defines the interface for invitation data access.
type InvitationRepository interface {
	ListInvitations(ctx context.Context, filters InvitationFilters) ([]Invitation, error)
	GetInvitation(ctx context.Context, id uuid.UUID) (*Invitation, error)
	CreateInvitation(ctx context.Context, params CreateInvitationParams) (*Invitation, error)
	RevokeInvitation(ctx context.Context, id uuid.UUID) (*Invitation, error)
	ConsumeInvitation(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*Invitation, error)
}

// AuditLog represents a row in the audit_logs table.
type AuditLog struct {
	ID          uuid.UUID       `json:"id"`
	NamespaceID string          `json:"namespace_id"`
	Action      string          `json:"action"`
	ActorID     *uuid.UUID      `json:"actor_id"`
	TargetID    *string         `json:"target_id"`
	TargetType  *string         `json:"target_type"`
	Details     json.RawMessage `json:"details"`
	CreatedAt   time.Time       `json:"created_at"`
}

// AuditLogFilters contains optional filters for listing audit logs.
type AuditLogFilters struct {
	Limit   int
	Offset  int
	Action  *string
	ActorID *uuid.UUID
}

// CreateAuditLogParams contains the fields for creating an audit log entry.
type CreateAuditLogParams struct {
	NamespaceID string
	Action      string
	ActorID     *uuid.UUID
	TargetID    *string
	TargetType  *string
	Details     json.RawMessage
}

// AuditLogRepository defines the interface for audit log data access.
type AuditLogRepository interface {
	ListAuditLogs(ctx context.Context, filters AuditLogFilters) ([]AuditLog, error)
	CreateAuditLog(ctx context.Context, params CreateAuditLogParams) (*AuditLog, error)
}

// SectionProblem represents a problem published to a section.
type SectionProblem struct {
	ID           uuid.UUID `json:"id"`
	SectionID    uuid.UUID `json:"section_id"`
	ProblemID    uuid.UUID `json:"problem_id"`
	PublishedBy  uuid.UUID `json:"published_by"`
	ShowSolution bool      `json:"show_solution"`
	PublishedAt  time.Time `json:"published_at"`
}

// CreateSectionProblemParams contains the fields for creating a section problem.
type CreateSectionProblemParams struct {
	SectionID    uuid.UUID
	ProblemID    uuid.UUID
	PublishedBy  uuid.UUID
	ShowSolution bool
}

// UpdateSectionProblemParams contains the fields that can be updated on a section problem.
type UpdateSectionProblemParams struct {
	ShowSolution *bool
}

// PublishedProblemWithStatus represents a published problem with its details and student work status.
type PublishedProblemWithStatus struct {
	SectionProblem
	Problem     Problem      `json:"problem"`
	StudentWork *StudentWork `json:"student_work,omitempty"` // nil if student hasn't started
}

// SectionProblemRepository defines the interface for section problem data access.
type SectionProblemRepository interface {
	// ListSectionProblems retrieves all problems published to a section with student work status.
	ListSectionProblems(ctx context.Context, sectionID, userID uuid.UUID) ([]PublishedProblemWithStatus, error)
	// CreateSectionProblem publishes a problem to a section.
	CreateSectionProblem(ctx context.Context, params CreateSectionProblemParams) (*SectionProblem, error)
	// EnsureSectionProblem idempotently ensures a section_problems record exists for a given
	// (section, problem) pair. Safe to call even when the problem is already published.
	EnsureSectionProblem(ctx context.Context, params CreateSectionProblemParams) error
	// UpdateSectionProblem updates a section problem's mutable fields.
	// Returns ErrNotFound if the section problem does not exist.
	UpdateSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID, params UpdateSectionProblemParams) (*SectionProblem, error)
	// DeleteSectionProblem removes a problem from a section.
	// Returns ErrNotFound if the section problem does not exist.
	DeleteSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) error
	// GetSectionProblem retrieves a single section problem by section and problem IDs.
	// Returns ErrNotFound if the problem is not published to the section.
	GetSectionProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*SectionProblem, error)
	// ListSectionsForProblem retrieves all sections where a problem is published.
	ListSectionsForProblem(ctx context.Context, problemID uuid.UUID) ([]SectionProblem, error)
}

// StudentWork represents persistent student work for a problem in a section.
type StudentWork struct {
	ID                uuid.UUID       `json:"id"`
	NamespaceID       string          `json:"namespace_id"`
	UserID            uuid.UUID       `json:"user_id"`
	ProblemID         uuid.UUID       `json:"problem_id"`
	SectionID         uuid.UUID       `json:"section_id"`
	Code              string          `json:"code"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
	CreatedAt         time.Time       `json:"created_at"`
	LastUpdate        time.Time       `json:"last_update"`
}

// StudentWorkWithProblem represents student work with its associated problem details.
type StudentWorkWithProblem struct {
	StudentWork
	Problem Problem `json:"problem"`
}

// UpdateStudentWorkParams contains the fields that can be updated on student work.
type UpdateStudentWorkParams struct {
	Code              *string
	ExecutionSettings json.RawMessage // nil means don't update
}

// StudentProgress holds progress summary for a single student in a section.
type StudentProgress struct {
	UserID          uuid.UUID  `json:"user_id"`
	DisplayName     string     `json:"display_name"`
	Email           string     `json:"email"`
	ProblemsStarted int        `json:"problems_started"`
	TotalProblems   int        `json:"total_problems"`
	LastActive      *time.Time `json:"last_active"`
}

// StudentWorkSummary holds a published problem and the student's work for it (if any).
type StudentWorkSummary struct {
	Problem     Problem      `json:"problem"`
	PublishedAt time.Time    `json:"published_at"`
	StudentWork *StudentWork `json:"student_work"`
}

// StudentWorkRepository defines the interface for student work data access.
type StudentWorkRepository interface {
	// GetOrCreateStudentWork gets or creates student work for a (user, problem, section) triple.
	GetOrCreateStudentWork(ctx context.Context, namespaceID string, userID, problemID, sectionID uuid.UUID) (*StudentWork, error)
	// UpdateStudentWork updates a student work's mutable fields.
	// Returns ErrNotFound if the student work does not exist.
	UpdateStudentWork(ctx context.Context, id uuid.UUID, params UpdateStudentWorkParams) (*StudentWork, error)
	// GetStudentWork retrieves student work by ID with problem details.
	// Returns ErrNotFound if the student work does not exist.
	GetStudentWork(ctx context.Context, id uuid.UUID) (*StudentWorkWithProblem, error)
	// GetStudentWorkByProblem retrieves student work by (user, problem, section).
	// Returns ErrNotFound if the student work does not exist.
	GetStudentWorkByProblem(ctx context.Context, userID, problemID, sectionID uuid.UUID) (*StudentWork, error)
	// ListStudentWorkBySession retrieves all student work linked to a session.
	ListStudentWorkBySession(ctx context.Context, sessionID uuid.UUID) ([]StudentWork, error)
	// ListStudentProgress returns a progress summary for every student in a section.
	ListStudentProgress(ctx context.Context, sectionID uuid.UUID) ([]StudentProgress, error)
	// ListStudentWorkForReview returns all published problems in a section with the
	// given student's work (if any) for each problem.
	ListStudentWorkForReview(ctx context.Context, sectionID, studentUserID uuid.UUID) ([]StudentWorkSummary, error)
}

// AdminStats contains aggregate system statistics.
type AdminStats struct {
	UsersByRole    map[string]int `json:"users_by_role"`
	ClassCount     int            `json:"class_count"`
	SectionCount   int            `json:"section_count"`
	ActiveSessions int            `json:"active_sessions"`
}

// AdminRepository defines the interface for admin data access.
type AdminRepository interface {
	AdminStats(ctx context.Context) (*AdminStats, error)
	ClearData(ctx context.Context, keepUserID uuid.UUID) error
}
