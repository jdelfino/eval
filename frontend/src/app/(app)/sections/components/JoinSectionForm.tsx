'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { getStudentRegistrationInfo } from '@/lib/api/registration';
import { formatJoinCodeInput, normalizeJoinCode } from '@/lib/join-code';
import type { RegisterStudentInfo } from '@/types/api';

interface JoinSectionFormProps {
  onSubmit: (join_code: string) => Promise<void>;
}

export default function JoinSectionForm({ onSubmit }: JoinSectionFormProps) {
  const [join_code, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<RegisterStudentInfo | null>(null);

  // Ref to track the most-recently-requested preview code for stale-response guard
  const latestPreviewCodeRef = useRef<string>('');

  // Live preview: debounced 400ms, only when code is format-valid (6 alphanum chars)
  useEffect(() => {
    const normalized = normalizeJoinCode(join_code);

    // Always advance the ref so any in-flight request for an old code is treated as stale
    latestPreviewCodeRef.current = normalized;

    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      // Clear preview immediately when code becomes format-invalid
      setPreview(null);
      return;
    }

    const requestedCode = normalized;

    const timer = setTimeout(async () => {
      try {
        const info = await getStudentRegistrationInfo(requestedCode);
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
    setLastSubmittedCode(codeToSubmit);

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

  // Retry handler: re-submits the last submitted code
  const handleRetry = useCallback(() => {
    if (lastSubmittedCode) {
      setJoinCode(lastSubmittedCode);
    }
    setError(null);
    handleSubmit();
  }, [lastSubmittedCode, handleSubmit]);

  const semester = preview?.section.semester;

  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
      }}
    >
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
          <Link
            href="/sections"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '7px 14px',
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              color: 'var(--fg)',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={submitting || !join_code.trim() || success}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--accent-fg)',
              cursor: submitting || !join_code.trim() || success ? 'not-allowed' : 'pointer',
              opacity: submitting || !join_code.trim() || success ? 0.55 : 1,
            }}
          >
            {submitting ? 'Joining…' : 'Join section'}
            {!submitting && <Icon name="arrowR" size={13} />}
          </button>
        </div>
      </form>
    </div>
  );
}
