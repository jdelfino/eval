'use client';

/**
 * Invite Instructor Form for Namespace Admins
 *
 * Simple form to invite instructors to the namespace.
 * Role is fixed to 'instructor' and namespace is automatically determined.
 */

import React, { useState, FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

interface InviteInstructorFormProps {
  onSubmit: (email: string) => Promise<void>;
  loading: boolean;
}

export default function InviteInstructorForm({
  onSubmit,
  loading,
}: InviteInstructorFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate email
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      await onSubmit(email.trim());
      setSuccess(`Invitation sent to ${email.trim()}`);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  return (
    <Card variant="outlined" className="p-6">
      <form onSubmit={handleSubmit}>
        <h3 className="text-lg font-semibold mb-4">
          Invite Instructor
        </h3>

        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="invite-email"
              className="block mb-2 font-medium text-sm"
            >
              Email Address
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
                setSuccess('');
              }}
              placeholder="instructor@example.com"
              disabled={loading}
              className="py-2"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
          >
            {loading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert variant="error" dismissible onDismiss={() => setError('')}>
              {error}
            </Alert>
          </div>
        )}

        {success && (
          <div className="mt-4">
            <Alert variant="success" dismissible onDismiss={() => setSuccess('')}>
              {success}
            </Alert>
          </div>
        )}
      </form>
    </Card>
  );
}
