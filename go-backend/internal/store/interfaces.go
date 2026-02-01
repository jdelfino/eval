package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User represents a user in the database.
type User struct {
	ID          uuid.UUID
	ExternalID  *string // Identity Platform uid, nullable
	Email       string
	Role        string // system-admin, namespace-admin, instructor, student
	NamespaceID *string
	DisplayName *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
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
}

// ProblemFilters contains optional filters for listing problems.
type ProblemFilters struct {
	ClassID       *uuid.UUID
	AuthorID      *uuid.UUID
	Tags          []string
	PublicOnly bool
	SortBy        string // "created_at", "title", "updated_at"
	SortOrder     string // "asc", "desc"
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
	ID                uuid.UUID       `json:"id"`
	NamespaceID       string          `json:"namespace_id"`
	SectionID         uuid.UUID       `json:"section_id"`
	SectionName       string          `json:"section_name"`
	Problem           json.RawMessage `json:"problem"`
	FeaturedStudentID *uuid.UUID      `json:"featured_student_id"`
	FeaturedCode      *string         `json:"featured_code"`
	CreatorID         uuid.UUID       `json:"creator_id"`
	Participants      []uuid.UUID     `json:"participants"`
	Status            string          `json:"status"`
	CreatedAt         time.Time       `json:"created_at"`
	LastActivity      time.Time       `json:"last_activity"`
	EndedAt           *time.Time      `json:"ended_at"`
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
	FeaturedStudentID *uuid.UUID
	FeaturedCode      *string
	Status            *string
	EndedAt           *time.Time
	ClearEndedAt      bool
	ClearFeatured     bool
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
	// UpdateSession updates a session's mutable fields and returns the updated session.
	// Returns ErrNotFound if the session does not exist.
	UpdateSession(ctx context.Context, id uuid.UUID, params UpdateSessionParams) (*Session, error)
	// ListSessionHistory retrieves sessions based on user role.
	// Instructors see sessions they created; students see sessions they participated in.
	ListSessionHistory(ctx context.Context, userID uuid.UUID, isCreator bool, filters SessionHistoryFilters) ([]Session, error)
	// UpdateSessionProblem updates the problem JSON snapshot for an active session.
	// Returns ErrNotFound if the session does not exist.
	UpdateSessionProblem(ctx context.Context, id uuid.UUID, problem json.RawMessage) (*Session, error)
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
}

// SessionStudent represents a student's participation in a session.
type SessionStudent struct {
	ID                uuid.UUID       `json:"id"`
	SessionID         uuid.UUID       `json:"session_id"`
	UserID            uuid.UUID       `json:"user_id"`
	Name              string          `json:"name"`
	Code              string          `json:"code"`
	ExecutionSettings json.RawMessage `json:"execution_settings"`
	LastUpdate        time.Time       `json:"last_update"`
}

// JoinSessionParams contains the fields for joining a session.
type JoinSessionParams struct {
	SessionID uuid.UUID
	UserID    uuid.UUID
	Name      string
}

// SessionStudentRepository defines the interface for session student data access.
type SessionStudentRepository interface {
	// JoinSession adds a student to a session (idempotent via ON CONFLICT).
	JoinSession(ctx context.Context, params JoinSessionParams) (*SessionStudent, error)
	// UpdateCode updates a student's code in a session.
	// Returns ErrNotFound if the student is not in the session.
	UpdateCode(ctx context.Context, sessionID, userID uuid.UUID, code string) (*SessionStudent, error)
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
	SessionID       uuid.UUID       `json:"session_id"`
	UserID          uuid.UUID       `json:"user_id"`
	Timestamp       time.Time       `json:"timestamp"`
	IsDiff          bool            `json:"is_diff"`
	Diff            *string         `json:"diff"`
	FullCode        *string         `json:"full_code"`
	BaseRevisionID  *uuid.UUID      `json:"base_revision_id"`
	ExecutionResult json.RawMessage `json:"execution_result"`
}

// CreateRevisionParams contains the fields for creating a revision.
type CreateRevisionParams struct {
	NamespaceID     string
	SessionID       uuid.UUID
	UserID          uuid.UUID
	IsDiff          bool
	Diff            *string
	FullCode        *string
	BaseRevisionID  *uuid.UUID
	ExecutionResult json.RawMessage
}

// RevisionRepository defines the interface for revision data access.
type RevisionRepository interface {
	// ListRevisions retrieves all revisions for a session, optionally filtered by user.
	ListRevisions(ctx context.Context, sessionID uuid.UUID, userID *uuid.UUID) ([]Revision, error)
	// CreateRevision creates a new revision and returns it.
	CreateRevision(ctx context.Context, params CreateRevisionParams) (*Revision, error)
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

// UserRepository defines the interface for user data access.
type UserRepository interface {
	// GetUserByID retrieves a user by their primary key ID.
	// Returns ErrNotFound if the user does not exist.
	GetUserByID(ctx context.Context, id uuid.UUID) (*User, error)

	// GetUserByExternalID retrieves a user by their Identity Platform uid (external_id).
	// Returns ErrNotFound if the user does not exist.
	GetUserByExternalID(ctx context.Context, externalID string) (*User, error)

	// GetUserByEmail retrieves a user by email address.
	// Returns ErrNotFound if the user does not exist.
	GetUserByEmail(ctx context.Context, email string) (*User, error)

	// UpdateUser updates a user's mutable fields and returns the updated user.
	// Returns ErrNotFound if the user does not exist.
	UpdateUser(ctx context.Context, id uuid.UUID, params UpdateUserParams) (*User, error)

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
