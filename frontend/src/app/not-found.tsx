import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

/**
 * Global 404 page (App Router `not-found.tsx`).
 *
 * Renders the neutral 404 state on the shared EmptyState surface (NotFoundY in
 * v4-empty-error.jsx): a "404 · Not found" code badge, link-rot copy, and two
 * ramps — "Browse library" (the problem library) and "Back home".
 *
 * This is a public/global boundary: it must NOT assume AppShell chrome or auth,
 * so it renders a minimal centered layout of its own.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <EmptyState
        code="404 · Not found"
        icon="link"
        title="That page isn't here anymore."
        body="It may have been unpublished, deleted, or never existed at this URL. Check the link, or pick something from the library."
        primary={
          <Button variant="accent" asChild>
            <Link href="/instructor/problems">Browse library</Link>
          </Button>
        }
        secondary={
          <Button variant="quiet" asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    </main>
  );
}
