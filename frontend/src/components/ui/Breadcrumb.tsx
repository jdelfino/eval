'use client';

import React from 'react';
import Link from 'next/link';

/**
 * Breadcrumb item interface
 */
export interface BreadcrumbItem {
  /** Display label for the breadcrumb item */
  label: string;
  /** Optional href for navigation. If omitted, item is not clickable (current page) */
  href?: string;
}

/**
 * Props for Breadcrumb component
 */
export interface BreadcrumbProps {
  /** Array of breadcrumb items from root to current page */
  items: BreadcrumbItem[];
  /** Separator character between items */
  separator?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Breadcrumb navigation component for showing page hierarchy
 *
 * Features:
 * - Accepts array of {label, href?} items
 * - Last item is current page (not clickable)
 * - Configurable separator character (default: /)
 * - Responsive: collapses middle items on small screens if more than 3 items
 *
 * @example
 * ```tsx
 * <Breadcrumb items={[
 *   { label: 'Classes', href: '/instructor?view=classes' },
 *   { label: 'CS 101', href: '/instructor?view=sections&classId=...' },
 *   { label: 'Section A' }
 * ]} />
 * ```
 */
export function Breadcrumb({
  items,
  separator = '/',
  className = '',
}: BreadcrumbProps) {
  if (items.length === 0) {
    return null;
  }

  // Determine if we need to collapse middle items (more than 3 items)
  const shouldCollapse = items.length > 3;

  // Get visible items for collapsed view
  const getCollapsedItems = (): (BreadcrumbItem | 'ellipsis')[] => {
    if (!shouldCollapse) {
      return items;
    }
    // Show first item, ellipsis, and last two items
    return [items[0], 'ellipsis', items[items.length - 2], items[items.length - 1]];
  };

  const collapsedItems = getCollapsedItems();

  const renderItem = (item: BreadcrumbItem, index: number, isLast: boolean) => {
    const isCurrentPage = isLast || !item.href;

    if (isCurrentPage || !item.href) {
      return (
        <span
          className="text-gray-900 font-medium"
          aria-current="page"
        >
          {item.label}
        </span>
      );
    }

    return (
      <Link
        href={item.href}
        className="text-gray-500 hover:text-gray-700 transition-colors"
      >
        {item.label}
      </Link>
    );
  };

  const renderSeparator = () => (
    <span
      className="mx-2 text-gray-400"
      aria-hidden="true"
    >
      {separator}
    </span>
  );

  const renderEllipsis = () => (
    <span className="text-gray-400">...</span>
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-sm ${className}`.trim()}
    >
      {/* Full view for larger screens */}
      {shouldCollapse && (
        <ol className="hidden md:flex items-center list-none m-0 p-0">
          {items.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && renderSeparator()}
              {renderItem(item, index, index === items.length - 1)}
            </li>
          ))}
        </ol>
      )}

      {/* Collapsed view for small screens (or only view if not collapsing) */}
      <ol className={`flex items-center list-none m-0 p-0 ${shouldCollapse ? 'md:hidden' : ''}`}>
        {collapsedItems.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && renderSeparator()}
            {item === 'ellipsis' ? (
              renderEllipsis()
            ) : (
              renderItem(item, index, index === collapsedItems.length - 1)
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
