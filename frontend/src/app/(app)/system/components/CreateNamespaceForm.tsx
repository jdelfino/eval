'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface CreateNamespaceFormProps {
  onSubmit: (id: string, displayName: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export default function CreateNamespaceForm({ onSubmit, onCancel, loading }: CreateNamespaceFormProps) {
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [idError, setIdError] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');

  const validateId = (value: string): boolean => {
    const namespaceIdRegex = /^[a-z0-9-]{3,32}$/;
    if (!value) {
      setIdError('Namespace ID is required');
      return false;
    }
    if (!namespaceIdRegex.test(value)) {
      setIdError('ID must be 3-32 characters, lowercase letters, numbers, and hyphens only');
      return false;
    }
    setIdError('');
    return true;
  };

  const validateDisplayName = (value: string): boolean => {
    if (!value.trim()) {
      setDisplayNameError('Display name is required');
      return false;
    }
    setDisplayNameError('');
    return true;
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setId(value);
    if (value) validateId(value);
  };

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDisplayName(value);
    if (value) validateDisplayName(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isIdValid = validateId(id);
    const isDisplayNameValid = validateDisplayName(displayName);

    if (!isIdValid || !isDisplayNameValid) {
      return;
    }

    await onSubmit(id, displayName.trim());
  };

  return (
    <Card variant="outlined" className="p-6">
      <h3 className="text-lg font-semibold mb-6">Create New Namespace</h3>

      <form onSubmit={handleSubmit}>
        {/* Namespace ID */}
        <div className="mb-4">
          <label htmlFor="namespace-id" className="block mb-2 font-medium text-gray-700">
            Namespace ID *
          </label>
          <Input
            id="namespace-id"
            type="text"
            value={id}
            onChange={handleIdChange}
            placeholder="e.g., stanford, mit, company-x"
            disabled={loading}
            error={idError}
          />
          <div className="mt-1 text-sm text-gray-500">
            This will be the permanent identifier. Use lowercase, numbers, and hyphens only (3-32 chars).
          </div>
        </div>

        {/* Display Name */}
        <div className="mb-6">
          <label htmlFor="display-name" className="block mb-2 font-medium text-gray-700">
            Display Name *
          </label>
          <Input
            id="display-name"
            type="text"
            value={displayName}
            onChange={handleDisplayNameChange}
            placeholder="e.g., Stanford University, MIT, Company X"
            disabled={loading}
            error={displayNameError}
          />
          <div className="mt-1 text-sm text-gray-500">
            This is the human-readable name shown to users. Can be changed later.
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={loading || !id || !displayName}
            loading={loading}
          >
            {loading ? 'Creating...' : 'Create Namespace'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
