/**
 * Unit tests for Table component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Table } from '../Table';

describe('Table', () => {
  describe('basic rendering', () => {
    it('should render a table element', () => {
      render(
        <Table data-testid="test-table">
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </Table>
      );

      const table = screen.getByTestId('test-table');
      expect(table.tagName).toBe('TABLE');
    });

    it('should wrap table in overflow container for responsiveness', () => {
      render(
        <Table data-testid="test-table">
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </Table>
      );

      const table = screen.getByTestId('test-table');
      expect(table.parentElement).toHaveClass('overflow-x-auto');
    });

    it('should apply custom className', () => {
      render(
        <Table className="custom-table-class" data-testid="test-table">
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </Table>
      );

      expect(screen.getByTestId('test-table')).toHaveClass('custom-table-class');
    });

    it('should pass through additional HTML attributes', () => {
      render(
        <Table data-testid="test-table" aria-label="Test table">
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </Table>
      );

      expect(screen.getByTestId('test-table')).toHaveAttribute('aria-label', 'Test table');
    });
  });

  describe('compound components', () => {
    it('should render all compound components together', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>John Doe</Table.Cell>
              <Table.Cell>john@example.com</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });

    it('should render Table.Header as thead element', () => {
      render(
        <Table>
          <Table.Header data-testid="header">
            <Table.Row>
              <Table.HeaderCell>Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('header').tagName).toBe('THEAD');
    });

    it('should render Table.Body as tbody element', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body data-testid="body">
            <Table.Row>
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('body').tagName).toBe('TBODY');
    });

    it('should render Table.Row as tr element', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row data-testid="row">
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('row').tagName).toBe('TR');
    });

    it('should render Table.HeaderCell as th element', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell data-testid="header-cell">Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header-cell').tagName).toBe('TH');
    });

    it('should render Table.Cell as td element', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell data-testid="cell">Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('cell').tagName).toBe('TD');
    });
  });

  describe('cell alignment', () => {
    it('should default to left alignment for header cells', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell data-testid="header-cell">Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header-cell')).toHaveClass('text-left');
    });

    it('should default to left alignment for body cells', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell data-testid="cell">Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('cell')).toHaveClass('text-left');
    });

    it('should support center alignment for header cells', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell align="center" data-testid="header-cell">
                Column
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header-cell')).toHaveClass('text-center');
    });

    it('should support right alignment for header cells', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell align="right" data-testid="header-cell">
                Column
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header-cell')).toHaveClass('text-right');
    });

    it('should support center alignment for body cells', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell align="center" data-testid="cell">
                Content
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('cell')).toHaveClass('text-center');
    });

    it('should support right alignment for body cells', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell align="right" data-testid="cell">
                Content
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('cell')).toHaveClass('text-right');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to Table', () => {
      const ref = React.createRef<HTMLTableElement>();
      render(
        <Table ref={ref}>
          <tbody>
            <tr>
              <td>Content</td>
            </tr>
          </tbody>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableElement);
    });

    it('should forward ref to Table.Header', () => {
      const ref = React.createRef<HTMLTableSectionElement>();
      render(
        <Table>
          <Table.Header ref={ref}>
            <Table.Row>
              <Table.HeaderCell>Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableSectionElement);
    });

    it('should forward ref to Table.Body', () => {
      const ref = React.createRef<HTMLTableSectionElement>();
      render(
        <Table>
          <Table.Body ref={ref}>
            <Table.Row>
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableSectionElement);
    });

    it('should forward ref to Table.Row', () => {
      const ref = React.createRef<HTMLTableRowElement>();
      render(
        <Table>
          <Table.Body>
            <Table.Row ref={ref}>
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableRowElement);
    });

    it('should forward ref to Table.HeaderCell', () => {
      const ref = React.createRef<HTMLTableCellElement>();
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell ref={ref}>Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableCellElement);
    });

    it('should forward ref to Table.Cell', () => {
      const ref = React.createRef<HTMLTableCellElement>();
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell ref={ref}>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );
      expect(ref.current).toBeInstanceOf(HTMLTableCellElement);
    });
  });

  describe('custom classNames on compound components', () => {
    it('should apply custom className to Header', () => {
      render(
        <Table>
          <Table.Header className="custom-header" data-testid="header">
            <Table.Row>
              <Table.HeaderCell>Column</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header')).toHaveClass('custom-header');
    });

    it('should apply custom className to Body', () => {
      render(
        <Table>
          <Table.Body className="custom-body" data-testid="body">
            <Table.Row>
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('body')).toHaveClass('custom-body');
    });

    it('should apply custom className to Row', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row className="custom-row" data-testid="row">
              <Table.Cell>Content</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('row')).toHaveClass('custom-row');
    });

    it('should apply custom className to HeaderCell', () => {
      render(
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell className="custom-th" data-testid="header-cell">
                Column
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
        </Table>
      );

      expect(screen.getByTestId('header-cell')).toHaveClass('custom-th');
    });

    it('should apply custom className to Cell', () => {
      render(
        <Table>
          <Table.Body>
            <Table.Row>
              <Table.Cell className="custom-td" data-testid="cell">
                Content
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      );

      expect(screen.getByTestId('cell')).toHaveClass('custom-td');
    });
  });
});
