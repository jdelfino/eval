package auth

// Permission represents a capability in the system.
// Permissions are assigned to roles via the rolePermissions map.
type Permission string

// Permissions (~10 capabilities vs coding-tool's 57).
// These are coarse-grained capabilities that match actual use cases.
const (
	// Session permissions
	PermSessionJoin   Permission = "session.join"   // Join a session as participant
	PermSessionManage Permission = "session.manage" // Create, update, delete sessions

	// Content permissions (consolidated CRUD for classes/sections/problems)
	PermContentManage Permission = "content.manage" // CRUD classes, sections, problems

	// Data access permissions
	PermDataViewOwn Permission = "data.viewOwn" // View own data (submissions, grades)
	PermDataViewAll Permission = "data.viewAll" // View all data in scope (instructor view)
	PermDataExport  Permission = "data.export"  // Export data (CSV, reports)

	// User management permissions
	PermUserManage     Permission = "user.manage"     // CRUD users within namespace
	PermUserChangeRole Permission = "user.changeRole" // Change user roles

	// Preview permissions
	PermPreviewStudent Permission = "preview.enter" // Enter preview-as-student mode

	// Administrative permissions
	PermNamespaceManage Permission = "namespace.manage" // Manage namespace settings
	PermSystemAdmin     Permission = "system.admin"     // Full system access
)

// rolePermissions maps each role to its granted permissions.
// Higher roles include all permissions of lower roles implicitly via this map.
var rolePermissions = map[Role][]Permission{
	RoleStudent: {
		PermSessionJoin,
		PermDataViewOwn,
	},
	RoleInstructor: {
		PermSessionJoin,
		PermSessionManage,
		PermContentManage,
		PermDataViewOwn,
		PermDataViewAll,
		PermDataExport,
		PermPreviewStudent,
	},
	RoleNamespaceAdmin: {
		PermSessionJoin,
		PermSessionManage,
		PermContentManage,
		PermDataViewOwn,
		PermDataViewAll,
		PermDataExport,
		PermUserManage,
		PermUserChangeRole,
		PermNamespaceManage,
		PermPreviewStudent,
	},
	RoleSystemAdmin: {
		PermSessionJoin,
		PermSessionManage,
		PermContentManage,
		PermDataViewOwn,
		PermDataViewAll,
		PermDataExport,
		PermUserManage,
		PermUserChangeRole,
		PermNamespaceManage,
		PermSystemAdmin,
		PermPreviewStudent,
	},
}

// permissionIndex is a pre-computed lookup for O(1) permission checks.
// Built at init time from rolePermissions.
var permissionIndex map[Role]map[Permission]struct{}

func init() {
	permissionIndex = make(map[Role]map[Permission]struct{}, len(rolePermissions))
	for role, perms := range rolePermissions {
		permissionIndex[role] = make(map[Permission]struct{}, len(perms))
		for _, p := range perms {
			permissionIndex[role][p] = struct{}{}
		}
	}
}

// HasPermission checks if a role has a specific permission.
func HasPermission(role Role, perm Permission) bool {
	perms, ok := permissionIndex[role]
	if !ok {
		return false
	}
	_, has := perms[perm]
	return has
}

// RolePermissions returns the permissions granted to a role.
// Returns nil for unknown roles.
func RolePermissions(role Role) []Permission {
	return rolePermissions[role]
}
