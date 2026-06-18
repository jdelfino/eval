'use client';

import React, { useState } from 'react';
import { Modal, Button, Field, Input } from '@/components/ui';
import { createSection } from '@/lib/api/classes';

interface CreateSectionModalProps {
  class_id: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSectionModal({ class_id, onClose, onSuccess }: CreateSectionModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();

    // Validation
    if (!trimmedName) {
      setError('Section name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Section name must be 100 characters or less');
      return;
    }

    setLoading(true);

    try {
      await createSection(class_id, {
        name: trimmedName,
      });

      // Success
      setName('');
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
        form="create-section-form"
        variant="primary"
        loading={loading}
        disabled={loading || !name.trim()}
      >
        {loading ? 'Creating...' : 'Create section'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      title="New section"
      sub="A section is a meeting time within a class. Students join it with its code."
      width={448}
      onClose={handleClose}
      footer={footer}
      initialFocusSelector="#section-name"
    >
      <form id="create-section-form" onSubmit={handleSubmit}>
        <Field label="Section Name *">
          <Input
            id="section-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Section A"
            disabled={loading}
            autoFocus
            maxLength={100}
            error={error ?? undefined}
          />
        </Field>
      </form>
    </Modal>
  );
}
