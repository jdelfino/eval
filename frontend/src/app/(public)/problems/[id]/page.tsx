/**
 * Public problem page (unauthenticated)
 *
 * Displays problem title, description, and a click-to-reveal solution
 * with syntax highlighting. Includes a self-link for copy/paste into slides.
 * Server-rendered with OG meta tags for link previews.
 *
 * Fetches data from the Go backend public API via typed client.
 */

import { cache, Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { codeToHtml } from 'shiki';
import MarkdownContent from '@/components/MarkdownContent';
import SolutionBlock from './SolutionBlock';
import InstructorActions from './InstructorActions';
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

  let solutionHtml: string | null = null;
  if (problem.solution) {
    const rawHtml = await codeToHtml(problem.solution, {
      lang: 'python',
      theme: 'github-light',
    });
    // Strip background color from shiki output so copied text has no background
    solutionHtml = rawHtml.replace(/background-color:\s*#[^;"']+;?/g, '');
  }

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

      {problem.description && (
        <div className="mb-8">
          <MarkdownContent content={problem.description} />
        </div>
      )}

      {solutionHtml && (
        <details className="mb-8">
          <summary className="cursor-pointer text-lg font-semibold text-gray-700 hover:text-gray-900 select-none">
            Show Solution
          </summary>
          <SolutionBlock html={solutionHtml} />
        </details>
      )}

    </div>
  );
}
