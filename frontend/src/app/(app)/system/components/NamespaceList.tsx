'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Namespace } from '@/server/auth/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';

interface NamespaceWithStats extends Namespace {
  userCount: number;
}

interface NamespaceListProps {
  namespaces: NamespaceWithStats[];
  onUpdate: (id: string, updates: { displayName?: string; active?: boolean }) => Promise<Namespace>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}

export default function NamespaceList({ namespaces, onUpdate, onDelete, loading }: NamespaceListProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleEdit = (namespace: NamespaceWithStats) => {
    setEditingId(namespace.id);
    setEditDisplayName(namespace.displayName);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editDisplayName.trim()) return;

    setActionLoading(true);
    try {
      await onUpdate(id, { displayName: editDisplayName.trim() });
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update namespace:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDisplayName('');
  };

  const handleToggleActive = async (namespace: NamespaceWithStats) => {
    setActionLoading(true);
    try {
      await onUpdate(namespace.id, { active: !namespace.active });
    } catch (err) {
      console.error('Failed to toggle namespace:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
  };

  const handleConfirmDelete = async (id: string) => {
    setActionLoading(true);
    try {
      await onDelete(id);
      setDeletingId(null);
    } catch (err) {
      console.error('Failed to delete namespace:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
  };

  const handleManageUsers = (namespaceId: string) => {
    router.push(`/system/namespaces/${namespaceId}`);
  };

  if (namespaces.length === 0) {
    return (
      <Card variant="outlined" className="text-center p-12">
        <p className="text-gray-500">
          No namespaces found. Create your first namespace to get started.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {namespaces.map(namespace => (
        <Card
          key={namespace.id}
          variant="outlined"
          className={`p-6 ${!namespace.active ? 'bg-gray-50 opacity-70' : ''}`}
        >
          {/* Namespace Header */}
          <div className="mb-4">
            {editingId === namespace.id ? (
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  disabled={actionLoading}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveEdit(namespace.id)}
                  disabled={actionLoading || !editDisplayName.trim()}
                  className="bg-green-600 hover:bg-green-700 from-green-600 to-green-600 hover:from-green-700 hover:to-green-700"
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      {namespace.displayName}
                    </h3>
                    <div className="text-sm text-gray-500 font-mono">
                      {namespace.id}
                    </div>
                  </div>
                  {!namespace.active && (
                    <Badge variant="warning">Inactive</Badge>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Namespace Info */}
          <div className="flex gap-8 mb-4 pb-4 border-b border-gray-200 text-sm text-gray-500">
            <div>
              <strong className="text-gray-700">Users:</strong> {namespace.userCount}
            </div>
            <div>
              <strong className="text-gray-700">Created:</strong> {new Date(namespace.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Actions */}
          {deletingId === namespace.id ? (
            <Alert variant="warning" className="p-4">
              <p className="font-medium mb-3">
                Are you sure you want to delete this namespace? This will deactivate it.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleConfirmDelete(namespace.id)}
                  disabled={actionLoading}
                  loading={actionLoading}
                >
                  {actionLoading ? 'Deleting...' : 'Yes, Delete'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelDelete}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
              </div>
            </Alert>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleManageUsers(namespace.id)}
                disabled={loading || actionLoading}
              >
                Manage Users
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleEdit(namespace)}
                disabled={loading || actionLoading}
              >
                Edit Name
              </Button>
              <Button
                variant={namespace.active ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => handleToggleActive(namespace)}
                disabled={loading || actionLoading}
                className={namespace.active
                  ? 'bg-warning-100 text-warning-800 border-warning-300 hover:bg-warning-200'
                  : 'bg-success-600 hover:bg-success-700 from-success-600 to-success-600 hover:from-success-700 hover:to-success-700'}
              >
                {namespace.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeleteClick(namespace.id)}
                disabled={loading || actionLoading}
              >
                Delete
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
