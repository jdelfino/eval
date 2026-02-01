/**
 * Tests for NamespaceHeader component - All Namespaces option
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NamespaceHeader from '@/components/NamespaceHeader';

const mockUser: any = { role: 'system-admin', namespaceId: 'default' };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock fetch to return namespaces
const mockNamespaces = [
  { id: 'ns-1', displayName: 'Namespace 1', active: true, userCount: 5 },
  { id: 'ns-2', displayName: 'Namespace 2', active: true, userCount: 3 },
];

beforeEach(() => {
  localStorage.clear();
  mockUser.role = 'system-admin';
  mockUser.namespaceId = 'default';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, namespaces: mockNamespaces }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders "All Namespaces" as the first dropdown option for system-admin', async () => {
  render(<NamespaceHeader />);

  // Wait for the namespace options to load (async fetch)
  await waitFor(() => {
    const select = screen.getByRole('combobox');
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(3); // All Namespaces + 2 namespaces
  });

  const select = screen.getByRole('combobox');
  const options = select.querySelectorAll('option');

  expect(options[0]).toHaveTextContent('All Namespaces');
  expect(options[0]).toHaveValue('all');
  expect(options[1]).toHaveTextContent('Namespace 1');
  expect(options[2]).toHaveTextContent('Namespace 2');
});
