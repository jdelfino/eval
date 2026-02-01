import React from 'react';
import { VariableInspector } from './VariableInspector';
import { CallStackPanel } from './CallStackPanel';

interface DebuggerSidebarProps {
  currentStep: number;
  totalSteps: number;
  currentLine: number;
  canStepForward: boolean;
  canStepBackward: boolean;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToFirst: () => void;
  onJumpToLast: () => void;
  onExit: () => void;
  truncated?: boolean;
  onRequestTrace: () => void;
  hasTrace: boolean;
  isLoading: boolean;
  darkTheme?: boolean;
  locals?: Record<string, any>;
  globals?: Record<string, any>;
  previousLocals?: Record<string, any>;
  previousGlobals?: Record<string, any>;
  callStack?: any[];
}

export function DebuggerSidebar({
  currentStep,
  totalSteps,
  currentLine,
  canStepForward,
  canStepBackward,
  onStepForward,
  onStepBackward,
  onJumpToFirst,
  onJumpToLast,
  onExit,
  truncated,
  onRequestTrace,
  hasTrace,
  isLoading,
  darkTheme = false,
  locals = {},
  globals = {},
  previousLocals = {},
  previousGlobals = {},
  callStack = []
}: DebuggerSidebarProps) {
  const bgClass = darkTheme ? 'bg-gray-800' : 'bg-white';
  const textClass = darkTheme ? 'text-gray-200' : 'text-gray-800';
  const borderClass = darkTheme ? 'border-gray-700' : 'border-gray-300';
  const hoverClass = darkTheme ? 'hover:bg-gray-700' : 'hover:bg-gray-50';
  const buttonBgClass = darkTheme ? 'bg-gray-700' : 'bg-white';
  const buttonTextClass = darkTheme ? 'text-gray-200' : 'text-gray-700';

  return (
    <div className={`h-full flex flex-col ${bgClass} ${textClass}`}>
      <div className="p-4 space-y-4">
        {!hasTrace ? (
          /* Debug start controls */
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Python Debugger</h3>
              <p className="text-xs opacity-80">
                Step through your code line by line and inspect variables at each step.
              </p>
            </div>
            <button
              onClick={onRequestTrace}
              disabled={isLoading}
              className={`w-full px-4 py-2 rounded text-white ${
                isLoading
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
              }`}
            >
              {isLoading ? '⏳ Loading Trace...' : '🐛 Start Debugging'}
            </button>
            <div className={`text-xs ${darkTheme ? 'text-gray-400' : 'text-gray-500'} space-y-1`}>
              <p className="font-semibold">How to use:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Click Start Debugging to begin</li>
                <li>Use arrow buttons to step through code</li>
                <li>Watch variables change in the output panel</li>
                <li>Press Esc or Exit to return to editing</li>
              </ul>
            </div>
          </>
        ) : (
          /* Debug navigation controls */
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Active Debugging</h3>
                <button
                  onClick={onExit}
                  className={`px-3 py-1 text-xs ${buttonTextClass} ${buttonBgClass} border ${borderClass} rounded ${hoverClass}`}
                >
                  Exit
                </button>
              </div>
              <div className="text-sm">
                Step {currentStep + 1} of {totalSteps}
                {currentLine > 0 && (
                  <span className="ml-2 opacity-70">
                    (Line {currentLine})
                  </span>
                )}
              </div>
              {truncated && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                  ⚠️ Step limit exceeded - trace truncated
                </div>
              )}
            </div>

            {/* Navigation controls */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={onJumpToFirst}
                  disabled={!canStepBackward}
                  className={`px-2 py-1 text-sm font-medium ${buttonTextClass} ${buttonBgClass} border ${borderClass} rounded ${hoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="First step (Home)"
                  aria-label="First step"
                >
                  ⏮
                </button>
                <button
                  onClick={onStepBackward}
                  disabled={!canStepBackward}
                  className={`flex-1 px-3 py-1 text-sm font-medium ${buttonTextClass} ${buttonBgClass} border ${borderClass} rounded ${hoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Previous step (← or P)"
                >
                  ◀ Prev
                </button>
                <button
                  onClick={onStepForward}
                  disabled={!canStepForward}
                  className={`flex-1 px-3 py-1 text-sm font-medium ${buttonTextClass} ${buttonBgClass} border ${borderClass} rounded ${hoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Next step (→ or N)"
                >
                  Next ▶
                </button>
                <button
                  onClick={onJumpToLast}
                  disabled={!canStepForward}
                  className={`px-2 py-1 text-sm font-medium ${buttonTextClass} ${buttonBgClass} border ${borderClass} rounded ${hoverClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Last step (End)"
                  aria-label="Last step"
                >
                  ⏭
                </button>
              </div>
            </div>

            {/* Variable Inspector */}
            <div className="mt-4">
              <VariableInspector
                locals={locals}
                globals={globals}
                previousLocals={previousLocals}
                previousGlobals={previousGlobals}
                darkTheme={darkTheme}
              />
            </div>

            {/* Call Stack */}
            <div className="mt-4">
              <CallStackPanel callStack={callStack} darkTheme={darkTheme} />
            </div>
          </>
        )}
      </div>

      {/* Keyboard shortcuts at the bottom */}
      {hasTrace && (
        <div className={`mt-auto border-t ${borderClass} p-4`}>
          <div className={`text-xs ${darkTheme ? 'text-gray-400' : 'text-gray-500'} space-y-1`}>
            <p className="font-semibold">Keyboard shortcuts:</p>
            <ul className="space-y-1">
              <li>← / → : Step backward / forward</li>
              <li>P / N : Previous / Next step</li>
              <li>Home / End : First / Last step</li>
              <li>Esc : Exit debug mode</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
