import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Card } from '../Card';

describe('Card', () => {
  describe('Basic rendering', () => {
    it('renders children correctly', () => {
      render(<Card>Test content</Card>);
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('passes through additional HTML attributes', () => {
      render(
        <Card data-testid="test-card" role="article">
          Content
        </Card>
      );
      const card = screen.getByTestId('test-card');
      expect(card).toHaveAttribute('role', 'article');
    });
  });

  describe('Compound components', () => {
    it('renders all compound components together', () => {
      render(
        <Card variant="elevated">
          <Card.Header>Card Title</Card.Header>
          <Card.Body>Card content goes here</Card.Body>
          <Card.Footer>Card actions</Card.Footer>
        </Card>
      );

      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card content goes here')).toBeInTheDocument();
      expect(screen.getByText('Card actions')).toBeInTheDocument();
    });
  });

  describe('Ref forwarding', () => {
    it('forwards ref to Card', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Card ref={ref}>Content</Card>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Usage patterns', () => {
    it('supports interactive card patterns', () => {
      const handleClick = jest.fn();
      render(
        <Card onClick={handleClick} role="button" tabIndex={0}>
          Clickable card
        </Card>
      );
      const card = screen.getByRole('button');
      card.click();
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
