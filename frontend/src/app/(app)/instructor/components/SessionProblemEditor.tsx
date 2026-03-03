'use client';

/**
 * Session Problem Editor
 *
 * Provides an editor for creating/editing problems during an active session.
 * Similar to ProblemCreator but designed for live session updates rather than
 * database persistence. Uses Monaco editor and supports execution settings.
 */

import React, { useState, useEffect } from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Problem } from '@/types/problem';
import { useApiDebugger } from '@/hooks/useApiDebugger';

interface SessionProblemEditorProps {
  onUpdateProblem: (
    problem: { title: string; description: string; starter_code: string },
    execution_settings?: {
      stdin?: string;
      random_seed?: number;
      attached_files?: Array<{ name: string; content: string }>;
    }
  ) => void;
  initialProblem?: Problem | { title: string; description: string; starter_code: string } | null;
  initialExecutionSettings?: {
    stdin?: string;
    random_seed?: number;
    attached_files?: Array<{ name: string; content: string }>;
  };
}

export default function SessionProblemEditor({
  onUpdateProblem,
  initialProblem = null,
  initialExecutionSettings = {}
}: SessionProblemEditorProps) {
  const [title, setTitle] = useState(initialProblem?.title || '');
  const [description, setDescription] = useState(initialProblem?.description || '');
  const [starter_code, setStarterCode] = useState(initialProblem?.starter_code || '');
  const language = (initialProblem as Problem | null)?.language ?? 'python';

  // Execution settings
  const [stdin, setStdin] = useState(initialExecutionSettings?.stdin || '');
  const [random_seed, setRandomSeed] = useState<number | undefined>(initialExecutionSettings?.random_seed);
  const [attached_files, setAttachedFiles] = useState<Array<{ name: string; content: string }>>(
    initialExecutionSettings?.attached_files || []
  );

  // Sync state when initial values change (e.g., when problem is loaded)
  useEffect(() => {
    if (initialProblem) {
      setTitle(initialProblem.title || '');
      setDescription(initialProblem.description || '');
      setStarterCode(initialProblem.starter_code || '');
    }
  }, [initialProblem?.title, initialProblem?.description, initialProblem?.starter_code]);

  useEffect(() => {
    if (initialExecutionSettings) {
      setStdin(initialExecutionSettings.stdin || '');
      setRandomSeed(initialExecutionSettings.random_seed);
      setAttachedFiles(initialExecutionSettings.attached_files || []);
    }
  }, [
    initialExecutionSettings?.stdin,
    initialExecutionSettings?.random_seed,
    initialExecutionSettings?.attached_files
  ]);

  const handleUpdate = () => {
    const problem = {
      title: title.trim(),
      description: description.trim(),
      starter_code: starter_code.trim(),
    };

    const execution_settings: any = {};
    if (stdin.trim()) execution_settings.stdin = stdin.trim();
    if (random_seed !== undefined) execution_settings.random_seed = random_seed;
    if (attached_files.length > 0) execution_settings.attached_files = attached_files;

    onUpdateProblem(problem, Object.keys(execution_settings).length > 0 ? execution_settings : undefined);
  };

  const debuggerHook = useApiDebugger();

  return (
    <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
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
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#212529' }}>Problem Setup</h3>
        <button
          onClick={handleUpdate}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'white',
            backgroundColor: '#0d6efd',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer'
          }}
        >
          Update Problem
        </button>
      </div>

      {/* Full-width code editor */}
      <EditorContainer variant="flex">
        <CodeEditor
          code={starter_code}
          onChange={setStarterCode}
          useApiExecution={true}
          title="Starter Code"
          exampleInput={stdin}
          onStdinChange={setStdin}
          random_seed={random_seed}
          onRandomSeedChange={setRandomSeed}
          attached_files={attached_files}
          onAttachedFilesChange={setAttachedFiles}
          problem={{ title, description, starter_code, language }}
          onLoadStarterCode={setStarterCode}
          debugger={debuggerHook}
          onProblemEdit={(updates) => {
            if (updates.title !== undefined) setTitle(updates.title);
            if (updates.description !== undefined) setDescription(updates.description);
          }}
          editableProblem={true}
        />
      </EditorContainer>
    </div>
  );
}
