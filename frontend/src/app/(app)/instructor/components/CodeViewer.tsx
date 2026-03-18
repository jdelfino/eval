'use client';

import React from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import type { TestResult } from '@/types/problem';

interface CodeViewerProps {
  code: string;
  studentName?: string;
  runResult?: TestResult | null;
  onRun?: () => void;
  isRunning?: boolean;
}

export default function CodeViewer({ code, studentName, runResult, onRun, isRunning }: CodeViewerProps) {
  if (!code) {
    return (
      <div style={{ padding: '1rem', border: '1px solid #ccc' }}>
        <p style={{ color: '#666' }}>Select a student to view their code.</p>
      </div>
    );
  }

  return (
    <CodeEditor
      code={code}
      onChange={() => {}} // No-op since readOnly=true
      readOnly={true}
      runResult={runResult}
      isRunning={isRunning}
      title={studentName ? `${studentName}'s Code` : "Student's Code"}
      showRunButton={true}
      onRun={onRun}
    />
  );
}
