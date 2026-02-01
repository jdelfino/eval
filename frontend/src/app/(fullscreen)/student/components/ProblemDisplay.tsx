'use client';

import React, { useState } from 'react';
import { Problem } from '@/server/types/problem';
import MarkdownContent from '@/components/MarkdownContent';

interface ProblemDisplayProps {
  problem: Problem | null;
  onLoadStarterCode?: (starterCode: string) => void;
}

export default function ProblemDisplay({ problem, onLoadStarterCode }: ProblemDisplayProps) {
  const [showStarterCode, setShowStarterCode] = useState(false);
  const [showTestCases, setShowTestCases] = useState(false);

  if (!problem) {
    return null;
  }

  const hasStarterCode = !!problem.starterCode;
  const hasTestCases = problem.testCases && problem.testCases.length > 0;
  const hasDescription = !!problem.description;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3">
        <h2 className="text-xl font-bold">{problem.title}</h2>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Description */}
        {hasDescription && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <MarkdownContent content={problem.description!} />
            </div>
          </div>
        )}

        {/* Starter Code */}
        {hasStarterCode && (
          <div>
            <button
              onClick={() => setShowStarterCode(!showStarterCode)}
              className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              <span>{showStarterCode ? '▼' : '▶'}</span>
              <span>Starter Code</span>
            </button>
            {showStarterCode && (
              <div className="mt-2">
                <pre className="bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto text-sm">
                  <code>{problem.starterCode}</code>
                </pre>
                {onLoadStarterCode && (
                  <button
                    onClick={() => onLoadStarterCode(problem.starterCode!)}
                    className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Load into Editor
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Test Cases */}
        {hasTestCases && (
          <div>
            <button
              onClick={() => setShowTestCases(!showTestCases)}
              className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              <span>{showTestCases ? '▼' : '▶'}</span>
              <span>Test Cases ({problem.testCases!.length})</span>
            </button>
            {showTestCases && (
              <div className="mt-2 space-y-2">
                {problem.testCases!.map((testCase, index) => (
                  <div key={testCase.id || index} className="bg-gray-50 border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {testCase.name || `Test ${index + 1}`}
                      </span>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {testCase.type.toUpperCase()}
                      </span>
                    </div>
                    {testCase.description && (
                      <p className="text-sm text-gray-600 mt-1">{testCase.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Execution Settings Info */}
        {problem.executionSettings && (
          <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded border border-gray-200">
            {problem.executionSettings.randomSeed !== undefined && (
              <p>🎲 Random seed: {problem.executionSettings.randomSeed}</p>
            )}
            {problem.executionSettings.attachedFiles && problem.executionSettings.attachedFiles.length > 0 && (
              <p>📎 {problem.executionSettings.attachedFiles.length} file(s) attached</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
