/**
 * Tests for EditorContainer component
 *
 * Ensures the wrapper component enforces correct patterns for CodeEditor
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EditorContainer } from '../EditorContainer';

describe('EditorContainer', () => {
  describe('Fixed height variant (default)', () => {
    it('should apply default 500px height', () => {
      const { container } = render(
        <EditorContainer>
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ height: '500px' });
    });

    it('should apply custom height', () => {
      const { container } = render(
        <EditorContainer height="600px">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ height: '600px' });
    });

    it('should not have flex properties', () => {
      const { container } = render(
        <EditorContainer height="500px">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toHaveStyle({ flex: '1' });
      expect(wrapper).not.toHaveStyle({ minHeight: '0' });
    });
  });

  describe('Flex variant', () => {
    it('should apply flex classes', () => {
      const { container } = render(
        <EditorContainer variant="flex">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-1');
      expect(wrapper).toHaveClass('min-h-0');
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('flex-col');
    });

    it('should not have fixed height', () => {
      const { container } = render(
        <EditorContainer variant="flex">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      // Height should not be set inline for flex variant
      expect(wrapper.style.height).toBe('');
    });
  });

  describe('ClassName merging', () => {
    it('should allow additional CSS classes for fixed variant', () => {
      const { container } = render(
        <EditorContainer height="500px" className="mt-4">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ height: '500px' });
      expect(wrapper).toHaveClass('mt-4');
    });

    it('should allow additional CSS classes for flex variant', () => {
      const { container } = render(
        <EditorContainer variant="flex" className="p-4">
          <div data-testid="child">Content</div>
        </EditorContainer>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-1');
      expect(wrapper).toHaveClass('min-h-0');
      expect(wrapper).toHaveClass('p-4');
    });
  });

  describe('Children rendering', () => {
    it('should render children correctly', () => {
      const { getByTestId } = render(
        <EditorContainer>
          <div data-testid="test-child">Test Content</div>
        </EditorContainer>
      );

      expect(getByTestId('test-child')).toBeInTheDocument();
      expect(getByTestId('test-child')).toHaveTextContent('Test Content');
    });

    it('should support multiple children', () => {
      const { getByTestId } = render(
        <EditorContainer>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </EditorContainer>
      );

      expect(getByTestId('child-1')).toBeInTheDocument();
      expect(getByTestId('child-2')).toBeInTheDocument();
    });
  });
});
