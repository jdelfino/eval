'use client';

/**
 * Page breadcrumb component.
 * Auto-generates breadcrumbs from navigation hierarchy or accepts custom items.
 */

import Link from 'next/link';
import { useBreadcrumbs, BreadcrumbItem } from '@/hooks/useBreadcrumbs';

interface PageBreadcrumbProps {
  /** Override automatic breadcrumb with custom items */
  items?: BreadcrumbItem[];
}

export function PageBreadcrumb({ items }: PageBreadcrumbProps) {
  const autoBreadcrumbs = useBreadcrumbs();
  const breadcrumbs = items || autoBreadcrumbs;

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav
      className="text-fg-muted"
      style={{ display: 'flex', alignItems: 'center', fontSize: 12.5 }}
      aria-label="Breadcrumb"
    >
      <ol style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {index > 0 && (
                <span aria-hidden="true" style={{ opacity: 0.4 }}>/</span>
              )}
              {isLast || !item.href ? (
                <span
                  className="text-fg"
                  style={{ fontWeight: 500 }}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-fg-muted"
                  style={{ fontWeight: 400, textDecoration: 'none' }}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
