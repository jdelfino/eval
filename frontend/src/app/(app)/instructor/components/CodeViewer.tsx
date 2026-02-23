'use client';

import React from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';

interface CodeViewerProps {
  code: string;
  studentName?: string;
  execution_result?: {
    success: boolean;
    output: string;
    error: string;
    execution_time_ms: number;
  };
  onRunCode: () => void;
}

export default function CodeViewer({ code, studentName, execution_result, onRunCode }: CodeViewerProps) {
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
      useApiExecution={true}
      execution_result={execution_result}
      title={studentName ? `${studentName}'s Code` : "Student's Code"}
      showRunButton={true}
      onRun={onRunCode}
    />
  );
}
