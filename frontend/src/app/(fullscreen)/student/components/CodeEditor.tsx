'use client';

import Editor from '@monaco-editor/react';
import React, { useEffect, useRef, useState } from 'react';
import ExecutionSettingsComponent from './ExecutionSettings';
import { DebuggerSidebar } from './DebuggerSidebar';
import MarkdownContent from '@/components/MarkdownContent';
import type { ExecutionSettings } from '@/server/types/problem';
import { useResponsiveLayout, useSidebarSection, useMobileViewport } from '@/hooks/useResponsiveLayout';
import type { Problem } from '@/server/types/problem';
import type * as Monaco from 'monaco-editor';
import { Undo2, Redo2 } from 'lucide-react';

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
}

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  onRun?: (executionSettings: ExecutionSettings) => void;
  isRunning?: boolean;
  exampleInput?: string;
  onStdinChange?: (stdin: string) => void;
  randomSeed?: number;
  onRandomSeedChange?: (seed: number | undefined) => void;
  attachedFiles?: Array<{ name: string; content: string }>;
  onAttachedFilesChange?: (files: Array<{ name: string; content: string }>) => void;
  readOnly?: boolean;
  executionResult?: ExecutionResult | null;
  useApiExecution?: boolean;
  title?: string;
  showRunButton?: boolean;
  problem?: Problem | { title: string; description?: string; starterCode?: string } | null;
  onLoadStarterCode?: (starterCode: string) => void;
  externalEditorRef?: React.MutableRefObject<any>;
  debugger?: ReturnType<typeof import('@/hooks/useDebugger').useDebugger>;
  onProblemEdit?: (updates: { title?: string; description?: string }) => void;
  editableProblem?: boolean;
  forceDesktop?: boolean;
  outputPosition?: 'bottom' | 'right';
  fontSize?: number;
}

export default function CodeEditor({
  code,
  onChange,
  onRun,
  isRunning = false,
  exampleInput,
  onStdinChange,
  randomSeed,
  onRandomSeedChange,
  attachedFiles,
  onAttachedFilesChange,
  readOnly = false,
  executionResult = null,
  useApiExecution = false,
  title = 'Your Code',
  showRunButton = true,
  problem = null,
  onLoadStarterCode,
  externalEditorRef,
  debugger: debuggerHook,
  onProblemEdit,
  editableProblem = false,
  forceDesktop = false,
  outputPosition = 'bottom',
  fontSize,
}: CodeEditorProps) {
  const largeOutput = fontSize && fontSize >= 20;
  const outputTextSm = largeOutput ? 'text-base' : 'text-sm';
  const outputTextXs = largeOutput ? 'text-sm' : 'text-xs';
  const editorRef = useRef<any>(null);
  const [stdin, setStdin] = useState('');
  const [localIsRunning, setLocalIsRunning] = useState(false);
  const [localExecutionResult, setLocalExecutionResult] = useState<ExecutionResult | null>(null);
  const decorationsRef = useRef<string[]>([]);

  // Compute effective read-only state: either explicitly readOnly or debugger is active
  const isReadOnly = readOnly || (debuggerHook?.hasTrace ?? false);

  // Responsive layout detection
  const _isDesktop = useResponsiveLayout(1024);
  const _mobileViewport = useMobileViewport();
  const isDesktop = forceDesktop ? true : _isDesktop;
  const mobileViewport = forceDesktop ? { isMobile: false, isTablet: false, isVerySmall: false, isDesktop: true, width: 1920 } : _mobileViewport;
  const { isCollapsed: isSettingsCollapsed, toggle: toggleSettings, setCollapsed: setSettingsCollapsed } = useSidebarSection('execution-settings', false);
  const { isCollapsed: isProblemCollapsed, toggle: toggleProblem, setCollapsed: setProblemCollapsed } = useSidebarSection('problem-panel', false);
  const { isCollapsed: isDebuggerCollapsed, toggle: toggleDebugger, setCollapsed: setDebuggerCollapsed } = useSidebarSection('debugger-panel', true);

  // Mobile-specific state (separate from desktop sidebar state)
  const [mobileProblemCollapsed, setMobileProblemCollapsed] = useState(true);
  const [mobileSettingsCollapsed, setMobileSettingsCollapsed] = useState(true);
  const [mobileDebuggerCollapsed, setMobileDebuggerCollapsed] = useState(true);

  // Mobile view toggle: 'code' | 'output'
  const [mobileView, setMobileView] = useState<'code' | 'output'>('code');

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(320); // 320px = w-80
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Output section resize state
  const [outputHeight, setOutputHeight] = useState(150); // Start at 150px
  const [outputWidthFraction, setOutputWidthFraction] = useState(0.35); // 35% of container for side-by-side
  const [isResizingOutput, setIsResizingOutput] = useState(false);
  const outputResizeRef = useRef<HTMLDivElement>(null);

  // Handle sidebar resizing
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX - 48; // Subtract activity bar width (48px = w-12)
        // Constrain width between 200px and 600px
        const constrainedWidth = Math.min(Math.max(newWidth, 200), 600);
        setSidebarWidth(constrainedWidth);
      }

      if (isResizingOutput && outputResizeRef.current) {
        const container = outputResizeRef.current.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();

        if (outputPosition === 'right') {
          // Horizontal resize: compute fraction of container width
          const newWidth = containerRect.right - e.clientX;
          const fraction = newWidth / containerRect.width;
          const constrainedFraction = Math.min(Math.max(fraction, 0.15), 0.6);
          setOutputWidthFraction(constrainedFraction);
        } else {
          const newHeight = containerRect.bottom - e.clientY;
          const maxHeight = containerRect.height * 0.8; // Max 80% of container
          // Constrain height between 100px and 80% of container
          const constrainedHeight = Math.min(Math.max(newHeight, 100), maxHeight);
          setOutputHeight(constrainedHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setIsResizingOutput(false);
    };

    if (isResizing || isResizingOutput) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isResizingOutput ? (outputPosition === 'right' ? 'col-resize' : 'row-resize') : 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, isResizingOutput, outputPosition]);

  // Ensure only one sidebar is open at a time on mount
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      const openPanels = [
        !isSettingsCollapsed,
        !isProblemCollapsed,
        !isDebuggerCollapsed
      ].filter(Boolean).length;

      if (openPanels > 1) {
        // Multiple panels open - keep only one
        if (debuggerHook?.hasTrace && !isDebuggerCollapsed) {
          // Prioritize debugger if active
          setSettingsCollapsed(true);
          setProblemCollapsed(true);
        } else if (problem && !isProblemCollapsed) {
          // Then problem if it exists
          setSettingsCollapsed(true);
          setDebuggerCollapsed(true);
        } else {
          // Otherwise keep settings
          setProblemCollapsed(true);
          setDebuggerCollapsed(true);
        }
      }
    }
  }, [isSettingsCollapsed, isProblemCollapsed, isDebuggerCollapsed, problem, debuggerHook?.hasTrace, setSettingsCollapsed, setProblemCollapsed, setDebuggerCollapsed]);

  // Ensure only one sidebar is open at a time
  const handleToggleProblem = () => {
    if (isProblemCollapsed) {
      // Opening problem panel - close others
      setSettingsCollapsed(true);
      setDebuggerCollapsed(true);
    }
    toggleProblem();
  };

  const handleToggleSettings = () => {
    if (isSettingsCollapsed) {
      // Opening settings panel - close others
      setProblemCollapsed(true);
      setDebuggerCollapsed(true);
    }
    toggleSettings();
  };

  const handleToggleDebugger = () => {
    if (isDebuggerCollapsed) {
      // Opening debugger panel - close others
      setProblemCollapsed(true);
      setSettingsCollapsed(true);
    }
    toggleDebugger();
  };

  // Wrapper to call both internal state and parent callback
  const handleStdinChange = (value: string) => {
    setStdin(value);
    onStdinChange?.(value);
  };

  const handleOutputMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingOutput(true);
  };

  // Use local state for API execution, or passed props for WebSocket execution
  const effectiveIsRunning = useApiExecution ? localIsRunning : isRunning;
  const effectiveResult = useApiExecution ? localExecutionResult : executionResult;

  // Auto-grow output section when results appear (up to 40%)
  // Skip auto-grow for right-positioned output to avoid jarring width changes
  useEffect(() => {
    if (outputPosition === 'right') return;

    if (effectiveResult && outputResizeRef.current) {
      const container = outputResizeRef.current.parentElement;
      if (!container) return;

      const containerHeight = container.getBoundingClientRect().height;
      const maxHeight = containerHeight * 0.8;

      // Estimate needed height based on content
      const hasOutput = effectiveResult.output && effectiveResult.output.length > 0;
      const hasError = effectiveResult.error && effectiveResult.error.length > 0;

      let targetHeight = 150; // Minimum
      if (hasOutput || hasError) {
        // Grow to accommodate content, up to 80%
        const contentLines = (effectiveResult.output || effectiveResult.error || '').split('\n').length;
        targetHeight = Math.min(150 + (contentLines * 20), maxHeight);
      }

      setOutputHeight(Math.min(targetHeight, maxHeight));
    } else if (!effectiveResult) {
      // Reset to initial size when no results
      setOutputHeight(150);
    }
  }, [effectiveResult, outputPosition]);

  // Initialize stdin with example input if provided
  useEffect(() => {
    if (exampleInput) {
      setStdin(exampleInput);
    }
  }, [exampleInput]);

  // Auto-open debugger sidebar when debugging starts (desktop only)
  useEffect(() => {
    if (debuggerHook?.hasTrace && isDesktop && setDebuggerCollapsed) {
      setDebuggerCollapsed(false);
      // Close other sidebars
      setSettingsCollapsed(true);
      setProblemCollapsed(true);
    }
  }, [debuggerHook?.hasTrace, isDesktop, setDebuggerCollapsed, setSettingsCollapsed, setProblemCollapsed]);

  // Update line highlighting when debugging
  useEffect(() => {
    if (!editorRef.current || !debuggerHook) return;

    const editor = editorRef.current as Monaco.editor.IStandaloneCodeEditor;
    const currentStep = debuggerHook.getCurrentStep();
    const currentLine = currentStep?.line;

    // Clear decorations when not debugging or no current line
    if (!debuggerHook.hasTrace || !currentLine) {
      const newDecorations = editor.deltaDecorations(decorationsRef.current, []);
      decorationsRef.current = newDecorations;
      return;
    }

    // Add decoration for current line
    const newDecorations = editor.deltaDecorations(decorationsRef.current, [
      {
        range: {
          startLineNumber: currentLine,
          startColumn: 1,
          endLineNumber: currentLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'debugger-line-highlight',
          glyphMarginClassName: 'debugger-line-glyph',
        },
      },
    ]);
    decorationsRef.current = newDecorations;
  }, [debuggerHook?.hasTrace, debuggerHook?.currentStep]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    // Also store in external ref if provided
    if (externalEditorRef) {
      externalEditorRef.current = editor;
    }
    if (!isReadOnly) {
      editor.focus();
    }
  };

  const handleRunViaApi = async () => {
    if (!code || code.trim().length === 0) {
      setLocalExecutionResult({
        success: false,
        output: '',
        error: 'Please write some code before running',
        executionTime: 0,
      });
      return;
    }

    setLocalIsRunning(true);
    setLocalExecutionResult(null);

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          stdin: stdin || undefined,
          randomSeed,
          attachedFiles,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to execute code');
      }

      const result = await response.json();
      setLocalExecutionResult(result);
    } catch (error: any) {
      setLocalExecutionResult({
        success: false,
        output: '',
        error: error.message || 'Failed to execute code',
        executionTime: 0,
      });
    } finally {
      setLocalIsRunning(false);
    }
  };

  const handleRun = () => {
    if (useApiExecution) {
      handleRunViaApi();
    } else if (onRun) {
      onRun({ stdin: stdin || undefined, randomSeed, attachedFiles });
    }
  };

  // Helper function to annotate output lines with step numbers
  const getAnnotatedOutput = () => {
    if (!debuggerHook?.trace?.steps) return [];

    const annotatedLines: Array<{ stepNumber: number; text: string }> = [];
    let previousOutput = '';

    debuggerHook.trace.steps.forEach((step, index) => {
      const currentOutput = step.stdout || '';

      // Find new lines added in this step
      if (currentOutput.length > previousOutput.length) {
        const newContent = currentOutput.substring(previousOutput.length);
        const lines = newContent.split('\n');

        lines.forEach((line, lineIndex) => {
          // Skip the last empty line if it's just from splitting
          if (lineIndex === lines.length - 1 && line === '') return;

          annotatedLines.push({
            stepNumber: index + 1,
            text: line
          });
        });
      }

      previousOutput = currentOutput;
    });

    return annotatedLines;
  };

  const handleUndo = () => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'undo', null);
    }
  };

  const handleRedo = () => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'redo', null);
    }
  };

  return (
    /*
     * CRITICAL LAYOUT REQUIREMENTS - DO NOT REMOVE:
     *
     * This component uses flex layout with the following MANDATORY structure:
     * 1. Root div MUST have height: 100% to fill parent container
     * 2. Root div MUST be flex-col to stack header, content, and output vertically
     * 3. Content area MUST have flex-1 AND min-h-0 to allow proper shrinking
     * 4. Activity bar (gray-800 sidebar) MUST have height: 100% to fill its parent
     * 5. All flex containers in the chain MUST have min-h-0 when using flex-1
     *
     * Why min-h-0 is critical:
     * - By default, flex items have min-height: auto, which prevents shrinking below content size
     * - This causes backgrounds (like activity bar) to not extend to parent height
     * - min-h-0 allows flex items to shrink below their content size
     * - This is a common CSS gotcha that has caused this bug repeatedly
     *
     * Testing checklist when modifying:
     * - Desktop: Activity bar background extends to bottom of editor
     * - Mobile: All sections properly fill their containers
     * - Resizing: Output panel resizes smoothly without leaving gaps
     * - Parent height: Works with both percentage and fixed pixel heights
     */
    <div className="border border-gray-300 rounded flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="px-4 py-2 bg-gray-100 border-b border-gray-300 flex justify-between items-center flex-shrink-0">
        <span className="font-bold">{title}</span>
        <div className="flex gap-2">
          {/* Undo/Redo buttons - only show when not read-only */}
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                className="px-3 py-2 rounded text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                className="px-3 py-2 rounded text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 size={16} />
              </button>
            </>
          )}
          {showRunButton && (
            <>
              {debuggerHook?.hasTrace ? (
                <button
                  type="button"
                  onClick={debuggerHook.reset}
                  className="px-4 py-2 rounded text-white bg-red-600 hover:bg-red-700 cursor-pointer"
                >
                  ✕ Exit Debugging
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={effectiveIsRunning}
                  className={`px-4 py-2 rounded text-white ${
                    effectiveIsRunning
                      ? 'bg-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 cursor-pointer'
                  }`}
                >
                  {effectiveIsRunning ? '⏳ Running...' : '▶ Run Code'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - Responsive Layout */}
      {/* CRITICAL: min-h-0 is required on flex-1 parent to allow children to shrink below content size */}
      <div className={`flex flex-col flex-1 min-h-0 ${!isDesktop ? 'overflow-y-auto' : ''}`}>
        {/* Mobile: Action Bar */}
        {!isDesktop && (
          <div className="bg-gray-800 border-b border-gray-700 flex flex-col flex-shrink-0" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            {/* Primary row: Code/Output toggle */}
            <div className="flex items-center px-2 py-2 gap-2 border-b border-gray-700">
              <button
                type="button"
                onClick={() => setMobileView('code')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  mobileView === 'code'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
                aria-label="Show Code"
                data-testid="mobile-show-code"
              >
                Show Code
              </button>
              <button
                type="button"
                onClick={() => setMobileView('output')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  mobileView === 'output'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
                aria-label="Show Output"
                data-testid="mobile-show-output"
              >
                Show Output
              </button>
            </div>
            {/* Secondary row: Panel toggles */}
            <div className="flex items-center px-2 py-2 gap-2">
              {problem && (
                <button
                  type="button"
                  onClick={() => setMobileProblemCollapsed(!mobileProblemCollapsed)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    !mobileProblemCollapsed
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                  aria-label="Toggle Problem"
                >
                  Problem
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileSettingsCollapsed(!mobileSettingsCollapsed)}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  !mobileSettingsCollapsed
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
                aria-label="Toggle Settings"
              >
                Settings
              </button>
              {debuggerHook && (
                <button
                  type="button"
                  onClick={() => setMobileDebuggerCollapsed(!mobileDebuggerCollapsed)}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    !mobileDebuggerCollapsed
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                  aria-label="Toggle Debugger"
                >
                  Debugger
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile: Problem Section */}
        {!isDesktop && !mobileProblemCollapsed && problem && (
          <div className="bg-gray-800 text-gray-200 border-b border-gray-700 flex-shrink-0">
            <div className="p-4">
              <h2 className="text-xl font-bold mb-4 text-gray-100">{problem.title}</h2>
              {problem.description && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <MarkdownContent content={problem.description} darkTheme={true} />
                </div>
              )}
              {problem.starterCode && onLoadStarterCode && !editableProblem && (
                <button
                  type="button"
                  onClick={() => onLoadStarterCode(problem.starterCode || '')}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                >
                  Restore Starter Code
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile: Settings Section */}
        {!isDesktop && !mobileSettingsCollapsed && (
          <div className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <ExecutionSettingsComponent
              stdin={stdin}
              onStdinChange={handleStdinChange}
              randomSeed={randomSeed}
              onRandomSeedChange={onRandomSeedChange}
              attachedFiles={attachedFiles}
              onAttachedFilesChange={onAttachedFilesChange}
              exampleInput={exampleInput}
              readOnly={readOnly}
              inSidebar={true}
              darkTheme={true}
            />
          </div>
        )}

        {/* Mobile: Debugger Section */}
        {!isDesktop && !mobileDebuggerCollapsed && debuggerHook && (
          <div className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <DebuggerSidebar
              currentStep={debuggerHook.currentStep}
              totalSteps={debuggerHook.totalSteps}
              currentLine={debuggerHook.getCurrentStep()?.line || 0}
              canStepForward={debuggerHook.canStepForward}
              canStepBackward={debuggerHook.canStepBackward}
              onStepForward={debuggerHook.stepForward}
              onStepBackward={debuggerHook.stepBackward}
              onJumpToFirst={debuggerHook.jumpToFirst}
              onJumpToLast={debuggerHook.jumpToLast}
              onExit={debuggerHook.reset}
              truncated={debuggerHook.trace?.truncated}
              onRequestTrace={() => debuggerHook.requestTrace(code, stdin || undefined)}
              hasTrace={debuggerHook.hasTrace}
              isLoading={debuggerHook.isLoading}
              darkTheme={true}
              locals={debuggerHook.getCurrentLocals()}
              globals={debuggerHook.getCurrentGlobals()}
              previousLocals={debuggerHook.getPreviousStep()?.locals || {}}
              previousGlobals={debuggerHook.getPreviousStep()?.globals || {}}
              callStack={debuggerHook.getCurrentCallStack()}
            />
          </div>
        )}

        {/* Desktop layout: Activity bar + optional sidebar + editor */}
        {/* CRITICAL: Parent flex row needs min-h-0 to allow proper height distribution */}
        <div className={`flex flex-row flex-1 min-h-0 min-w-0 ${!isDesktop ? '' : ''}`}>
          {/* Left Sidebar (Desktop only) - VS Code style, hidden in readOnly mode */}
          {isDesktop && !readOnly && (
            <div className="flex flex-row flex-shrink-0 min-h-0" style={{ height: '100%' }}>
              {/* Activity Bar (Icon bar) - CRITICAL: Must have full height to fill parent */}
              <div className="w-12 bg-gray-800 flex flex-col items-center py-2 gap-1 flex-shrink-0" style={{ height: '100%' }}>
              {/* Problem icon (only show if problem exists) */}
              {problem && (
                <button
                  type="button"
                  onClick={handleToggleProblem}
                  className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
                    !isProblemCollapsed
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                  aria-label="Problem"
                  title="Problem"
                >
                  {/* Document/Problem icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </button>
              )}

              {/* Settings icon */}
              <button
                type="button"
                onClick={handleToggleSettings}
                className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
                  !isSettingsCollapsed
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
                aria-label="Execution Settings"
                title="Execution Settings"
              >
                {/* Settings/Sliders icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </button>

              {/* Debugger icon (only show if debuggerHook exists) */}
              {debuggerHook && (
                <button
                  type="button"
                  onClick={handleToggleDebugger}
                  className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
                    !isDebuggerCollapsed
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                  aria-label="Debugger"
                  title="Debugger"
                >
                  {/* Bug icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a4 4 0 0 1 4 4v2h-8V6a4 4 0 0 1 4-4z" />
                    <path d="M8 8v8a4 4 0 0 0 8 0V8" />
                    <line x1="4" y1="10" x2="8" y2="10" />
                    <line x1="4" y1="14" x2="8" y2="14" />
                    <line x1="16" y1="10" x2="20" y2="10" />
                    <line x1="16" y1="14" x2="20" y2="14" />
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="8" y1="18" x2="6" y2="21" />
                    <line x1="16" y1="18" x2="18" y2="21" />
                  </svg>
                </button>
              )}
            </div>

            {/* Side Panel (expands when active) */}
            {(!isProblemCollapsed && problem) && (
              <div
                ref={resizeRef}
                className="bg-gray-800 text-gray-200 border-r border-gray-700 flex flex-col flex-shrink-0 relative"
                style={{ width: `${sidebarWidth}px`, maxHeight: '100%', height: '100%' }}
              >
                <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 font-bold flex items-center justify-between flex-shrink-0">
                  <span>Problem</span>
                  <button
                    type="button"
                    onClick={toggleProblem}
                    className="text-gray-400 hover:text-gray-100 text-xl leading-none"
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {editableProblem && onProblemEdit ? (
                    /* Editable problem view for instructor */
                    <>
                      <div className="mb-4">
                        <label htmlFor="problem-title" className="block text-xs font-medium text-gray-400 mb-1">
                          Title *
                        </label>
                        <input
                          id="problem-title"
                          type="text"
                          value={problem.title || ''}
                          onChange={(e) => onProblemEdit({ title: e.target.value })}
                          placeholder="e.g., Two Sum Problem"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      <div className="mb-4">
                        <label htmlFor="problem-description" className="block text-xs font-medium text-gray-400 mb-1">
                          Description
                        </label>
                        <textarea
                          id="problem-description"
                          value={problem.description || ''}
                          onChange={(e) => onProblemEdit({ description: e.target.value })}
                          placeholder="Describe the problem, requirements, and any constraints..."
                          rows={12}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                      </div>
                      {problem.starterCode && onLoadStarterCode && !editableProblem && (
                        <button
                          type="button"
                          onClick={() => onLoadStarterCode(problem.starterCode || '')}
                          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm w-full"
                        >
                          Restore Starter Code
                        </button>
                      )}
                    </>
                  ) : (
                    /* Read-only problem view for student */
                    <>
                      <h2 className="text-xl font-bold mb-4">{problem.title}</h2>
                      {problem.description && (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <MarkdownContent content={problem.description} darkTheme={true} />
                        </div>
                      )}
                      {problem.starterCode && onLoadStarterCode && !editableProblem && (
                        <button
                          type="button"
                          onClick={() => onLoadStarterCode(problem.starterCode || '')}
                          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                        >
                          Restore Starter Code
                        </button>
                      )}
                    </>
                  )}
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
                  style={{
                    background: isResizing ? '#3b82f6' : 'transparent',
                  }}
                  title="Drag to resize"
                />
              </div>
            )}

            {!isSettingsCollapsed && (
              <div
                className="bg-gray-800 text-gray-200 border-r border-gray-700 flex flex-col flex-shrink-0 relative"
                style={{ width: `${sidebarWidth}px`, maxHeight: '100%', height: '100%' }}
              >
                <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 font-bold flex items-center justify-between flex-shrink-0">
                  <span>Execution Settings</span>
                  <button
                    type="button"
                    onClick={toggleSettings}
                    className="text-gray-400 hover:text-gray-100 text-xl leading-none"
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ExecutionSettingsComponent
                    stdin={stdin}
                    onStdinChange={handleStdinChange}
                    randomSeed={randomSeed}
                    onRandomSeedChange={onRandomSeedChange}
                    attachedFiles={attachedFiles}
                    onAttachedFilesChange={onAttachedFilesChange}
                    exampleInput={exampleInput}
                    readOnly={readOnly}
                    inSidebar={true}
                  />
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
                  style={{
                    background: isResizing ? '#3b82f6' : 'transparent',
                  }}
                  title="Drag to resize"
                />
              </div>
            )}

            {!isDebuggerCollapsed && debuggerHook && (
              <div
                className="bg-gray-800 text-gray-200 border-r border-gray-700 flex flex-col flex-shrink-0 relative"
                style={{ width: `${sidebarWidth}px`, maxHeight: '100%', height: '100%' }}
              >
                <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 font-bold flex items-center justify-between flex-shrink-0">
                  <span>Debugger</span>
                  <button
                    type="button"
                    onClick={toggleDebugger}
                    className="text-gray-400 hover:text-gray-100 text-xl leading-none"
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <DebuggerSidebar
                    currentStep={debuggerHook.currentStep}
                    totalSteps={debuggerHook.totalSteps}
                    currentLine={debuggerHook.getCurrentStep()?.line || 0}
                    canStepForward={debuggerHook.canStepForward}
                    canStepBackward={debuggerHook.canStepBackward}
                    onStepForward={debuggerHook.stepForward}
                    onStepBackward={debuggerHook.stepBackward}
                    onJumpToFirst={debuggerHook.jumpToFirst}
                    onJumpToLast={debuggerHook.jumpToLast}
                    onExit={debuggerHook.reset}
                    truncated={debuggerHook.trace?.truncated}
                    onRequestTrace={() => debuggerHook.requestTrace(code, stdin || undefined)}
                    hasTrace={debuggerHook.hasTrace}
                    isLoading={debuggerHook.isLoading}
                    darkTheme={true}
                    locals={debuggerHook.getCurrentLocals()}
                    globals={debuggerHook.getCurrentGlobals()}
                    previousLocals={debuggerHook.getPreviousStep()?.locals || {}}
                    previousGlobals={debuggerHook.getPreviousStep()?.globals || {}}
                    callStack={debuggerHook.getCurrentCallStack()}
                  />
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors"
                  style={{
                    background: isResizing ? '#3b82f6' : 'transparent',
                  }}
                  title="Drag to resize"
                />
              </div>
            )}
          </div>
        )}

        {/* Main Editor Area */}
        <div className={`flex-1 flex ${outputPosition === 'right' && isDesktop ? 'flex-row' : 'flex-col'} min-w-0 ${isDesktop ? 'min-h-0' : ''}`} style={!isDesktop ? { minHeight: '400px' } : {}} data-testid="editor-output-container">
          {/* Code Editor - grows to fill remaining space */}
          {/* On mobile, show based on mobileView toggle; on desktop, always show */}
          <div
            className="flex-1 min-w-0"
            style={
              !isDesktop
                ? (mobileView === 'output'
                    ? { display: 'none' } // Hide editor when showing output on mobile
                    : debuggerHook?.hasTrace
                      ? {
                          minHeight: 'auto',
                          height: `${Math.min(Math.max((code.split('\n').length + 3) * 21, 150), 400)}px`,
                          flexGrow: 0,
                          flexShrink: 0
                        }
                      : { minHeight: '300px' }
                  )
                : { minHeight: 0 }
            }
          >
            <Editor
              height="100%"
              defaultLanguage="python"
              value={code}
              onChange={(value) => !isReadOnly && onChange(value || '')}
              onMount={handleEditorDidMount}
              theme="vs-dark"
              options={{
                // Disable minimap on all screens for cleaner mobile experience
                minimap: { enabled: false },
                // Increase font size on mobile for better readability (16px minimum for iOS zoom prevention)
                fontSize: fontSize ?? (mobileViewport.isMobile ? 16 : 14),
                // Hide line numbers on very small screens to save space
                lineNumbers: mobileViewport.isVerySmall ? 'off' : 'on',
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: isReadOnly,
                readOnlyMessage: debuggerHook?.hasTrace
                  ? { value: 'Exit debug mode to edit code' }
                  : undefined,
                // Only show glyph margin when debugging (used for debugger line indicator)
                glyphMargin: !!debuggerHook?.hasTrace && !mobileViewport.isVerySmall,
                // Disable folding gutter and line decoration width to remove extra gutter space when not debugging
                folding: false,
                lineDecorationsWidth: debuggerHook?.hasTrace ? 10 : 0,
                // Enable word wrap on mobile for better readability
                wordWrap: mobileViewport.isMobile || mobileViewport.isTablet ? 'on' : 'off',
                // Improve touch scrolling
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'auto',
                  // Use native scrollbars on mobile for better touch experience
                  useShadows: !mobileViewport.isMobile,
                  verticalScrollbarSize: mobileViewport.isMobile ? 12 : 10,
                  horizontalScrollbarSize: mobileViewport.isMobile ? 12 : 10,
                },
                // Disable hover and suggestions on very small screens to improve performance
                hover: { enabled: !mobileViewport.isVerySmall },
                quickSuggestions: mobileViewport.isVerySmall ? false : true,
              }}
            />
          </div>

          {/* Execution Results or Debugger - Always Visible - Resizable (on desktop) */}
          {/* On mobile, show based on mobileView toggle; on desktop, always show */}
          <div
            ref={outputResizeRef}
            data-testid="output-area"
            className={`${outputPosition === 'right' && isDesktop ? 'border-l' : 'border-t'} border-gray-700 overflow-y-auto flex-shrink-0 relative`}
            style={
              !isDesktop
                ? (mobileView === 'code'
                    ? { display: 'none' } // Hide output when showing code on mobile
                    : { flex: 1, minHeight: '200px' } // Fill space when showing output on mobile
                  )
                : outputPosition === 'right'
                  ? { width: `${outputWidthFraction * 100}%` }
                  : { height: `${outputHeight}px` }
            }
          >
            {/* Resize handle (desktop only - remove on mobile for touch-friendly experience) */}
            {isDesktop && outputPosition === 'right' ? (
              <div
                onMouseDown={handleOutputMouseDown}
                data-testid="output-resize-handle"
                className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-10"
                style={{
                  background: isResizingOutput ? '#3b82f6' : 'transparent',
                  marginLeft: '-2px'
                }}
                title="Drag to resize output"
              />
            ) : isDesktop ? (
              <div
                onMouseDown={handleOutputMouseDown}
                data-testid="output-resize-handle"
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500 transition-colors z-10"
                style={{
                  background: isResizingOutput ? '#3b82f6' : 'transparent',
                  marginTop: '-2px'
                }}
                title="Drag to resize output"
              />
            ) : null}

            {debuggerHook?.hasTrace ? (
              /* Show debugger output when debugging */
              <div className="p-4 h-full bg-gray-900 overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-blue-400">
                    🐛 Debugger Output
                  </span>
                  <span className="text-sm text-blue-300">
                    Step {debuggerHook.currentStep + 1} of {debuggerHook.totalSteps}
                  </span>
                </div>

                {(() => {
                  const annotatedLines = getAnnotatedOutput();
                  const _currentStepOutput = debuggerHook.getCurrentStep()?.stdout || '';
                  const visibleLines = annotatedLines.filter(line => {
                    // Only show lines up to and including the current step
                    return line.stepNumber <= debuggerHook.currentStep + 1;
                  });

                  return visibleLines.length > 0 ? (
                    <div className="mt-2">
                      <div className="font-bold text-sm text-blue-300">
                        Console Output (up to current step):
                      </div>
                      <div className="bg-gray-800 p-2 rounded border border-gray-700 overflow-x-auto text-sm font-mono mt-1">
                        {visibleLines.map((line, index) => (
                          <div key={index} className="flex hover:bg-gray-750">
                            <span className="text-blue-400 select-none mr-3 flex-shrink-0" style={{ minWidth: '60px' }}>
                              [Step {line.stepNumber}]
                            </span>
                            <span className="whitespace-pre-wrap break-words flex-1 text-gray-200">{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-blue-300 italic">
                      No console output yet
                    </div>
                  );
                })()}

                {debuggerHook.error && (
                  <div className="mt-2">
                    <div className="font-bold text-sm text-red-400">
                      Error:
                    </div>
                    <pre className="bg-gray-800 p-2 rounded border border-red-900 overflow-x-auto text-sm font-mono mt-1 whitespace-pre-wrap break-words text-red-300">
                      {debuggerHook.error}
                    </pre>
                  </div>
                )}

                <div className="mt-3 text-xs text-blue-300">
                  💡 Step through your code to see how output is generated. Variables and call stack are in the sidebar.
                </div>
              </div>
            ) : effectiveResult ? (
              /* Show normal output when not debugging */
              <div className={`p-4 h-full ${
                effectiveResult.success ? 'bg-gray-900' : 'bg-gray-900'
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-bold ${
                    effectiveResult.success ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {effectiveResult.success ? '✓ Success' : '✗ Error'}
                  </span>
                  <span className={`${outputTextSm} ${
                    effectiveResult.success ? 'text-green-300' : 'text-red-300'
                  }`}>
                    Execution time: {effectiveResult.executionTime}ms
                  </span>
                </div>

                {effectiveResult.output && (
                  <div className="mt-2">
                    <div className={`font-bold ${outputTextSm} ${
                      effectiveResult.success ? 'text-green-300' : 'text-red-300'
                    }`}>
                      Output:
                    </div>
                    <pre className={`bg-gray-800 text-gray-200 p-2 rounded border border-gray-700 overflow-x-auto ${outputTextSm} font-mono mt-1 whitespace-pre-wrap break-words`}>
                      {effectiveResult.output}
                    </pre>
                  </div>
                )}

                {effectiveResult.error && (
                  <div className="mt-2">
                    <div className={`font-bold ${outputTextSm} text-red-400`}>
                      Error:
                    </div>
                    <pre className={`bg-gray-800 p-2 rounded border border-red-900 overflow-x-auto ${outputTextSm} font-mono mt-1 whitespace-pre-wrap break-words text-red-300`}>
                      {effectiveResult.error}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-gray-900 h-full flex flex-col items-center justify-center">
                {!problem ? (
                  <>
                    <p className={`text-gray-400 ${outputTextSm} italic mb-2`}>
                      Waiting for instructor to load a problem...
                    </p>
                    <p className={`text-gray-500 ${outputTextXs}`}>
                      You can start writing code while you wait.
                    </p>
                  </>
                ) : (
                  <>
                    <p className={`text-gray-400 ${outputTextSm} italic mb-2`}>
                      No output yet.
                    </p>
                    <p className={`text-gray-500 ${outputTextXs}`}>
                      Click "Run Code" to execute your program and see the results here.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
