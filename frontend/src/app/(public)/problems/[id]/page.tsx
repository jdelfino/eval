/**
 * Public problem page (unauthenticated) — A3 hero reskin
 *
 * Layout (v4 design):
 *   - Hero: serif title (AuthHeading), tag pills, meta line
 *     "python 3.11 · N tests · authored by X · updated <date>"
 *   - Tests list: one row per test_cases entry — kind pill + name + mono summary
 *   - Persona CTAs: anon → sign-in; instructor → InstructorActions; student → StudentActions
 *
 * No 'At a glance' aside; no solution affordance; no difficulty/attempts/time-limit.
 * Solution removal (eval-e81 fix) shipped in A1.
 */

import { cache, Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import MarkdownContent from '@/components/MarkdownContent';
import { AuthHeading } from '@/components/ui/AuthHeading';
import { Pill } from '@/components/ui/Pill';
import InstructorActions from './InstructorActions';
import StudentActions from './StudentActions';
import { getPublicProblem } from '@/lib/api/problems';
import { getLanguageVersion } from '@/lib/languageVersions';
import type { PublicProblem, PublicTestCaseSummary } from '@/types/api';

type Params = {
  params: Promise<{ id: string }>;
};

const getProblem = cache(async function getProblem(id: string): Promise<PublicProblem | null> {
  return getPublicProblem(id, { next: { revalidate: 60 } } as RequestInit);
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const problem = await getProblem(id);

  if (!problem) {
    return { title: 'Problem Not Found' };
  }

  return {
    title: problem.title,
    openGraph: {
      title: problem.title,
      description: problem.description || '',
    },
  };
}

/** Format an ISO date string as "Jan 15, 2026" */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Build the meta line segments: "python 3.11 · 3 tests · authored by X · updated Jan 15, 2026" */
function buildMetaLine(problem: PublicProblem): string {
  const version = getLanguageVersion(problem.language);
  const langSegment = version ? `${problem.language} ${version}` : problem.language;
  const testSegment = `${problem.test_cases.length} tests`;
  const authorSegment = problem.author_name ? `authored by ${problem.author_name}` : null;
  const dateSegment = `updated ${formatDate(problem.updated_at)}`;

  return [langSegment, testSegment, authorSegment, dateSegment]
    .filter(Boolean)
    .join(' · ');
}

/** Pill tone for each test kind */
const KIND_TONE: Record<string, 'info' | 'ok' | 'neutral'> = {
  io: 'info',
  pytest: 'ok',
};

function TestRow({ test, last }: { test: PublicTestCaseSummary; last: boolean }) {
  const tone = KIND_TONE[test.kind] ?? 'neutral';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      <Pill tone={tone} mono>
        {test.kind}
      </Pill>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{test.name}</span>
      <span style={{ flex: 1 }} />
      {test.summary && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--fg-muted)',
            maxWidth: 480,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {test.summary}
        </span>
      )}
    </div>
  );
}

export default async function PublicProblemPage({ params }: Params) {
  const { id } = await params;
  const problem = await getProblem(id);

  if (!problem) {
    notFound();
  }

  const publicUrl = `/problems/${problem.id}`;
  const metaLine = buildMetaLine(problem);
  const className = problem.class_name || '';

  return (
    <div>
      {/* Hero */}
      <div
        style={{
          padding: '32px 64px 28px 64px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <div style={{ maxWidth: 1100 }}>
          {/* Tag pills row */}
          {problem.tags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {problem.tags.map((tag) => (
                <Pill key={tag} tone="neutral" mono>
                  {tag}
                </Pill>
              ))}
            </div>
          )}

          {/* Serif title */}
          <AuthHeading size="lg" style={{ fontSize: 32, letterSpacing: -0.6, marginBottom: 6 }}>
            {problem.title}
          </AuthHeading>

          {/* Meta line */}
          <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 6 }}>
            {metaLine}
          </div>

          {/* Self-link */}
          <div style={{ marginTop: 8 }}>
            <a
              href={publicUrl}
              style={{ fontSize: 12, color: 'var(--fg-muted)', textDecoration: 'none' }}
            >
              Link to this problem
            </a>
          </div>
        </div>
      </div>

      {/* Page body */}
      <div style={{ padding: '28px 64px 64px 64px', maxWidth: 1180 }}>
        {/* Persona CTAs */}
        {!problem.class_id && (
          <div style={{ marginBottom: 24 }}>
            <Link
              href="/auth/signin"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                borderRadius: 'var(--radius)',
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
          </div>
        )}

        {problem.class_id && (
          <>
            <Suspense fallback={null}>
              <InstructorActions
                problem_id={problem.id}
                problem_title={problem.title}
                class_id={problem.class_id}
                className={className}
              />
            </Suspense>

            <Suspense fallback={null}>
              <StudentActions problem_id={problem.id} class_id={problem.class_id} />
            </Suspense>
          </>
        )}

        {/* Problem statement */}
        {problem.description && (
          <section style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: 'uppercase' as const,
                color: 'var(--fg-muted)',
                marginBottom: 10,
              }}
            >
              Statement
            </div>
            <div
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '22px 28px',
              }}
            >
              <MarkdownContent content={problem.description} />
            </div>
          </section>
        )}

        {/* Tests list */}
        <section>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: 'uppercase' as const,
              color: 'var(--fg-muted)',
              marginBottom: 10,
            }}
          >
            Tests
          </div>
          {problem.test_cases.length > 0 ? (
            <div
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              {problem.test_cases.map((test, i) => (
                <TestRow
                  key={i}
                  test={test}
                  last={i === problem.test_cases.length - 1}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No test cases.</div>
          )}
        </section>
      </div>
    </div>
  );
}
