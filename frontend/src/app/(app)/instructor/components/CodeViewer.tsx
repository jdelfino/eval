'use client';

import React from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import type { ExecutionSettings } from '@/types/problem';
import type { TestResponse, IOTestCase } from '@/types/api';

interface CodeViewerProps {
  code: string;
  studentName?: string;
  execution_result?: TestResponse;
  onRun?: (testCases: IOTestCase[]) => void;
  isRunning?: boolean;
}

export default function CodeViewer({ code, studentName, execution_result, onRun, isRunning }: CodeViewerProps) {
  if (!code) {
    return (
      <div style={{ padding: '1rem', border: '1px solid #ccc' }}>
        <p style={{ color: '#666' }}>Select a student to view their code.</p>
      </div>
    );
  }

  // Bridge: CodeEditor still calls onRun with ExecutionSettings; convert to IOTestCase[]
  const handleRun = onRun
    ? (settings: ExecutionSettings): void => {
        const testCases: IOTestCase[] = [];
        if (settings.stdin?.trim() || settings.random_seed !== undefined || settings.attached_files?.length) {
          testCases.push({
            name: 'Default',
            input: settings.stdin?.trim() ?? '',
            match_type: 'exact',
            order: 0,
            ...(settings.random_seed !== undefined && { random_seed: settings.random_seed }),
            ...(settings.attached_files?.length && { attached_files: settings.attached_files }),
          });
        }
        onRun(testCases);
      }
    : undefined;

  return (
    <CodeEditor
      code={code}
      onChange={() => {}} // No-op since readOnly=true
      readOnly={true}
      execution_result={execution_result}
      isRunning={isRunning}
      title={studentName ? `${studentName}'s Code` : "Student's Code"}
      showRunButton={true}
      onRun={handleRun}
    />
  );
}
