'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { getStudentRegistrationInfo } from '@/lib/api/registration';
import { formatJoinCodeInput, formatJoinCodeForDisplay, normalizeJoinCode, isCompleteJoinCode } from '@/lib/join-code';
import type { RegisterStudentInfo } from '@/types/api';

interface JoinSectionFormProps {
  onSubmit: (join_code: string) => Promise<void>;
}

export default function JoinSectionForm({ onSubmit }: JoinSectionFormProps) {
  const [join_code, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<RegisterStudentInfo | null>(null);

  // Ref to track the most-recently-requested preview code for stale-response guard
  const latestPreviewCodeRef = useRef<string>('');

  // Live preview: debounced 400ms, only when code is format-valid (6 alphanum chars)
  useEffect(() => {
    const normalized = normalizeJoinCode(join_code);

    // Always advance the ref so any in-flight request for an old code is treated as stale
    latestPreviewCodeRef.current = normalized;

    if (!isCompleteJoinCode(normalized)) {
      // Clear preview immediately when code becomes format-invalid
      setPreview(null);
      return;
    }

    const requestedCode = normalized;
    // Backend stores join codes with dash (ABC-123); send the dashed display format
    const dashedCode = formatJoinCodeForDisplay(normalized);

    const timer = setTimeout(async () => {
      try {
        const info = await getStudentRegistrationInfo(dashedCode);
        // Guard stale responses: only apply if this is still the latest requested code
        if (latestPreviewCodeRef.current === requestedCode) {
          setPreview(info);
        }
      } catch {
        // Preview errors are silent — submit path surfaces real errors
        if (latestPreviewCodeRef.current === requestedCode) {
          setPreview(null);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [join_code]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const codeToSubmit = join_code.trim();
    if (!codeToSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await onSubmit(codeToSubmit);
      setSuccess(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join section';
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
  }, [join_code, onSubmit]);

  // Retry handler: re-submits the current code
  const handleRetry = useCallback(() => {
    setError(null);
    handleSubmit();
  }, [handleSubmit]);

  const semester = preview?.section.semester;
  const disabled = submitting || !join_code.trim() || success;

  return (
    <AuthCard>
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ marginBottom: 16 }}>
            <Banner
              tone="danger"
              icon="alert"
              title="Couldn't join."
              body={error}
              action={
                <button
                  type="button"
                  onClick={handleRetry}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--danger)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 12,
                  }}
                >
                  Try again
                </button>
              }
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {success && (
          <div style={{ marginBottom: 16 }}>
            <Banner
              tone="run"
              icon="check"
              title="Joined!"
              body="Redirecting…"
            />
          </div>
        )}

        <Field label="Join code" hint="6 letters and digits, like ABC-123">
          <Input
            id="join_code"
            mono
            placeholder="ABC-123"
            autoFocus
            value={join_code}
            onChange={(e) => setJoinCode(formatJoinCodeInput(e.target.value))}
            disabled={submitting || success}
          />
        </Field>

        {preview && (
          <div
            style={{
              marginTop: 4,
              padding: 12,
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent-soft)',
              borderRadius: 'var(--radius)',
              fontSize: 12.5,
              color: 'var(--accent-ink)',
            }}
          >
            <div style={{ fontWeight: 600 }}>{preview.class.name}</div>
            <div style={{ color: 'var(--fg-muted)', marginTop: 2 }}>
              Section: {preview.section.name}{semester ? ` · ${semester}` : ''}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            marginTop: 20,
          }}
        >
          <Button variant="quiet" asChild>
            <Link href="/sections">Cancel</Link>
          </Button>

          <Button
            type="submit"
            variant="accent"
            disabled={disabled}
            loading={submitting}
          >
            {submitting ? 'Joining…' : 'Join section'}
            {!submitting && <Icon name="arrowR" size={13} />}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
