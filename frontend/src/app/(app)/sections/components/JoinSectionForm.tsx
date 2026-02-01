'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { ErrorAlert } from '@/components/ErrorAlert';
import { BackButton } from '@/components/ui/BackButton';

interface JoinSectionFormProps {
  onSubmit: (joinCode: string) => Promise<void>;
}

export default function JoinSectionForm({ onSubmit }: JoinSectionFormProps) {
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const codeToSubmit = joinCode.trim();
    if (!codeToSubmit) {
      setError('Join code is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);
    setLastSubmittedCode(codeToSubmit);

    try {
      await onSubmit(codeToSubmit);
      setSuccess(true);
      setJoinCode('');
      // Note: Parent component handles redirect to /sections
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join section';
      // Provide more specific messages for common errors
      if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('invalid')) {
        setError('Invalid join code. Please check the code and try again.');
      } else if (errorMessage.toLowerCase().includes('already')) {
        setError('You are already a member of this section.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  }, [joinCode, onSubmit]);

  // Retry handler for the ErrorAlert component
  const handleRetry = useCallback(() => {
    if (lastSubmittedCode) {
      setJoinCode(lastSubmittedCode);
    }
    handleSubmit();
  }, [lastSubmittedCode, handleSubmit]);

  return (
    <div className="max-w-md mx-auto">
      <Card variant="default" className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Join a Section</h2>
            <p className="text-gray-600">Enter the join code provided by your instructor</p>
          </div>

          {error && (
            <ErrorAlert
              error={error}
              onRetry={handleRetry}
              isRetrying={submitting}
              onDismiss={() => setError(null)}
            />
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              Successfully joined section! Redirecting...
            </div>
          )}

          <div>
            <label htmlFor="joinCode" className="block text-sm font-medium text-gray-700 mb-2">
              Join Code
            </label>
            <input
              id="joinCode"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g., ABC-123"
              className="w-full px-4 py-3 text-lg font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-wider"
              disabled={submitting || success}
              required
              maxLength={10}
            />
            <p className="mt-2 text-sm text-gray-500">
              Enter the join code from your instructor
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !joinCode.trim() || success}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Joining...' : success ? 'Joined!' : 'Join Section'}
          </button>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600">
              After joining, you'll see this section in your dashboard and can participate in coding sessions.
            </p>
          </div>

          <div className="flex justify-center">
            <BackButton href="/sections" size="sm">Back to My Sections</BackButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
