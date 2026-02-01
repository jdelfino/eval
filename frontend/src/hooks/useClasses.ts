/**
 * Hook for managing classes and sections (instructor-facing)
 */

import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Class, Section } from '@/types/api';

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
      const data = await apiGet<{ classes: Class[] }>('/classes');
      setClasses(data.classes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const createClass = useCallback(async (name: string, description?: string): Promise<Class> => {
    setError(null);
    const data = await apiPost<{ class: Class }>('/classes', { name, description });
    setClasses(prev => [...prev, data.class]);
    return data.class;
  }, []);

  const updateClass = useCallback(async (id: string, updates: Partial<Class>): Promise<Class> => {
    setError(null);
    const data = await apiPatch<{ class: Class }>(`/classes/${id}`, updates);
    setClasses(prev => prev.map(c => c.id === id ? data.class : c));
    return data.class;
  }, []);

  const deleteClass = useCallback(async (id: string): Promise<void> => {
    setError(null);
    await apiDelete(`/classes/${id}`);
    setClasses(prev => prev.filter(c => c.id !== id));
  }, []);

  const createSection = useCallback(async (classId: string, name: string, semester?: string): Promise<Section> => {
    setError(null);
    const data = await apiPost<{ section: Section }>(`/classes/${classId}/sections`, { name, semester });
    return data.section;
  }, []);

  const updateSection = useCallback(async (sectionId: string, updates: Partial<Section>): Promise<Section> => {
    setError(null);
    const data = await apiPatch<{ section: Section }>(`/sections/${sectionId}`, updates);
    return data.section;
  }, []);

  const regenerateJoinCode = useCallback(async (sectionId: string): Promise<string> => {
    setError(null);
    const data = await apiPost<{ join_code: string }>(`/sections/${sectionId}/regenerate-code`);
    return data.join_code;
  }, []);

  const addCoInstructor = useCallback(async (sectionId: string, email: string): Promise<void> => {
    setError(null);
    await apiPost(`/sections/${sectionId}/instructors`, { email });
  }, []);

  const removeCoInstructor = useCallback(async (sectionId: string, userId: string): Promise<void> => {
    setError(null);
    await apiDelete(`/sections/${sectionId}/instructors/${userId}`);
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
