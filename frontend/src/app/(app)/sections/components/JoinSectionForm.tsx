'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
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
  // When the code is invalid (404) or its section is inactive (400 "not active"),
  // we replace the form with a dedicated invalid/unavailable join-code state
  // instead of the inline danger Banner. The backend has no 403/"expired" code.
  const [invalidCode, setInvalidCode] = useState(false);

  // Ref to track the most-recently-requested preview code for stale-response guard
  const latestPreviewCodeRef = useRef<string>('');
  // Ref to the join-code input so "Try a new code" can refocus it.
  const inputRef = useRef<HTMLInputElement>(null);

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
      const lower = errorMessage.toLowerCase();
      if (
        lower.includes('not found') ||
        lower.includes('invalid') ||
        lower.includes('not active')
      ) {
        // Bad code (404) or inactive section (400) → dedicated invalid/unavailable state.
        setInvalidCode(true);
      } else if (lower.includes('already')) {
        setError('You are already a member of this section.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  }, [join_code, onSubmit]);

  // "Try a new code": leave the invalid state, clear the field, and refocus it.
  const handleTryNewCode = useCallback(() => {
    setInvalidCode(false);
    setJoinCode('');
    setError(null);
    // Refocus on the next tick once the form is re-rendered.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Retry handler: re-submits the current code
  const handleRetry = useCallback(() => {
    setError(null);
    handleSubmit();
  }, [handleSubmit]);

  const semester = preview?.section.semester;
  const disabled = submitting || !join_code.trim() || success;

  if (invalidCode) {
    return (
      <AuthCard>
        <EmptyState
          code="404 · Join code"
          icon="lock"
          tone="warn"
          title="That join code isn't available."
          body="The code may be wrong, or its section may have been turned off. Check with your teacher for the current code, or try another one."
          primary={
            <Button variant="accent" onClick={handleTryNewCode}>
              Try a new code
              <Icon name="arrowR" size={13} />
            </Button>
          }
          secondary={
            <Button variant="quiet" asChild>
              <Link href="/auth/signin">Sign in instead</Link>
            </Button>
          }
        />
      </AuthCard>
    );
  }

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
                  className="text-danger"
                  style={{
                    background: 'none',
                    border: 'none',
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
            ref={inputRef}
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
            className="bg-accent-soft border border-accent-soft text-accent-ink"
            style={{
              marginTop: 4,
              padding: 12,
              borderRadius: 'var(--radius)',
              fontSize: 12.5,
            }}
          >
            <div style={{ fontWeight: 600 }}>{preview.class.name}</div>
            <div className="text-fg-muted" style={{ marginTop: 2 }}>
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
