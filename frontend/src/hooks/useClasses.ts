/**
 * Hook for managing classes and sections (instructor-facing)
 */

import { useState, useCallback } from 'react';
import {
  listClasses as apiListClasses,
  createClass as apiCreateClass,
  updateClass as apiUpdateClass,
  deleteClass as apiDeleteClass,
  createSection as apiCreateSection,
  updateSection as apiUpdateSection,
  regenerateJoinCode as apiRegenerateJoinCode,
  addCoInstructor as apiAddCoInstructor,
  removeCoInstructor as apiRemoveCoInstructor,
} from '@/lib/api/classes';
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
  regenerateJoinCode: (section_id: string) => Promise<Section>;
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
      const data = await apiListClasses();
      setClasses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const createClass = useCallback(async (name: string, description?: string): Promise<Class> => {
    setError(null);
    const cls = await apiCreateClass(name, description);
    setClasses(prev => [...prev, cls]);
    return cls;
  }, []);

  const updateClass = useCallback(async (id: string, updates: Partial<Class>): Promise<Class> => {
    setError(null);
    const cls = await apiUpdateClass(id, updates);
    setClasses(prev => prev.map(c => c.id === id ? cls : c));
    return cls;
  }, []);

  const deleteClass = useCallback(async (id: string): Promise<void> => {
    setError(null);
    await apiDeleteClass(id);
    setClasses(prev => prev.filter(c => c.id !== id));
  }, []);

  const createSection = useCallback(async (class_id: string, name: string, semester?: string): Promise<Section> => {
    setError(null);
    const section = await apiCreateSection(class_id, { name, semester });
    return section;
  }, []);

  const updateSection = useCallback(async (section_id: string, updates: Partial<Section>): Promise<Section> => {
    setError(null);
    const section = await apiUpdateSection(section_id, updates);
    return section;
  }, []);

  const regenerateJoinCode = useCallback(async (section_id: string): Promise<Section> => {
    setError(null);
    const section = await apiRegenerateJoinCode(section_id);
    return section;
  }, []);

  const addCoInstructor = useCallback(async (section_id: string, email: string): Promise<void> => {
    setError(null);
    await apiAddCoInstructor(section_id, email);
  }, []);

  const removeCoInstructor = useCallback(async (section_id: string, user_id: string): Promise<void> => {
    setError(null);
    await apiRemoveCoInstructor(section_id, user_id);
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
