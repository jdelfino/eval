/**
 * Hook for managing classes and sections (instructor-facing)
 */

import { useState, useCallback } from 'react';
import type { Class, Section } from '@/server/classes/types';

interface UseClassesReturn {
  classes: Class[];
  loading: boolean;
  error: string | null;
  fetchClasses: () => Promise<void>;
  createClass: (name: string, description?: string) => Promise<Class>;
  updateClass: (id: string, updates: Partial<Class>) => Promise<Class>;
  deleteClass: (id: string) => Promise<void>;
  createSection: (classId: string, name: string, semester?: string) => Promise<Section>;
  updateSection: (sectionId: string, updates: Partial<Section>) => Promise<Section>;
  regenerateJoinCode: (sectionId: string) => Promise<string>;
  addCoInstructor: (sectionId: string, email: string) => Promise<void>;
  removeCoInstructor: (sectionId: string, userId: string) => Promise<void>;
}

export function useClasses(): UseClassesReturn {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/classes');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch classes');
      }
      const data = await response.json();
      setClasses(data.classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const createClass = useCallback(async (name: string, description?: string): Promise<Class> => {
    setError(null);
    const response = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create class');
    }
    const data = await response.json();
    setClasses(prev => [...prev, data.class]);
    return data.class;
  }, []);

  const updateClass = useCallback(async (id: string, updates: Partial<Class>): Promise<Class> => {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update class');
    }
    const data = await response.json();
    setClasses(prev => prev.map(c => c.id === id ? data.class : c));
    return data.class;
  }, []);

  const deleteClass = useCallback(async (id: string): Promise<void> => {
    setError(null);
    const response = await fetch(`/api/classes/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete class');
    }
    setClasses(prev => prev.filter(c => c.id !== id));
  }, []);

  const createSection = useCallback(async (classId: string, name: string, semester?: string): Promise<Section> => {
    setError(null);
    const response = await fetch(`/api/classes/${classId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, semester }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create section');
    }
    const data = await response.json();
    return data.section;
  }, []);

  const updateSection = useCallback(async (sectionId: string, updates: Partial<Section>): Promise<Section> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update section');
    }
    const data = await response.json();
    return data.section;
  }, []);

  const regenerateJoinCode = useCallback(async (sectionId: string): Promise<string> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}/regenerate-code`, {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to regenerate join code');
    }
    const data = await response.json();
    return data.joinCode;
  }, []);

  const addCoInstructor = useCallback(async (sectionId: string, email: string): Promise<void> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}/instructors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to add co-instructor');
    }
  }, []);

  const removeCoInstructor = useCallback(async (sectionId: string, userId: string): Promise<void> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}/instructors/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove co-instructor');
    }
  }, []);

  return {
    classes,
    loading,
    error,
    fetchClasses,
    createClass,
    updateClass,
    deleteClass,
    createSection,
    updateSection,
    regenerateJoinCode,
    addCoInstructor,
    removeCoInstructor,
  };
}
