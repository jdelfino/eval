import React from 'react';
import { render, screen } from '@testing-library/react';
import StudentAnalysisDetails from '../StudentAnalysisDetails';
import { AnalysisIssue } from '@/server/types/analysis';

const makeIssue = (overrides: Partial<AnalysisIssue> = {}): AnalysisIssue => ({
  title: 'Missing base case',
  explanation: 'Students forgot the base case in their recursive function',
  count: 3,
  studentIds: ['s1', 's2', 's3'],
  representativeStudentLabel: 'Student A',
  representativeStudentId: 's1',
  severity: 'error',
  ...overrides,
});

describe('StudentAnalysisDetails', () => {
  it('renders nothing when no issue is provided', () => {
    const { container } = render(<StudentAnalysisDetails />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when issue is undefined', () => {
    const { container } = render(<StudentAnalysisDetails issue={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders issue title and explanation', () => {
    render(<StudentAnalysisDetails issue={makeIssue()} />);

    expect(screen.getByTestId('issue-title')).toHaveTextContent('Missing base case');
    expect(screen.getByTestId('issue-explanation')).toHaveTextContent('Students forgot the base case in their recursive function');
  });

  it('renders the correct severity badge for error', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'error' })} />);
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Error');
  });

  it('renders the correct severity badge for misconception', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'misconception' })} />);
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Misconception');
  });

  it('renders the correct severity badge for style', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'style' })} />);
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Style');
  });

  it('renders the correct severity badge for good-pattern', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'good-pattern' })} />);
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Good Pattern');
  });

  it('applies correct background color for error severity badge', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'error' })} />);
    const badge = screen.getByTestId('severity-badge');
    expect(badge).toHaveStyle({ backgroundColor: '#fef2f2', color: '#991b1b' });
  });

  it('applies correct background color for good-pattern severity badge', () => {
    render(<StudentAnalysisDetails issue={makeIssue({ severity: 'good-pattern' })} />);
    const badge = screen.getByTestId('severity-badge');
    expect(badge).toHaveStyle({ backgroundColor: '#f0fdf4', color: '#166534' });
  });
});
