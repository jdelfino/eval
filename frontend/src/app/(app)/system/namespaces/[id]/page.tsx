'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasRolePermission } from '@/server/auth/permissions';
import { useRouter, useParams } from 'next/navigation';
import { useNamespaces } from '@/hooks/useNamespaces';
import { User } from '@/server/auth/types';
import { Namespace } from '@/server/auth/types';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';

/**
 * Namespace User Management Page
 *
 * Allows system admins to manage users within a specific namespace.
 */
export default function NamespaceUsersPage() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const namespaceId = params.id as string;

  const {
    loading,
    error,
    getNamespaceUsers,
    updateUserRole,
    deleteUser,
  } = useNamespaces();

  const [namespace, setNamespace] = useState<Namespace | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<'namespace-admin' | 'instructor' | 'student'>('student');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Redirect if not system admin
  useEffect(() => {
    if (!authLoading && (!currentUser || !hasRolePermission(currentUser.role, 'system.admin'))) {
      router.push('/');
    }
  }, [currentUser, authLoading, router]);

  // Fetch namespace and users
  useEffect(() => {
    if (currentUser && hasRolePermission(currentUser.role, 'system.admin') && namespaceId) {
      fetchData();
    }
  }, [currentUser, namespaceId]);

  const fetchData = async () => {
    try {
      // Fetch namespace details
      const nsResponse = await fetch(`/api/system/namespaces/${namespaceId}`);
      if (nsResponse.ok) {
        const nsData = await nsResponse.json();
        setNamespace(nsData.namespace);
      }

      // Fetch users
      const fetchedUsers = await getNamespaceUsers(namespaceId);
      setUsers(fetchedUsers);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  const handleUpdateRole = async (userId: string) => {
    setActionError(null);
    try {
      await updateUserRole(userId, editingRole);
      await fetchData();
      setEditingUserId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionError(null);
    try {
      await deleteUser(userId);
      await fetchData();
      setDeletingUserId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  // Show loading state
  if (authLoading || !currentUser) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </main>
    );
  }

  // Verify system admin role
  if (!hasRolePermission(currentUser.role, 'system.admin')) {
    return null; // Will redirect
  }

  // Get badge variant based on role
  const getRoleBadgeVariant = (role: string): 'warning' | 'info' | 'default' => {
    switch (role) {
      case 'namespace-admin':
        return 'warning';
      case 'instructor':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4">
          <BackButton href="/system">Back to System Admin</BackButton>
        </div>

        <h1 className="text-2xl font-bold mb-2">
          {namespace?.displayName || namespaceId}
        </h1>
        <p className="text-gray-500 font-mono">
          {namespaceId}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-semibold">Users ({users.length})</h2>
      </div>

      {/* Error Display */}
      {(error || actionError) && (
        <Alert variant="error" className="mb-8">
          <strong>Error:</strong> {error || actionError}
        </Alert>
      )}

      {/* User List */}
      {loading && users.length === 0 ? (
        <div className="text-center p-8 text-gray-500">
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <Card variant="outlined" className="text-center p-12">
          <p className="text-gray-500">
            No users in this namespace. Create a user to get started.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {users.map(user => (
            <Card key={user.id} variant="outlined" className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{user.displayName || user.email}</h3>
                  {user.displayName && (
                    <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                  )}

                  {editingUserId === user.id ? (
                    <div className="flex gap-2 items-center mb-2">
                      <select
                        value={editingRole}
                        onChange={(e) => setEditingRole(e.target.value as 'namespace-admin' | 'instructor' | 'student')}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="student">Student</option>
                        <option value="instructor">Instructor</option>
                        <option value="namespace-admin">Namespace Admin</option>
                      </select>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleUpdateRole(user.id)}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 from-green-600 to-green-600 hover:from-green-700 hover:to-green-700"
                      >
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingUserId(null)}
                        disabled={loading}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mb-2">
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role}
                      </Badge>
                    </div>
                  )}

                  <div className="text-sm text-gray-500">
                    Created: {new Date(user.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* User Actions */}
                {deletingUserId === user.id ? (
                  <Alert variant="warning" className="p-4 ml-4">
                    <p className="text-sm mb-2">
                      Delete this user?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={loading}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeletingUserId(null)}
                        disabled={loading}
                      >
                        No
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingUserId(user.id);
                        setEditingRole(user.role as 'namespace-admin' | 'instructor' | 'student');
                      }}
                      disabled={loading}
                    >
                      Change Role
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeletingUserId(user.id)}
                      disabled={loading}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
