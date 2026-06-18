'use client';

import React, { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Modal, Button, Field, Input, Textarea } from '@/components/ui';
import { createClass } from '@/lib/api/classes';

interface CreateClassModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateClassModal({ onClose, onSuccess }: CreateClassModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();

    // Validation
    if (!trimmedName) {
      setError('Class name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Class name must be 100 characters or less');
      return;
    }
    if (trimmedDesc.length > 500) {
      setError('Description must be 500 characters or less');
      return;
    }

    setLoading(true);

    try {
      await createClass(trimmedName, trimmedDesc || undefined);

      // Success
      setName('');
      setDescription('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="create-class-form"
        variant="primary"
        loading={loading}
        disabled={loading || !name.trim()}
      >
        {loading ? 'Creating...' : 'Create class'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      title="New class"
      sub="A class is a long-running container. Sections are the meeting times that share its problem set."
      width={520}
      onClose={handleClose}
      footer={footer}
      initialFocusSelector="#class-name"
    >
      <form id="create-class-form" onSubmit={handleSubmit}>
        <Field label="Class Name *">
          <Input
            id="class-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., CS101 Fall 2025"
            disabled={loading}
            autoFocus
            maxLength={100}
          />
        </Field>

        <Field label="Description">
          <Textarea
            id="class-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the class"
            disabled={loading}
            rows={3}
            maxLength={500}
          />
        </Field>

        {error && <ErrorAlert error={error} onDismiss={() => setError(null)} />}
      </form>
    </Modal>
  );
}
