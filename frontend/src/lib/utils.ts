/**
 * Utility function for conditionally joining CSS class names
 *
 * @param classes - Variable number of class names that can be strings, undefined, null, or false
 * @returns A single string with all truthy class names joined by spaces
 *
 * @example
 * ```tsx
 * cn('base-class', isActive && 'active', className)
 * // Returns 'base-class active custom-class' if isActive is true and className is 'custom-class'
 * // Returns 'base-class' if isActive is false and className is undefined
 * ```
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
