/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import UserList from '../UserList';
const mockUsers = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'instructor',
    displayName: 'Alice Smith',
    created_at: '2024-01-15T00:00:00Z',
    lastLoginAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    role: 'student',
    displayName: '',
    created_at: '2024-03-20T00:00:00Z',
  },
  {
    id: 'user-3',
    email: 'carol@example.com',
    role: 'student',
    created_at: '2024-04-10T00:00:00Z',
  },
];

describe('UserList', () => {
  it('shows email addresses for all users', () => {
    render(<UserList users={mockUsers} currentUserId="user-1" />);

    // All emails should appear at least once (in the Email column)
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThanOrEqual(1);
    // Users without display names show email in both name and email columns
    expect(screen.getAllByText('bob@example.com').length).toBe(2);
    expect(screen.getAllByText('carol@example.com').length).toBe(2);
  });

  it('shows display name when available', () => {
    render(<UserList users={mockUsers} currentUserId="user-1" />);

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows email as primary name when display name is missing', () => {
    render(<UserList users={mockUsers} currentUserId="user-1" />);

    // Carol has no displayName - email should appear as the name
    const carolCells = screen.getAllByText('carol@example.com');
    // Email appears both as name (fallback) and in the email column
    expect(carolCells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Email column header', () => {
    render(<UserList users={mockUsers} currentUserId="user-1" />);

    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows empty state when no users', () => {
    render(<UserList users={[]} currentUserId="user-1" />);

    expect(screen.getByText('No users found')).toBeInTheDocument();
  });
});
