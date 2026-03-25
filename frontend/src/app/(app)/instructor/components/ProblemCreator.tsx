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

import React, { useState, useEffect, useRef } from 'react';
import { listClasses } from '@/lib/api/classes';
import { getProblem, createProblem, updateProblem, generateSolution } from '@/lib/api/problems';
import type { Class } from '@/types/api';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Tabs } from '@/components/ui/Tabs';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { executeCode } from '@/lib/api/execute';
import { extractExecutionSettingsFromTestCases } from '@/types/problem';
import type { IOTestCase, WireFile } from '@/types/api';

/**
 * Build a test_cases array from execution settings (stdin, random_seed, attached_files).
 * When any execution setting is present, returns a single-element IOTestCase array.
 * When no settings are present, returns an empty array.
 *
 * Exported for testing.
 */
export function buildTestCasesFromExecutionSettings(opts: {
  stdin?: string;
  random_seed?: number;
  attached_files?: WireFile[];
}): IOTestCase[] {
  const hasStdin = opts.stdin !== undefined && opts.stdin.trim() !== '';
  const hasRandomSeed = opts.random_seed !== undefined;
  const hasFiles = opts.attached_files !== undefined && opts.attached_files.length > 0;

  if (!hasStdin && !hasRandomSeed && !hasFiles) {
    return [];
  }

  const tc: IOTestCase = {
    name: 'Default',
    input: opts.stdin?.trim() || '',
    match_type: 'exact',
    order: 0,
  };
  if (hasRandomSeed) tc.random_seed = opts.random_seed;
  if (hasFiles) tc.attached_files = opts.attached_files;

  return [tc];
}

interface ProblemCreatorProps {
  problem_id?: string | null;
  onProblemCreated?: (problem_id: string) => void;
  onCancel?: () => void;
  class_id?: string | null;
}

const JAVA_DEFAULT_STARTER = `public class Main {
    public static void main(String[] args) {

    }
}`;

export default function ProblemCreator({
  problem_id = null,
  onProblemCreated,
  onCancel,
  class_id = null,
}: ProblemCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starter_code, setStarterCode] = useState('');
  const [solution, setSolution] = useState('');
  const [language, setLanguage] = useState('python');
  const [activeTab, setActiveTab] = useState<'starter' | 'solution'>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(!!problem_id);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [generateModalError, setGenerateModalError] = useState<string | null>(null);

  // Class and tags state
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(class_id || '');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Execution settings
  const [stdin, setStdin] = useState('');
  const [random_seed, setRandomSeed] = useState<number | undefined>(undefined);
  const [attached_files, setAttachedFiles] = useState<Array<{ name: string; content: string }>>([]);

  // Execution state for code editor
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<import('@/types/api').TestResponse | null>(null);

  const isEditMode = !!problem_id;

  // Load classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const loadedClasses = await listClasses();
        setClasses(loadedClasses);
        // Pre-populate if class_id prop provided
        if (class_id) {
          setSelectedClassId(class_id);
        }
      } catch {
        // Classes won't be populated but form still works
      }
    };
    fetchClasses();
  }, [class_id]);

  // Load problem data when editing
  useEffect(() => {
    if (problem_id) {
      loadProblem(problem_id);
    }
  }, [problem_id]);

  const loadProblem = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const problem = await getProblem(id);
      setTitle(problem.title || '');
      setDescription(problem.description || '');
      setStarterCode(problem.starter_code || '');
      setSolution(problem.solution || '');
      setLanguage(problem.language || 'python');
      if (problem.class_id) setSelectedClassId(problem.class_id);
      if (problem.tags) setTags(problem.tags);

      // Load execution settings from test_cases[0]
      const execSettings = extractExecutionSettingsFromTestCases(problem.test_cases);
      setStdin(execSettings?.stdin || '');
      setRandomSeed(execSettings?.random_seed);
      setAttachedFiles(execSettings?.attached_files || []);
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

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    // When switching to Java and starter code is empty, populate with Java default
    if (newLanguage === 'java' && !starter_code.trim()) {
      setStarterCode(JAVA_DEFAULT_STARTER);
    }
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
      // Build test_cases from execution settings (stdin, random_seed, attached_files).
      // These are stored as test_cases[0] in the backend, not as a separate field.
      const testCases = buildTestCasesFromExecutionSettings({
        stdin,
        random_seed,
        attached_files,
      });

      const problemInput = {
        title: title.trim(),
        description: description.trim() || null,
        starter_code: starter_code.trim() || null,
        solution: solution.trim() || null,
        language,
        test_cases: testCases,
        class_id: selectedClassId || null,
        tags: finalTags.length > 0 ? finalTags : [],
      };

      let result;
      if (isEditMode) {
        result = await updateProblem(problem_id!, problemInput);
      } else {
        result = await createProblem(problemInput as Parameters<typeof createProblem>[0]);
      }

      if (!isEditMode) {
        // Reset form only when creating
        setTitle('');
        setDescription('');
        setStarterCode('');
        setSolution('');
        setLanguage('python');
        setStdin('');
        setRandomSeed(undefined);
        setAttachedFiles([]);
        setTags([]);
        setTagInput('');
      }

      // Notify parent
      onProblemCreated?.(result.id);
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

  const handleOpenGenerateModal = () => {
    setShowGenerateModal(true);
    setGenerateModalError(null);
  };

  const handleCancelGenerateModal = () => {
    setShowGenerateModal(false);
    setCustomInstructions('');
    setGenerateModalError(null);
  };

  const handleGenerateSolution = async () => {
    setIsGenerating(true);
    setGenerateModalError(null);
    try {
      const requestData: { description: string; starter_code?: string; custom_instructions?: string } = {
        description,
        starter_code: starter_code || undefined,
      };
      if (customInstructions.trim()) {
        requestData.custom_instructions = customInstructions.trim();
      }
      const result = await generateSolution(requestData);
      setSolution(result.solution);
      setActiveTab('solution');
      setShowGenerateModal(false);
      setCustomInstructions('');
    } catch (err: any) {
      setGenerateModalError(err.message || 'Failed to generate solution');
    } finally {
      setIsGenerating(false);
    }
  };

  const debuggerHook = useApiDebugger();

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
            disabled={isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'white',
              backgroundColor: '#0d6efd',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: (isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)) ? 0.5 : 1
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
              border: `1px solid ${!isEditMode && !selectedClassId ? '#dc3545' : '#ced4da'}`,
              borderRadius: '0.25rem',
              minWidth: '150px',
            }}
          >
            <option value="">Select a class...</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!isEditMode && !selectedClassId && (
            <span style={{ fontSize: '0.75rem', color: '#dc3545' }}>Required</span>
          )}
        </div>

        {/* Language selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="problem-language" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Language</label>
          <select
            id="problem-language"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              minWidth: '100px',
            }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
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
      {!isLoading && <Tabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as 'starter' | 'solution')} className="flex-shrink-0">
        <Tabs.List className="items-center">
          <Tabs.Tab tabId="starter">Starter Code</Tabs.Tab>
          <Tabs.Tab tabId="solution">Solution</Tabs.Tab>
          <button
            type="button"
            onClick={handleOpenGenerateModal}
            disabled={!description.trim() || isGenerating || isSubmitting}
            className="ml-auto mr-2 px-3 py-1 text-xs text-primary-600 bg-transparent border border-primary-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Solution
          </button>
        </Tabs.List>
      </Tabs>}

      {/* Full-width code editor */}
      {!isLoading && <EditorContainer variant="flex">
        <CodeEditor
          code={activeTab === 'starter' ? starter_code : solution}
          onChange={activeTab === 'starter' ? setStarterCode : setSolution}
          onRun={(execution_settings) => {
            const codeToRun = activeTab === 'starter' ? starter_code : solution;
            setIsRunning(true);
            setExecutionResult(null);
            executeCode(codeToRun, language, {
              stdin: execution_settings.stdin,
              random_seed: execution_settings.random_seed,
              attached_files: execution_settings.attached_files,
            }).then(setExecutionResult).catch((err: any) => {
              setError(err?.message || 'Failed to run code');
            }).finally(() => setIsRunning(false));
          }}
          isRunning={isRunning}
          execution_result={executionResult}
          title={activeTab === 'starter' ? 'Starter Code' : 'Solution Code'}
          defaultExecutionSettings={{ stdin, random_seed, attached_files }}
          onExecutionSettingsChange={(settings) => {
            setStdin(settings.stdin || '');
            setRandomSeed(settings.random_seed);
            setAttachedFiles(settings.attached_files || []);
          }}
          problem={{ title, description, starter_code, language }}
          onLoadStarterCode={setStarterCode}
          debugger={debuggerHook}
          onProblemEdit={(updates) => {
            if (updates.title !== undefined) setTitle(updates.title);
            if (updates.description !== undefined) setDescription(updates.description);
          }}
          editableProblem={true}
        />
      </EditorContainer>}

      {/* Generate Solution Modal */}
      {showGenerateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#212529' }}>
              Generate Solution
            </h2>

            {generateModalError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#f8d7da', borderRadius: '0.25rem', color: '#842029', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {generateModalError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="generate-custom-instructions"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#495057', marginBottom: '0.375rem' }}
              >
                Custom Instructions (optional)
              </label>
              <textarea
                id="generate-custom-instructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Don't use dicts or lists"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleCancelGenerateModal}
                disabled={isGenerating}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: '#495057',
                  backgroundColor: '#e9ecef',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateSolution}
                disabled={isGenerating}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  backgroundColor: '#0d6efd',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.7 : 1,
                }}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
