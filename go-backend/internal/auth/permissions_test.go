package auth

import "testing"

func TestPermPreviewStudent(t *testing.T) {
	// Roles that CAN use preview mode
	previewRoles := []Role{RoleInstructor, RoleNamespaceAdmin, RoleSystemAdmin}
	for _, role := range previewRoles {
		if !HasPermission(role, PermPreviewStudent) {
			t.Errorf("role %q should have PermPreviewStudent", role)
		}
	}

	// Students must NOT have preview.enter
	if HasPermission(RoleStudent, PermPreviewStudent) {
		t.Error("student should NOT have PermPreviewStudent")
	}
}

func TestHasPermission(t *testing.T) {
	tests := []struct {
		name string
		role Role
		perm Permission
		want bool
	}{
		// Student permissions
		{"student can join session", RoleStudent, PermSessionJoin, true},
		{"student can view own data", RoleStudent, PermDataViewOwn, true},
		{"student cannot manage sessions", RoleStudent, PermSessionManage, false},
		{"student cannot manage content", RoleStudent, PermContentManage, false},
		{"student cannot view all data", RoleStudent, PermDataViewAll, false},

		// Instructor permissions
		{"instructor can join session", RoleInstructor, PermSessionJoin, true},
		{"instructor can manage sessions", RoleInstructor, PermSessionManage, true},
		{"instructor can manage content", RoleInstructor, PermContentManage, true},
		{"instructor can view all data", RoleInstructor, PermDataViewAll, true},
		{"instructor can export data", RoleInstructor, PermDataExport, true},
		{"instructor cannot manage users", RoleInstructor, PermUserManage, false},
		{"instructor cannot change roles", RoleInstructor, PermUserChangeRole, false},

		// Namespace admin permissions
		{"namespace-admin can manage users", RoleNamespaceAdmin, PermUserManage, true},
		{"namespace-admin can change roles", RoleNamespaceAdmin, PermUserChangeRole, true},
		{"namespace-admin can manage namespace", RoleNamespaceAdmin, PermNamespaceManage, true},
		{"namespace-admin cannot system admin", RoleNamespaceAdmin, PermSystemAdmin, false},

		// System admin permissions
		{"system-admin has system admin", RoleSystemAdmin, PermSystemAdmin, true},
		{"system-admin can manage namespace", RoleSystemAdmin, PermNamespaceManage, true},
		{"system-admin can manage users", RoleSystemAdmin, PermUserManage, true},

		// Unknown role
		{"unknown role has no permissions", Role("unknown"), PermSessionJoin, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := HasPermission(tc.role, tc.perm)
			if got != tc.want {
				t.Errorf("HasPermission(%q, %q) = %v, want %v", tc.role, tc.perm, got, tc.want)
			}
		})
	}
}

func TestRolePermissions(t *testing.T) {
	tests := []struct {
		role      Role
		wantCount int
	}{
		{RoleStudent, 2},
		{RoleInstructor, 7},
		{RoleNamespaceAdmin, 10},
		{RoleSystemAdmin, 11},
		{Role("unknown"), 0},
	}

	for _, tc := range tests {
		t.Run(string(tc.role), func(t *testing.T) {
			perms := RolePermissions(tc.role)
			if len(perms) != tc.wantCount {
				t.Errorf("RolePermissions(%q) returned %d permissions, want %d", tc.role, len(perms), tc.wantCount)
			}
		})
	}
}

func TestAllRolesHavePermissions(t *testing.T) {
	knownRoles := []Role{RoleStudent, RoleInstructor, RoleNamespaceAdmin, RoleSystemAdmin}

	for _, role := range knownRoles {
		perms := RolePermissions(role)
		if len(perms) == 0 {
			t.Errorf("Role %q has no permissions", role)
		}
	}
}

func TestPermissionHierarchy(t *testing.T) {
	// Verify that higher roles have all permissions of lower roles
	studentPerms := RolePermissions(RoleStudent)
	instructorPerms := RolePermissions(RoleInstructor)

	for _, perm := range studentPerms {
		if !HasPermission(RoleInstructor, perm) {
			t.Errorf("Instructor should have student permission %q", perm)
		}
	}

	for _, perm := range instructorPerms {
		if !HasPermission(RoleNamespaceAdmin, perm) {
			t.Errorf("NamespaceAdmin should have instructor permission %q", perm)
		}
		if !HasPermission(RoleSystemAdmin, perm) {
			t.Errorf("SystemAdmin should have instructor permission %q", perm)
		}
	}
}
