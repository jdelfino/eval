'use client';

/**
 * Page breadcrumb component.
 * Auto-generates breadcrumbs from navigation hierarchy or accepts custom items.
 */

import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
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
    <nav className="flex items-center text-sm" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1">
        {/* Home link */}
        <li>
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Home"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
          </Link>
        </li>

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
              {isLast || !item.href ? (
                <span
                  className="px-1 py-0.5 text-gray-900 font-medium"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="px-1 py-0.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
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
