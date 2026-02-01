import React, { forwardRef, HTMLAttributes } from 'react';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'flat';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style variant of the card */
  variant?: CardVariant;
  /** Additional CSS classes */
  className?: string;
  /** Card content */
  children: React.ReactNode;
}

export interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Additional CSS classes */
  className?: string;
  /** Section content */
  children: React.ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow',
  elevated: 'bg-white border border-gray-100 rounded-xl shadow-2xl',
  outlined: 'bg-transparent border border-gray-200 rounded-lg',
  flat: 'bg-white border border-gray-200',
};

/**
 * Card Header component for title/heading content
 */
const CardHeader = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-6 py-4 border-b border-gray-200 ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardHeader.displayName = 'Card.Header';

/**
 * Card Body component for main content
 */
const CardBody = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`p-6 ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardBody.displayName = 'Card.Body';

/**
 * Card Footer component for actions/secondary content
 */
const CardFooter = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardFooter.displayName = 'Card.Footer';

/**
 * Card component - a reusable container with consistent styling
 *
 * @example
 * // Simple usage
 * <Card variant="default" className="p-4">Content</Card>
 *
 * @example
 * // With compound components
 * <Card variant="elevated">
 *   <Card.Header>Title</Card.Header>
 *   <Card.Body>Content</Card.Body>
 *   <Card.Footer>Actions</Card.Footer>
 * </Card>
 */
const CardBase = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    const baseStyles = variantStyles[variant];

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardBase.displayName = 'Card';

// Create compound component
type CardComponent = typeof CardBase & {
  Header: typeof CardHeader;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
};

export const Card = CardBase as CardComponent;
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
