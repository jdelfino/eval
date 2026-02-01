/**
 * Create Invitation Form for System Admin
 *
 * Allows system admins to create invitations for namespace-admin or instructor roles.
 */

import React, { useState, FormEvent } from 'react';

interface Namespace {
  id: string;
  displayName: string;
}

interface CreateInvitationFormProps {
  namespaces: Namespace[];
  onSubmit: (email: string, namespaceId: string, targetRole: 'namespace-admin' | 'instructor') => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export default function CreateInvitationForm({
  namespaces,
  onSubmit,
  onCancel,
  loading,
}: CreateInvitationFormProps) {
  const [email, setEmail] = useState('');
  const [namespaceId, setNamespaceId] = useState('');
  const [targetRole, setTargetRole] = useState<'namespace-admin' | 'instructor'>('instructor');
  const [error, setError] = useState('');

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate namespace
    if (!namespaceId) {
      setError('Please select a namespace');
      return;
    }

    try {
      await onSubmit(email.trim(), namespaceId, targetRole);
      // Clear form on success
      setEmail('');
      setNamespaceId('');
      setTargetRole('instructor');
    } catch (err) {
      // Error is handled by parent
      console.error('Failed to create invitation:', err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '1.5rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
      }}
    >
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
        Create New Invitation
      </h3>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div>
          <label
            htmlFor="invite-email"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}
          >
            Email Address
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '0.875rem',
              background: loading ? '#e9ecef' : 'white',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="invite-namespace"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}
          >
            Namespace
          </label>
          <select
            id="invite-namespace"
            value={namespaceId}
            onChange={(e) => setNamespaceId(e.target.value)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '0.875rem',
              background: loading ? '#e9ecef' : 'white',
            }}
          >
            <option value="">Select a namespace...</option>
            {namespaces.map((ns) => (
              <option key={ns.id} value={ns.id}>
                {ns.displayName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="invite-role"
            style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}
          >
            Role
          </label>
          <select
            id="invite-role"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as 'namespace-admin' | 'instructor')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '0.875rem',
              background: loading ? '#e9ecef' : 'white',
            }}
          >
            <option value="instructor">Instructor</option>
            <option value="namespace-admin">Namespace Admin</option>
          </select>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: 'white',
            color: '#495057',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: loading ? '#6c757d' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </form>
  );
}
