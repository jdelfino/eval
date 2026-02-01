import React from 'react';
import { CallFrame } from '@/server/types';

interface CallStackPanelProps {
  callStack: CallFrame[];
  darkTheme?: boolean;
}

export function CallStackPanel({ callStack, darkTheme = false }: CallStackPanelProps) {
  // Hide call stack if there are fewer than 2 entries (just main program)
  if (callStack.length < 2) {
    return null;
  }

  return (
    <div className={`rounded-lg overflow-hidden border ${
      darkTheme ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
    }`}>
      <div className={`px-4 py-2 border-b ${
        darkTheme ? 'bg-gray-900 border-gray-700' : 'bg-gray-100 border-gray-300'
      }`}>
        <h3 className={`text-sm font-semibold ${darkTheme ? 'text-gray-200' : 'text-gray-700'}`}>Call Stack</h3>
      </div>

      <div className={darkTheme ? 'divide-y divide-gray-700' : 'divide-y divide-gray-200'}>
        {callStack.map((frame, index) => {
          const isCurrentFrame = index === callStack.length - 1;
          return (
            <div
              key={index}
              className={`flex items-center px-4 py-2 text-sm ${
                isCurrentFrame ? (darkTheme ? 'bg-blue-900/30 font-semibold' : 'bg-blue-50 font-semibold') : ''
              }`}
            >
              {isCurrentFrame && (
                <span className={darkTheme ? 'mr-2 text-blue-400' : 'mr-2 text-blue-600'}>→</span>
              )}
              <span className={`font-mono ${darkTheme ? 'text-gray-200' : 'text-gray-900'}`}>
                {frame.functionName === '<module>' ? '<main program>' : frame.functionName}
              </span>
              <span className={`mx-2 ${darkTheme ? 'text-gray-500' : 'text-gray-400'}`}>:</span>
              <span className={`font-mono ${darkTheme ? 'text-gray-400' : 'text-gray-600'}`}>
                {frame.line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
