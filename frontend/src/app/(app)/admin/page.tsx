'use client';

/**
 * Admin panel for system administration and user management.
 * Admins have full access, instructors have limited access.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasRolePermission } from '@/lib/permissions';
import { useSelectedNamespace } from '@/hooks/useSelectedNamespace';
import NamespaceHeader from '@/components/NamespaceHeader';
import { ErrorAlert } from '@/components/ErrorAlert';
import UserList from './components/UserList';
import InviteInstructorForm from './components/InviteInstructorForm';
import InvitationList from '@/components/InvitationList';
import { Tabs } from '@/components/ui/Tabs';
import { Table } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  getAdminStats,
  listNamespaceUsers,
  changeNamespaceUserRole,
  deleteNamespaceUser,
  type AdminStats,
} from '@/lib/api/admin';
import {
  listSystemUsersFiltered,
  updateSystemUser,
  deleteSystemUser,
} from '@/lib/api/system';
import {
  listInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
} from '@/lib/api/invitations';
import {
  listSystemInvitations,
  createSystemInvitation,
  revokeSystemInvitation,
  resendSystemInvitation,
} from '@/lib/api/system';
import type { UserRole, User } from '@/types/api';
import type { SerializedInvitation } from '@/lib/api/invitations';

function AdminPage() {
  const { user } = useAuth();
  const selectedNamespace = useSelectedNamespace();
  const [activeTab, setActiveTab] = useState<'users' | 'namespace-admins' | 'instructors' | 'students'>('users');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [namespaceAdmins, setNamespaceAdmins] = useState<User[]>([]);
  const [instructors, setInstructors] = useState<User[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleChangeLoading, setRoleChangeLoading] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<SerializedInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);

  const isAdmin = user ? hasRolePermission(user.role, 'user.changeRole') : false;
  const isSystemAdmin = user?.role === 'system-admin';

  // Get namespaceId for API calls (system-admin can filter by namespace)
  const getNamespaceId = () => {
    return isSystemAdmin && selectedNamespace ? selectedNamespace : undefined;
  };

  const loadStats = async () => {
    // Stats endpoint requires system-admin permission
    if (!isSystemAdmin) return;

    try {
      const data = await getAdminStats(getNamespaceId());
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadInvitations = async () => {
    if (!isAdmin) return;

    setInvitationsLoading(true);
    try {
      let data: SerializedInvitation[];
      if (isSystemAdmin) {
        data = await listSystemInvitations({ namespace_id: getNamespaceId() });
      } else {
        data = await listInvitations(user!.namespace_id!);
      }
      setInvitations(data || []);
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      setInvitationsLoading(false);
    }
  };

  const handleInviteInstructor = async (email: string) => {
    if (isSystemAdmin) {
      const nsId = getNamespaceId() || user!.namespace_id!;
      await createSystemInvitation(email, nsId, 'instructor');
    } else {
      await createInvitation(user!.namespace_id!, email, 'instructor');
    }

    // Reload invitations
    await loadInvitations();
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (isSystemAdmin) {
      await revokeSystemInvitation(invitationId);
    } else {
      await revokeInvitation(user!.namespace_id!, invitationId);
    }

    // Reload invitations
    await loadInvitations();
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (isSystemAdmin) {
      await resendSystemInvitation(invitationId);
    } else {
      await resendInvitation(user!.namespace_id!, invitationId);
    }

    // Reload invitations
    await loadInvitations();
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (isAdmin) {
        // Admins can see all users including other admins
        let users: User[];
        if (isSystemAdmin) {
          // System admin: use system-level endpoint with optional namespace filter
          users = await listSystemUsersFiltered({ namespaceId: getNamespaceId() });
        } else {
          // Namespace admin: use namespace-scoped endpoint (auto-scoped by backend)
          users = await listNamespaceUsers();
        }
        setAllUsers(users);
        setNamespaceAdmins(users.filter((u: User) => u.role === 'namespace-admin'));
        setInstructors(users.filter((u: User) => u.role === 'instructor'));
        setStudents(users.filter((u: User) => u.role === 'student'));
      } else {
        // Non-admin view: use namespace-scoped endpoint and filter client-side
        const users = await listNamespaceUsers();
        setInstructors((users || []).filter((u: User) => u.role === 'instructor'));
        setStudents((users || []).filter((u: User) => u.role === 'student'));
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load users';
      if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        setError('Connection error. Unable to load users. Please check your internet connection.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Retry handler for error recovery
  const handleRetry = useCallback(() => {
    setError('');
    loadUsers();
    loadStats();
  }, []);

  useEffect(() => {
    loadUsers();
    loadStats();
    loadInvitations();
  }, [isAdmin, selectedNamespace]);

  const handleChangeRole = async (user_id: string, newRole: UserRole) => {
    if (!isAdmin) return;

    setRoleChangeLoading(user_id);
    setError('');

    try {
      if (isSystemAdmin) {
        await updateSystemUser(user_id, { role: newRole });
      } else {
        await changeNamespaceUserRole(user_id, newRole);
      }

      // Reload users and stats
      await loadUsers();
      await loadStats();
    } catch (err: any) {
      setError(err.message || 'Failed to change user role');
    } finally {
      setRoleChangeLoading(null);
    }
  };

  const handleDeleteUser = async (user_id: string, _username: string) => {
    if (isSystemAdmin) {
      await deleteSystemUser(user_id);
    } else {
      await deleteNamespaceUser(user_id);
    }

    // Reload users
    await loadUsers();
    await loadStats();
  };

  const getRoleBadgeVariant = (role: UserRole): 'error' | 'info' | 'success' | 'warning' | 'default' => {
    switch (role) {
      case 'namespace-admin': return 'error';
      case 'system-admin': return 'warning';
      case 'instructor': return 'info';
      case 'student': return 'success';
    }
  };

  // Non-admins default to instructors tab
  const effectiveTab = !isAdmin && activeTab === 'users' ? 'instructors' : activeTab;

  if (!user) return null;

  return (
    <main className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-2xl font-bold">{isAdmin ? 'System Administration' : 'Admin Panel'}</h1>
        <NamespaceHeader />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4">
          <ErrorAlert
            error={error}
            onRetry={handleRetry}
            isRetrying={isLoading}
            onDismiss={() => setError('')}
            showHelpText={true}
          />
        </div>
      )}

      {/* Overview Stats Panel (System Admin Only) */}
      {isSystemAdmin && stats && (
        <div className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card variant="outlined" className="p-6">
              <div className="text-sm text-gray-500 mb-2">Total Users</div>
              <div className="text-3xl font-bold">{stats.users.total}</div>
              <div className="text-xs text-gray-500 mt-2">
                {stats.users.byRole.admin} admin · {stats.users.byRole.instructor} instructors · {stats.users.byRole.student} students
              </div>
            </Card>

            <Card variant="outlined" className="p-6">
              <div className="text-sm text-gray-500 mb-2">Classes</div>
              <div className="text-3xl font-bold">{stats.classes.total}</div>
            </Card>

            <Card variant="outlined" className="p-6">
              <div className="text-sm text-gray-500 mb-2">Sections</div>
              <div className="text-3xl font-bold">{stats.sections.total}</div>
            </Card>

            <Card variant="outlined" className="p-6 bg-success-50 border-success-200">
              <div className="text-sm text-success-700 mb-2">Active Sessions</div>
              <div className="text-3xl font-bold text-success-700">{stats.sessions.active}</div>
            </Card>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs activeTab={effectiveTab} onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}>
        <Tabs.List className="mb-6">
          {isAdmin && <Tabs.Tab tabId="users">All Users ({allUsers.length})</Tabs.Tab>}
          {isAdmin && <Tabs.Tab tabId="namespace-admins">Namespace Admins ({namespaceAdmins.length})</Tabs.Tab>}
          <Tabs.Tab tabId="instructors">Instructors ({instructors.length})</Tabs.Tab>
          <Tabs.Tab tabId="students">Students ({students.length})</Tabs.Tab>
        </Tabs.List>

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            Loading...
          </div>
        ) : (
          <>
            {/* All Users Tab (Admin Only) */}
            <Tabs.Panel tabId="users">
              {isAdmin && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">All Users</h2>
                  <p className="text-gray-500 mb-6">
                    Manage all users in the system. You can change user roles or delete users.
                  </p>
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Username</Table.HeaderCell>
                        <Table.HeaderCell>Email</Table.HeaderCell>
                        <Table.HeaderCell>Role</Table.HeaderCell>
                        <Table.HeaderCell>Created</Table.HeaderCell>
                        <Table.HeaderCell align="right">Actions</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {allUsers.map((u) => (
                        <Table.Row key={u.id}>
                          <Table.Cell>{u.display_name || u.email}</Table.Cell>
                          <Table.Cell className="text-sm text-gray-500">{u.email}</Table.Cell>
                          <Table.Cell>
                            <Badge variant={getRoleBadgeVariant(u.role)} className="capitalize">
                              {u.role}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell className="text-gray-500">
                            {new Date(u.created_at).toLocaleDateString()}
                          </Table.Cell>
                          <Table.Cell align="right">
                            {u.id !== user?.id && (
                              <select
                                value={u.role}
                                onChange={(e) => handleChangeRole(u.id, e.target.value as UserRole)}
                                disabled={roleChangeLoading === u.id}
                                className="mr-2 px-2 py-1 rounded border border-gray-300 text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                                {user.role === 'system-admin' && (
                                  <>
                                    <option value="namespace-admin">Namespace Admin</option>
                                    <option value="system-admin">System Admin</option>
                                  </>
                                )}
                              </select>
                            )}
                            {u.id === user?.id && (
                              <span className="text-sm text-gray-500">(You)</span>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              )}
            </Tabs.Panel>

            {/* Namespace Admins Tab (Admin Only) */}
            <Tabs.Panel tabId="namespace-admins">
              {isAdmin && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Namespace Admins</h2>
                  <p className="text-gray-500 mb-4">
                    Namespace admins can manage users and settings within their namespace.
                  </p>
                  <UserList
                    users={namespaceAdmins}
                    currentUserId={user.id}
                    showActions={false}
                  />
                </div>
              )}
            </Tabs.Panel>

            {/* Instructors Tab */}
            <Tabs.Panel tabId="instructors">
              <div>
                {/* Invitation UI for namespace admins */}
                {isAdmin && (
                  <div className="mb-8">
                    <InviteInstructorForm
                      onSubmit={handleInviteInstructor}
                      loading={invitationsLoading}
                    />

                    <h3 className="text-lg font-semibold mt-8 mb-4">Pending Invitations</h3>
                    <InvitationList
                      invitations={invitations}
                      loading={invitationsLoading}
                      onRevoke={handleRevokeInvitation}
                      onResend={handleResendInvitation}
                      emptyMessage="No invitations found. Use the form above to invite instructors."
                    />
                  </div>
                )}

                <h2 className="text-xl font-semibold mb-4">Instructors</h2>
                <UserList
                  users={instructors}
                  currentUserId={user.id}
                  onDelete={handleDeleteUser}
                  showActions={true}
                />
              </div>
            </Tabs.Panel>

            {/* Students Tab */}
            <Tabs.Panel tabId="students">
              <div>
                <h2 className="text-xl font-semibold mb-2">Students</h2>
                <p className="text-gray-500 mb-4">
                  Students are created automatically when they sign in for the first time.
                </p>
                <UserList
                  users={students}
                  currentUserId={user.id}
                  showActions={false}
                />
              </div>
            </Tabs.Panel>
          </>
        )}
      </Tabs>
    </main>
  );
}

export default function AdminPageWrapper() {
  return <AdminPage />;
}
