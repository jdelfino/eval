/**
 * Unit tests for Skeleton component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonAvatar } from '../Skeleton';

describe('Skeleton', () => {
  describe('rendering', () => {
    it('should render as a div element', () => {
      const { container } = render(<Skeleton />);

      expect(container.querySelector('div')).toBeInTheDocument();
    });

    it('should be hidden from screen readers', () => {
      const { container } = render(<Skeleton />);

      const skeleton = container.querySelector('div');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have presentation role', () => {
      render(<Skeleton />);

      expect(screen.getByRole('presentation', { hidden: true })).toBeInTheDocument();
    });
  });

  describe('animation', () => {
    it('should have animate-pulse class', () => {
      const { container } = render(<Skeleton />);

      expect(container.querySelector('div')).toHaveClass('animate-pulse');
    });

    it('should have gray background', () => {
      const { container } = render(<Skeleton />);

      expect(container.querySelector('div')).toHaveClass('bg-gray-200');
    });
  });

  describe('rounded prop', () => {
    it('should have rounded class by default', () => {
      const { container } = render(<Skeleton />);

      expect(container.querySelector('div')).toHaveClass('rounded');
    });

    it('should not have rounded class when rounded is false', () => {
      const { container } = render(<Skeleton rounded={false} />);

      expect(container.querySelector('div')).not.toHaveClass('rounded');
    });
  });

  describe('custom className', () => {
    it('should apply custom className for dimensions', () => {
      const { container } = render(<Skeleton className="h-4 w-32" />);

      const skeleton = container.querySelector('div');
      expect(skeleton).toHaveClass('h-4', 'w-32');
    });

    it('should allow custom rounded-full override', () => {
      const { container } = render(<Skeleton className="h-10 w-10 rounded-full" />);

      const skeleton = container.querySelector('div');
      expect(skeleton).toHaveClass('rounded-full');
    });

    it('should apply full width', () => {
      const { container } = render(<Skeleton className="h-20 w-full" />);

      expect(container.querySelector('div')).toHaveClass('w-full');
    });
  });
});

describe('SkeletonText', () => {
  describe('rendering', () => {
    it('should render 3 lines by default', () => {
      const { container } = render(<SkeletonText />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons).toHaveLength(3);
    });

    it('should render specified number of lines', () => {
      const { container } = render(<SkeletonText lines={5} />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons).toHaveLength(5);
    });

    it('should have space-y-2 gap between lines', () => {
      const { container } = render(<SkeletonText />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('space-y-2');
    });
  });

  describe('line widths', () => {
    it('should have last line shorter than others', () => {
      const { container } = render(<SkeletonText lines={3} />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      // First two lines should be full width
      expect(skeletons[0]).toHaveClass('w-full');
      expect(skeletons[1]).toHaveClass('w-full');
      // Last line should be 3/4 width
      expect(skeletons[2]).toHaveClass('w-3/4');
    });
  });

  describe('accessibility', () => {
    it('should be hidden from screen readers', () => {
      const { container } = render(<SkeletonText />);

      expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have presentation role on wrapper', () => {
      const { container } = render(<SkeletonText />);

      expect(container.firstChild).toHaveAttribute('role', 'presentation');
    });
  });

  describe('custom className', () => {
    it('should apply custom className to wrapper', () => {
      const { container } = render(<SkeletonText className="mt-4" />);

      expect(container.firstChild).toHaveClass('mt-4');
    });
  });
});

describe('SkeletonAvatar', () => {
  describe('sizes', () => {
    it('should apply small size classes', () => {
      const { container } = render(<SkeletonAvatar size="sm" />);

      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toHaveClass('h-8', 'w-8');
    });

    it('should apply medium size classes by default', () => {
      const { container } = render(<SkeletonAvatar />);

      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toHaveClass('h-10', 'w-10');
    });

    it('should apply large size classes', () => {
      const { container } = render(<SkeletonAvatar size="lg" />);

      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toHaveClass('h-12', 'w-12');
    });
  });

  describe('shape', () => {
    it('should be circular (rounded-full)', () => {
      const { container } = render(<SkeletonAvatar />);

      expect(container.querySelector('.animate-pulse')).toHaveClass('rounded-full');
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<SkeletonAvatar className="mr-2" />);

      expect(container.querySelector('.animate-pulse')).toHaveClass('mr-2');
    });
  });
});
