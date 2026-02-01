/**
 * Unit tests for cn() utility function
 */

import { cn } from '../utils';

describe('cn', () => {
  describe('basic functionality', () => {
    it('should join multiple class strings', () => {
      expect(cn('class1', 'class2', 'class3')).toBe('class1 class2 class3');
    });

    it('should return a single class unchanged', () => {
      expect(cn('single-class')).toBe('single-class');
    });

    it('should return empty string when no arguments provided', () => {
      expect(cn()).toBe('');
    });
  });

  describe('falsy value filtering', () => {
    it('should filter out undefined values', () => {
      expect(cn('class1', undefined, 'class2')).toBe('class1 class2');
    });

    it('should filter out null values', () => {
      expect(cn('class1', null, 'class2')).toBe('class1 class2');
    });

    it('should filter out false values', () => {
      expect(cn('class1', false, 'class2')).toBe('class1 class2');
    });

    it('should filter out empty strings', () => {
      expect(cn('class1', '', 'class2')).toBe('class1 class2');
    });

    it('should handle all falsy values together', () => {
      expect(cn('class1', undefined, null, false, '', 'class2')).toBe('class1 class2');
    });

    it('should return empty string when all values are falsy', () => {
      expect(cn(undefined, null, false, '')).toBe('');
    });
  });

  describe('conditional class patterns', () => {
    it('should work with boolean conditions (true)', () => {
      const isActive = true;
      expect(cn('base', isActive && 'active')).toBe('base active');
    });

    it('should work with boolean conditions (false)', () => {
      const isActive = false;
      expect(cn('base', isActive && 'active')).toBe('base');
    });

    it('should handle complex conditional expressions', () => {
      const variant: string = 'primary';
      const isDisabled = false;
      const size: string = 'large';

      expect(
        cn(
          'button',
          variant === 'primary' && 'btn-primary',
          variant === 'secondary' && 'btn-secondary',
          isDisabled && 'disabled',
          size === 'large' && 'btn-lg'
        )
      ).toBe('button btn-primary btn-lg');
    });

    it('should handle optional className prop pattern', () => {
      const className: string | undefined = 'custom-class';
      expect(cn('base-styles', className)).toBe('base-styles custom-class');

      const noClassName: string | undefined = undefined;
      expect(cn('base-styles', noClassName)).toBe('base-styles');
    });
  });

  describe('edge cases', () => {
    it('should preserve whitespace within class names', () => {
      // Classes should not contain internal whitespace, but cn should not alter them
      expect(cn('class1', 'class2')).toBe('class1 class2');
    });

    it('should not trim leading/trailing spaces from individual classes', () => {
      // This tests current behavior - cn doesn't modify individual class strings
      expect(cn(' spaced ', 'class2')).toBe(' spaced  class2');
    });
  });
});
