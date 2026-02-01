'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
  stdin?: string; // Input provided to the program
}

interface OutputPanelProps {
  result: ExecutionResult | null;
  isConnected?: boolean;
  isRunning?: boolean;
}

export default function OutputPanel({ result, isConnected = true, isRunning = false }: OutputPanelProps) {
  if (!result) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded mt-4 min-h-[150px]">
        <h4 className="mt-0">Output</h4>
        {isRunning ? (
          <p className="text-gray-500 italic">
            Executing your code...
          </p>
        ) : !isConnected ? (
          <div>
            <p className="text-red-600 m-0 mb-2">
              Not connected to the session.
            </p>
            <p className="text-gray-500 text-sm m-0">
              Please wait for the connection to be established before running code.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 italic m-0 mb-2">
              No output yet.
            </p>
            <p className="text-gray-400 text-sm m-0">
              Click the "Run Code" button to execute your code and see the output here.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      'p-4 border rounded mt-4 min-h-[150px]',
      result.success
        ? 'bg-green-100 border-green-300'
        : 'bg-red-100 border-red-300'
    )}>
      <h4 className="mt-0">Output</h4>

      {/* Display input if it was provided */}
      {result.stdin && (
        <div className="mb-4">
          <strong className="text-gray-500">Input provided:</strong>
          <pre className="my-2 font-mono whitespace-pre-wrap break-words bg-gray-100 p-2 rounded border border-gray-300">
            {result.stdin}
          </pre>
        </div>
      )}

      {result.output && (
        <div className="mb-4">
          <pre className="m-0 font-mono whitespace-pre-wrap break-words">
            {result.output}
          </pre>
        </div>
      )}

      {result.error && (
        <div className="mb-4">
          <strong className="text-red-800">Error:</strong>
          <pre className="mt-2 mb-0 font-mono whitespace-pre-wrap break-words text-red-800">
            {result.error}
          </pre>
        </div>
      )}

      <div className="text-sm text-gray-500 mt-2">
        Execution time: {result.executionTime}ms
      </div>
    </div>
  );
}
