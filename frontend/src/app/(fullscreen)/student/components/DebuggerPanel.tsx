import React from 'react';
import { VariableInspector } from './VariableInspector';
import { CallStackPanel } from './CallStackPanel';

interface DebuggerPanelProps {
  currentStep: number;
  totalSteps: number;
  currentLine: number;
  locals: Record<string, any>;
  globals: Record<string, any>;
  previousLocals: Record<string, any>;
  previousGlobals: Record<string, any>;
  callStack: any[];
  truncated?: boolean;
}

export function DebuggerPanel({
  currentStep,
  totalSteps,
  currentLine,
  locals,
  globals,
  previousLocals,
  previousGlobals,
  callStack,
  truncated
}: DebuggerPanelProps) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header with step info */}
      <div className="bg-white border-b border-gray-300 px-4 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Debugger Output</h2>
          <div className="text-sm text-gray-600">
            Step {currentStep + 1} of {totalSteps}
            {currentLine > 0 && (
              <span className="ml-2 text-gray-500">
                (Line {currentLine})
              </span>
            )}
          </div>
        </div>
        {truncated && (
          <div className="mt-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            ⚠️ Program exceeded step limit - trace truncated
          </div>
        )}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Variable Inspector */}
        <VariableInspector
          locals={locals}
          globals={globals}
          previousLocals={previousLocals}
          previousGlobals={previousGlobals}
        />

        {/* Call Stack */}
        <CallStackPanel callStack={callStack} />
      </div>
    </div>
  );
}
