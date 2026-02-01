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
  createSection: (class_id: string, name: string, semester?: string) => Promise<Section>;
  updateSection: (section_id: string, updates: Partial<Section>) => Promise<Section>;
  regenerateJoinCode: (section_id: string) => Promise<string>;
  addCoInstructor: (section_id: string, email: string) => Promise<void>;
  removeCoInstructor: (section_id: string, user_id: string) => Promise<void>;
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

  const createSection = useCallback(async (class_id: string, name: string, semester?: string): Promise<Section> => {
    setError(null);
    const data = await apiPost<{ section: Section }>(`/classes/${class_id}/sections`, { name, semester });
    return data.section;
  }, []);

  const updateSection = useCallback(async (section_id: string, updates: Partial<Section>): Promise<Section> => {
    setError(null);
    const data = await apiPatch<{ section: Section }>(`/sections/${section_id}`, updates);
    return data.section;
  }, []);

  const regenerateJoinCode = useCallback(async (section_id: string): Promise<string> => {
    setError(null);
    const data = await apiPost<{ join_code: string }>(`/sections/${section_id}/regenerate-code`);
    return data.join_code;
  }, []);

  const addCoInstructor = useCallback(async (section_id: string, email: string): Promise<void> => {
    setError(null);
    await apiPost(`/sections/${section_id}/instructors`, { email });
  }, []);

  const removeCoInstructor = useCallback(async (section_id: string, user_id: string): Promise<void> => {
    setError(null);
    await apiDelete(`/sections/${section_id}/instructors/${user_id}`);
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
