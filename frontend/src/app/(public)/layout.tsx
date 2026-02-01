/**
 * Layout for public pages (unauthenticated).
 * Minimal wrapper with no sidebar or header.
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
