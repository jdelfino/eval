'use client';

/**
 * NamespaceHeader Component
 * 
 * Displays namespace context in the application header:
 * - For non-system-admin users: Shows current namespace name (read-only)
 * - For system-admin users: Shows dropdown to switch between namespaces
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Namespace {
  id: string;
  displayName: string;
  active: boolean;
  userCount?: number;
}

interface NamespaceHeaderProps {
  className?: string;
}

export default function NamespaceHeader({ className = '' }: NamespaceHeaderProps) {
  const { user } = useAuth();
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string | null>(null);
  const [currentNamespace, setCurrentNamespace] = useState<Namespace | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load user's current namespace display name
  useEffect(() => {
    if (!user || !user.namespaceId) return;

    const loadCurrentNamespace = async () => {
      try {
        // For system admin, we fetch all namespaces anyway, so skip this
        if (user.role === 'system-admin') return;

        const response = await fetch(`/api/system/namespaces/${user.namespaceId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.namespace) {
            setCurrentNamespace(data.namespace);
          }
        }
      } catch (error) {
        console.error('Failed to load namespace:', error);
      }
    };

    loadCurrentNamespace();
  }, [user]);

  // Load all namespaces for system-admin
  useEffect(() => {
    if (!user || user.role !== 'system-admin') return;

    const loadNamespaces = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/system/namespaces');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.namespaces) {
            setNamespaces(data.namespaces);
            
            // Load selected namespace from localStorage or default to user's namespace
            const savedNamespaceId = localStorage.getItem('selectedNamespaceId');
            const initialNamespaceId = savedNamespaceId || user.namespaceId || 'default';
            setSelectedNamespaceId(initialNamespaceId);
            
            // Set current namespace
            const selected = data.namespaces.find((ns: Namespace) => ns.id === initialNamespaceId);
            setCurrentNamespace(selected || data.namespaces[0] || null);
          }
        }
      } catch (error) {
        console.error('Failed to load namespaces:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNamespaces();
  }, [user]);

  // Handle namespace selection change (system-admin only)
  const handleNamespaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newNamespaceId = e.target.value;
    setSelectedNamespaceId(newNamespaceId);
    localStorage.setItem('selectedNamespaceId', newNamespaceId);
    
    // Update current namespace
    const selected = namespaces.find(ns => ns.id === newNamespaceId);
    setCurrentNamespace(selected || null);
    
    // Reload the page to refetch data with new namespace context
    window.location.reload();
  };

  if (!user) return null;

  // For non-system-admin users: Show namespace name (read-only)
  if (user.role !== 'system-admin') {
    if (!currentNamespace && !user.namespaceId) return null;
    
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {currentNamespace?.displayName || user.namespaceId || 'Default'}
        </span>
      </div>
    );
  }

  // For system-admin: Show namespace dropdown
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <label htmlFor="namespace-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Namespace:
      </label>
      <select
        id="namespace-select"
        value={selectedNamespaceId || ''}
        onChange={handleNamespaceChange}
        disabled={isLoading}
        className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Namespaces</option>
        {namespaces.map((ns) => (
          <option key={ns.id} value={ns.id}>
            {ns.displayName} ({ns.userCount || 0} users)
          </option>
        ))}
      </select>
    </div>
  );
}
