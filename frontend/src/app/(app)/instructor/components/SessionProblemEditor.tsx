'use client';

/**
 * Session Problem Editor
 *
 * Provides an editor for creating/editing problems during an active session.
 * Similar to ProblemCreator but designed for live session updates rather than
 * database persistence. Uses Monaco editor and supports execution settings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Problem } from '@/server/types/problem';
import { useDebugger } from '@/hooks/useDebugger';

interface SessionProblemEditorProps {
  onUpdateProblem: (
    problem: { title: string; description: string; starterCode: string },
    executionSettings?: {
      stdin?: string;
      randomSeed?: number;
      attachedFiles?: Array<{ name: string; content: string }>;
    }
  ) => void;
  initialProblem?: Problem | { title: string; description: string; starterCode: string } | null;
  initialExecutionSettings?: {
    stdin?: string;
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  };
}

export default function SessionProblemEditor({
  onUpdateProblem,
  initialProblem = null,
  initialExecutionSettings = {}
}: SessionProblemEditorProps) {
  const [title, setTitle] = useState(initialProblem?.title || '');
  const [description, setDescription] = useState(initialProblem?.description || '');
  const [starterCode, setStarterCode] = useState(initialProblem?.starterCode || '');

  // Execution settings
  const [stdin, setStdin] = useState(initialExecutionSettings?.stdin || '');
  const [randomSeed, setRandomSeed] = useState<number | undefined>(initialExecutionSettings?.randomSeed);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string }>>(
    initialExecutionSettings?.attachedFiles || []
  );

  // Sync state when initial values change (e.g., when problem is loaded)
  useEffect(() => {
    if (initialProblem) {
      setTitle(initialProblem.title || '');
      setDescription(initialProblem.description || '');
      setStarterCode(initialProblem.starterCode || '');
    }
  }, [initialProblem?.title, initialProblem?.description, initialProblem?.starterCode]);

  useEffect(() => {
    if (initialExecutionSettings) {
      setStdin(initialExecutionSettings.stdin || '');
      setRandomSeed(initialExecutionSettings.randomSeed);
      setAttachedFiles(initialExecutionSettings.attachedFiles || []);
    }
  }, [
    initialExecutionSettings?.stdin,
    initialExecutionSettings?.randomSeed,
    initialExecutionSettings?.attachedFiles
  ]);

  const handleUpdate = () => {
    const problem = {
      title: title.trim(),
      description: description.trim(),
      starterCode: starterCode.trim(),
    };

    const executionSettings: any = {};
    if (stdin.trim()) executionSettings.stdin = stdin.trim();
    if (randomSeed !== undefined) executionSettings.randomSeed = randomSeed;
    if (attachedFiles.length > 0) executionSettings.attachedFiles = attachedFiles;

    onUpdateProblem(problem, Object.keys(executionSettings).length > 0 ? executionSettings : undefined);
  };

  // Setup debugger (trace feature not yet available via API)
  const noopSendMessage = useCallback(() => {}, []);
  const debuggerHook = useDebugger(noopSendMessage);

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
          code={starterCode}
          onChange={setStarterCode}
          useApiExecution={true}
          title="Starter Code"
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
      </EditorContainer>
    </div>
  );
}
