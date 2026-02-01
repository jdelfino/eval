'use client';

/**
 * Problem Creator Component
 *
 * Allows instructors to create or edit programming problems with:
 * - Title and description
 * - Starter code template (with Monaco editor and run capability)
 * - Test cases (added separately via test case UI)
 * - Visibility settings (public/class-specific)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ProblemInput } from '@/server/types/problem';
import type { ClassInfo } from '../types';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { useDebugger } from '@/hooks/useDebugger';

interface ProblemCreatorProps {
  problemId?: string | null;
  onProblemCreated?: (problemId: string) => void;
  onCancel?: () => void;
  classId?: string | null;
}

export default function ProblemCreator({
  problemId = null,
  onProblemCreated,
  onCancel,
  classId = null,
}: ProblemCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [solution, setSolution] = useState('');
  const [activeTab, setActiveTab] = useState<'starter' | 'solution'>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!problemId);
  const [error, setError] = useState<string | null>(null);

  // Class and tags state
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(classId || '');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Execution settings
  const [stdin, setStdin] = useState('');
  const [randomSeed, setRandomSeed] = useState<number | undefined>(undefined);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string }>>([]);

  const isEditMode = !!problemId;

  // Load classes on mount
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const response = await fetch('/api/classes');
        if (response.ok) {
          const data = await response.json();
          setClasses(data.classes || []);
          // Pre-populate if classId prop provided
          if (classId) {
            setSelectedClassId(classId);
          }
        }
      } catch {
        // Classes won't be populated but form still works
      }
    };
    loadClasses();
  }, [classId]);

  // Load problem data when editing
  useEffect(() => {
    if (problemId) {
      loadProblem(problemId);
    }
  }, [problemId]);

  const loadProblem = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/problems/${id}`);
      if (!response.ok) {
        throw new Error('Failed to load problem');
      }
      const { problem } = await response.json();
      setTitle(problem.title || '');
      setDescription(problem.description || '');
      setStarterCode(problem.starterCode || '');
      setSolution(problem.solution || '');
      if (problem.classId) setSelectedClassId(problem.classId);
      if (problem.tags) setTags(problem.tags);

      // Load execution settings
      const execSettings = problem.executionSettings;
      setStdin(execSettings?.stdin || '');
      setRandomSeed(execSettings?.randomSeed);
      setAttachedFiles(execSettings?.attachedFiles || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load problem');
    } finally {
      setIsLoading(false);
    }
  };

  const flushTagInput = (): string[] => {
    if (!tagInput.trim()) return tags;
    const newTags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !tags.includes(t));
    const flushed = [...tags, ...newTags];
    setTags(flushed);
    setTagInput('');
    return flushed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    // Commit any text left in the tag input field
    const finalTags = flushTagInput();

    setIsSubmitting(true);

    try {
      const problemInput: Partial<ProblemInput> = {
        title: title.trim(),
        description: description.trim(),
        starterCode: starterCode.trim(),
        solution: solution.trim(),
        testCases: [], // Test cases added separately
        classId: selectedClassId || undefined,
        tags: finalTags.length > 0 ? finalTags : [],
      };

      // Only include executionSettings if at least one field is set
      const execSettings: any = {};
      if (stdin.trim()) execSettings.stdin = stdin.trim();
      if (randomSeed !== undefined) execSettings.randomSeed = randomSeed;
      if (attachedFiles.length > 0) execSettings.attachedFiles = attachedFiles;

      if (Object.keys(execSettings).length > 0) {
        problemInput.executionSettings = execSettings;
      }

      let response;
      if (isEditMode) {
        // Update existing problem
        response = await fetch(`/api/problems/${problemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(problemInput),
        });
      } else {
        // Create new problem
        response = await fetch('/api/problems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(problemInput),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        const details = data.details?.map((d: any) => d.message).join('; ');
        throw new Error(details || data.error || `Failed to ${isEditMode ? 'update' : 'create'} problem`);
      }

      const { problem } = await response.json();

      if (!isEditMode) {
        // Reset form only when creating
        setTitle('');
        setDescription('');
        setStarterCode('');
        setSolution('');
        setStdin('');
        setRandomSeed(undefined);
        setAttachedFiles([]);
        setTags([]);
        setTagInput('');
      }

      // Notify parent
      onProblemCreated?.(problem.id);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} problem`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTags = tagInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t && !tags.includes(t));
      if (newTags.length > 0) {
        setTags(prev => [...prev, ...newTags]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  // Setup debugger (trace feature not yet available via API)
  const noopSendMessage = useCallback(() => {}, []);
  const debuggerHook = useDebugger(noopSendMessage);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Compact header bar matching student view style */}
      <div style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '3rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                padding: '0.25rem',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#0d6efd',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Back to Problem Library"
            >
              <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#212529' }}>
            {isEditMode ? 'Edit Problem' : 'Create New Problem'}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !title.trim()}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'white',
              backgroundColor: '#0d6efd',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: (isSubmitting || isLoading || !title.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || isLoading || !title.trim()) ? 0.5 : 1
            }}
          >
            {isSubmitting ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Problem' : 'Create Problem')}
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
          Loading problem...
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c2c7', color: '#842029' }}>
          {error}
        </div>
      )}

      {/* Class and Tags bar */}
      {!isLoading && <div style={{
        flexShrink: 0,
        padding: '0.5rem 1rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {/* Class selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="problem-class" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Class *</label>
          <select
            id="problem-class"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              minWidth: '150px',
            }}
          >
            <option value="">Select a class...</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Tags input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <label htmlFor="problem-tags" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Tags</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', flex: 1 }}>
            {tags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#e9ecef',
                  borderRadius: '9999px',
                  color: '#495057',
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.875rem',
                    color: '#6c757d',
                    lineHeight: 1,
                  }}
                  aria-label={`Remove tag ${tag}`}
                >
                  x
                </button>
              </span>
            ))}
            <input
              id="problem-tags"
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={flushTagInput}
              placeholder="Add tags (comma-separated)..."
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
              }}
            />
          </div>
        </div>
      </div>}

      {/* Tab bar for Starter Code / Solution */}
      {!isLoading && <div role="tablist" style={{
        flexShrink: 0,
        display: 'flex',
        borderBottom: '1px solid #dee2e6',
        backgroundColor: '#fff',
      }}>
        {(['starter', 'solution'] as const).map((tab) => {
          const label = tab === 'starter' ? 'Starter Code' : 'Solution';
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#0d6efd' : '#495057',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #0d6efd' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>}

      {/* Full-width code editor */}
      {!isLoading && <EditorContainer variant="flex">
        <CodeEditor
          code={activeTab === 'starter' ? starterCode : solution}
          onChange={activeTab === 'starter' ? setStarterCode : setSolution}
          useApiExecution={true}
          title={activeTab === 'starter' ? 'Starter Code' : 'Solution Code'}
          exampleInput={stdin}
          onStdinChange={setStdin}
          randomSeed={randomSeed}
          onRandomSeedChange={setRandomSeed}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={setAttachedFiles}
          problem={{ title, description, starterCode }}
          onLoadStarterCode={setStarterCode}
          debugger={debuggerHook}
          onProblemEdit={(updates) => {
            if (updates.title !== undefined) setTitle(updates.title);
            if (updates.description !== undefined) setDescription(updates.description);
          }}
          editableProblem={true}
        />
      </EditorContainer>}

    </div>
  );
}
