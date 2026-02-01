'use client';

/**
 * User list component with actions.
 */

import React, { useState } from 'react';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { User } from '@/server/auth/types';

interface UserListProps {
  users: User[];
  currentUserId: string;
  onDelete?: (userId: string, username: string) => Promise<void>;
  showActions?: boolean;
}

export default function UserList({ users, currentUserId, onDelete, showActions = false }: UserListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (userId: string, username: string) => {
    if (!onDelete) return;

    setDeletingId(userId);
    try {
      await onDelete(userId, username);
      setConfirmDeleteId(null);
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleBadgeVariant = (role: string): 'info' | 'success' | 'default' => {
    if (role === 'instructor') return 'info';
    if (role === 'student') return 'success';
    return 'default';
  };

  if (users.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 bg-gray-50 rounded">
        No users found
      </div>
    );
  }

  return (
    <Table className="bg-white shadow-sm">
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>User</Table.HeaderCell>
          <Table.HeaderCell>Email</Table.HeaderCell>
          <Table.HeaderCell>Role</Table.HeaderCell>
          <Table.HeaderCell>Created</Table.HeaderCell>
          <Table.HeaderCell>Last Login</Table.HeaderCell>
          {showActions && <Table.HeaderCell align="center">Actions</Table.HeaderCell>}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {users.map((user) => (
          <Table.Row key={user.id}>
            <Table.Cell>
              <div className="flex items-center gap-2">
                {user.displayName || user.email}
                {user.id === currentUserId && (
                  <Badge variant="info">You</Badge>
                )}
              </div>
            </Table.Cell>
            <Table.Cell className="text-sm text-gray-500">
              {user.email}
            </Table.Cell>
            <Table.Cell>
              <Badge variant={getRoleBadgeVariant(user.role)}>
                {user.role}
              </Badge>
            </Table.Cell>
            <Table.Cell className="text-sm text-gray-500">
              {formatDate(user.createdAt)}
            </Table.Cell>
            <Table.Cell className="text-sm text-gray-500">
              {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
            </Table.Cell>
            {showActions && (
              <Table.Cell align="center">
                {user.id === currentUserId ? (
                  <span className="text-sm text-gray-500">-</span>
                ) : confirmDeleteId === user.id ? (
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(user.id, user.displayName || user.email)}
                      loading={deletingId === user.id}
                    >
                      {deletingId === user.id ? 'Deleting...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === user.id}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(user.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-300"
                  >
                    Delete
                  </Button>
                )}
              </Table.Cell>
            )}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}
