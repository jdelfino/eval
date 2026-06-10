/**
 * Public problem page (unauthenticated)
 *
 * Displays problem title and description.
 * Includes a self-link for copy/paste into slides.
 * Server-rendered with OG meta tags for link previews.
 *
 * Fetches data from the Go backend public API via typed client.
 *
 * Note: Solution is never shown on the public page (eval-e81 fix, folded into G3).
 * Full hero reskin with tests list and meta line is in A3.
 */

import { cache, Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import InstructorActions from './InstructorActions';
import StudentActions from './StudentActions';
import { getPublicProblem } from '@/lib/api/problems';
import type { PublicProblem } from '@/types/api';

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

export default async function PublicProblemPage({ params }: Params) {
  const { id } = await params;
  const problem = await getProblem(id);

  if (!problem) {
    notFound();
  }

  const className = problem.class_name || '';

  const publicUrl = `/problems/${problem.id}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{problem.title}</h1>

      <a href={publicUrl} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        Link to this problem
      </a>

      <Suspense fallback={null}>
        <InstructorActions problem_id={problem.id} problem_title={problem.title} class_id={problem.class_id} className={className} />
      </Suspense>

      <Suspense fallback={null}>
        <StudentActions problem_id={problem.id} class_id={problem.class_id} />
      </Suspense>

      {problem.description && (
        <div className="mb-8">
          <MarkdownContent content={problem.description} />
        </div>
      )}

    </div>
  );
}
