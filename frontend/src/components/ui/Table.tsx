'use client';

import React, { forwardRef, HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Text alignment options for table cells
 */
export type TableCellAlign = 'left' | 'center' | 'right';

/**
 * Props for the Table wrapper component
 */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Additional CSS classes */
  className?: string;
  /** Table content */
  children: React.ReactNode;
}

/**
 * Props for Table.Header component
 */
export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Additional CSS classes */
  className?: string;
  /** Header content */
  children: React.ReactNode;
}

/**
 * Props for Table.Body component
 */
export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Additional CSS classes */
  className?: string;
  /** Body content */
  children: React.ReactNode;
}

/**
 * Props for Table.Row component
 */
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Additional CSS classes */
  className?: string;
  /** Row content */
  children: React.ReactNode;
}

/**
 * Props for Table.HeaderCell component
 */
export interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment within the cell */
  align?: TableCellAlign;
  /** Additional CSS classes */
  className?: string;
  /** Cell content */
  children?: React.ReactNode;
}

/**
 * Props for Table.Cell component
 */
export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment within the cell */
  align?: TableCellAlign;
  /** Additional CSS classes */
  className?: string;
  /** Cell content */
  children?: React.ReactNode;
}

const alignmentStyles: Record<TableCellAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * Table Header section component
 */
const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        className={cn('bg-gray-50', className)}
        {...props}
      >
        {children}
      </thead>
    );
  }
);
TableHeader.displayName = 'Table.Header';

/**
 * Table Body section component
 */
const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={cn('divide-y divide-gray-200', className)}
        {...props}
      >
        {children}
      </tbody>
    );
  }
);
TableBody.displayName = 'Table.Body';

/**
 * Table Row component
 */
const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={cn('hover:bg-gray-50 transition-colors', className)}
        {...props}
      >
        {children}
      </tr>
    );
  }
);
TableRow.displayName = 'Table.Row';

/**
 * Table Header Cell component
 */
const TableHeaderCell = forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  ({ align = 'left', className, children, ...props }, ref) => {
    return (
      <th
        ref={ref}
        className={cn(
          'px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider',
          alignmentStyles[align],
          className
        )}
        {...props}
      >
        {children}
      </th>
    );
  }
);
TableHeaderCell.displayName = 'Table.HeaderCell';

/**
 * Table Cell component
 */
const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ align = 'left', className, children, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={cn(
          'px-4 py-3 text-sm text-gray-900',
          alignmentStyles[align],
          className
        )}
        {...props}
      >
        {children}
      </td>
    );
  }
);
TableCell.displayName = 'Table.Cell';

/**
 * Table component - a reusable data table with consistent styling
 *
 * Features:
 * - Responsive wrapper with horizontal scroll
 * - Compound components for Header, Body, Row, HeaderCell, and Cell
 * - Configurable text alignment per cell
 * - Consistent styling with hover states on rows
 *
 * @example
 * ```tsx
 * <Table>
 *   <Table.Header>
 *     <Table.Row>
 *       <Table.HeaderCell>Name</Table.HeaderCell>
 *       <Table.HeaderCell align="right">Amount</Table.HeaderCell>
 *     </Table.Row>
 *   </Table.Header>
 *   <Table.Body>
 *     <Table.Row>
 *       <Table.Cell>Item 1</Table.Cell>
 *       <Table.Cell align="right">$100</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table>
 * ```
 */
const TableBase = forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="overflow-x-auto">
        <table
          ref={ref}
          className={cn('min-w-full divide-y divide-gray-200', className)}
          {...props}
        >
          {children}
        </table>
      </div>
    );
  }
);
TableBase.displayName = 'Table';

// Create compound component
type TableComponent = typeof TableBase & {
  Header: typeof TableHeader;
  Body: typeof TableBody;
  Row: typeof TableRow;
  HeaderCell: typeof TableHeaderCell;
  Cell: typeof TableCell;
};

export const Table = TableBase as TableComponent;
Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.HeaderCell = TableHeaderCell;
Table.Cell = TableCell;

export default Table;
