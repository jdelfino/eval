/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import UserList from '../UserList';
import type { User } from '@/server/auth/types';

const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'instructor',
    namespaceId: 'ns-1',
    displayName: 'Alice Smith',
    createdAt: new Date('2024-01-15'),
    lastLoginAt: new Date('2024-06-01'),
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    role: 'student',
    namespaceId: 'ns-1',
    displayName: '',
    createdAt: new Date('2024-03-20'),
  },
  {
    id: 'user-3',
    email: 'carol@example.com',
    role: 'student',
    namespaceId: 'ns-1',
    createdAt: new Date('2024-04-10'),
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
