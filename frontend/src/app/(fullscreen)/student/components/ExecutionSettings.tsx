'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface ExecutionSettingsProps {
  stdin?: string;
  onStdinChange?: (stdin: string) => void;
  randomSeed?: number;
  onRandomSeedChange?: (seed: number | undefined) => void;
  attachedFiles?: Array<{ name: string; content: string }>;
  onAttachedFilesChange?: (files: Array<{ name: string; content: string }>) => void;
  exampleInput?: string;
  readOnly?: boolean;
  inSidebar?: boolean; // New prop to indicate if component is in sidebar
  darkTheme?: boolean; // Use dark theme styling
}

export default function ExecutionSettings({
  stdin = '',
  onStdinChange,
  randomSeed,
  onRandomSeedChange,
  attachedFiles = [],
  onAttachedFilesChange,
  exampleInput,
  readOnly = false,
  inSidebar = false,
  darkTheme = false
}: ExecutionSettingsProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingSeed, setEditingSeed] = useState(false);
  const [seedInput, setSeedInput] = useState(randomSeed?.toString() || '');
  const [editingFiles, setEditingFiles] = useState(false);
  const [localFiles, setLocalFiles] = useState(attachedFiles);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  // When in sidebar, always show expanded (no collapse functionality needed)
  const shouldShowCollapse = !inSidebar;
  const isExpanded = inSidebar ? true : expanded;

  // Use dark theme if explicitly set or if in sidebar
  const useDarkTheme = darkTheme || inSidebar;

  const handleSaveSeed = () => {
    const seed = seedInput.trim() ? parseInt(seedInput, 10) : undefined;
    if (onRandomSeedChange) {
      onRandomSeedChange(seed);
    }
    setEditingSeed(false);
  };

  const handleCancelSeedEdit = () => {
    setSeedInput(randomSeed?.toString() || '');
    setEditingSeed(false);
  };

  const handleSaveFiles = () => {
    if (onAttachedFilesChange) {
      onAttachedFilesChange(localFiles);
    }
    setEditingFiles(false);
  };

  const handleCancelFilesEdit = () => {
    setLocalFiles(attachedFiles);
    setNewFileName('');
    setNewFileContent('');
    setEditingFiles(false);
  };

  const handleAddFile = () => {
    if (newFileName.trim() && newFileContent.trim()) {
      setLocalFiles([...localFiles, { name: newFileName.trim(), content: newFileContent }]);
      setNewFileName('');
      setNewFileContent('');
    }
  };

  const handleRemoveFile = (index: number) => {
    setLocalFiles(localFiles.filter((_, i) => i !== index));
  };

  const handleEditFile = (index: number) => {
    const file = localFiles[index];
    setNewFileName(file.name);
    setNewFileContent(file.content);
    handleRemoveFile(index);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const hasContent = stdin || randomSeed !== undefined || attachedFiles.length > 0;

  return (
    <div className={cn(
      !inSidebar && 'border-t',
      useDarkTheme ? 'border-gray-700 bg-transparent text-gray-200' : 'border-gray-300 bg-gray-100 text-black'
    )}>
      {shouldShowCollapse && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 bg-transparent border-none cursor-pointer text-left font-bold flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-block transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}>
              ▶
            </span>
            Execution Settings
          </div>
          {hasContent && !isExpanded && (
            <span className="text-sm text-gray-500 font-normal">
              {stdin && '📝'} {randomSeed !== undefined && '🎲'} {attachedFiles.length > 0 && `📁 ${attachedFiles.length}`}
            </span>
          )}
        </button>
      )}

      {isExpanded && (
        <div className={cn(
          'p-4',
          useDarkTheme ? 'bg-gray-800 text-gray-200' : 'bg-white text-black',
          shouldShowCollapse && (useDarkTheme ? 'border-t border-gray-700' : 'border-t border-gray-300')
        )}>
          {/* Program Input */}
          <div className="mb-4">
            <label className={cn(
              'block mb-2 font-bold text-sm',
              useDarkTheme ? 'text-gray-300' : 'text-black'
            )}>
              Program Input (stdin):
              {exampleInput && (
                <span className={cn(
                  'ml-2 text-xs font-normal',
                  useDarkTheme ? 'text-gray-400' : 'text-gray-500'
                )}>
                  (example provided by instructor)
                </span>
              )}
            </label>
            <textarea
              value={stdin}
              onChange={(e) => onStdinChange?.(e.target.value)}
              placeholder="Enter input for your program (one value per line)"
              readOnly={readOnly}
              className={cn(
                'w-full min-h-[80px] p-2 font-mono text-sm border rounded resize-y',
                useDarkTheme
                  ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400'
                  : 'bg-white border-gray-300 text-black placeholder-gray-400',
                readOnly && (useDarkTheme ? 'bg-gray-800' : 'bg-gray-100')
              )}
            />
          </div>

          {/* Random Seed */}
          <div className={cn(
            'mb-4 pt-4 border-t',
            useDarkTheme ? 'border-gray-700' : 'border-gray-200'
          )}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={cn(
                'm-0 text-sm font-bold',
                useDarkTheme ? 'text-gray-300' : 'text-black'
              )}>Random Seed:</h4>
              {!readOnly && !editingSeed && (
                <button
                  type="button"
                  onClick={() => {
                    setSeedInput(randomSeed?.toString() || '');
                    setEditingSeed(true);
                  }}
                  className="px-2 py-1 text-xs bg-blue-500 text-white border-none rounded cursor-pointer hover:bg-blue-600"
                >
                  Edit
                </button>
              )}
            </div>

            {!editingSeed ? (
              <div className={cn(
                'p-2 rounded border text-sm',
                useDarkTheme
                  ? 'bg-gray-900 border-gray-700 text-gray-200'
                  : 'bg-gray-50 border-gray-200 text-black'
              )}>
                {randomSeed !== undefined ? (
                  <code>{randomSeed}</code>
                ) : (
                  <span className={cn(
                    'italic',
                    useDarkTheme ? 'text-gray-400' : 'text-gray-500'
                  )}>No seed set (random)</span>
                )}
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="Enter seed (leave empty for random)"
                  className={cn(
                    'flex-1 p-2 border rounded text-sm',
                    useDarkTheme
                      ? 'bg-gray-700 border-gray-600 text-gray-100'
                      : 'bg-white border-gray-300 text-black'
                  )}
                />
                <button
                  type="button"
                  onClick={handleSaveSeed}
                  className="px-3 py-2 bg-green-600 text-white border-none rounded cursor-pointer text-sm hover:bg-green-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelSeedEdit}
                  className="px-3 py-2 bg-gray-500 text-white border-none rounded cursor-pointer text-sm hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}
            <p className={cn(
              'mt-2 mb-0 text-xs',
              useDarkTheme ? 'text-gray-400' : 'text-gray-500'
            )}>
              Makes random numbers predictable. Same seed = same "random" results.
            </p>
          </div>

          {/* Attached Files */}
          <div className={cn(
            'pt-4 border-t',
            useDarkTheme ? 'border-gray-700' : 'border-gray-200'
          )}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={cn(
                'm-0 text-sm font-bold',
                useDarkTheme ? 'text-gray-300' : 'text-black'
              )}>Attached Files:</h4>
              {!readOnly && !editingFiles && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalFiles(attachedFiles);
                    setEditingFiles(true);
                  }}
                  className="px-2 py-1 text-xs bg-blue-500 text-white border-none rounded cursor-pointer hover:bg-blue-600"
                >
                  Edit
                </button>
              )}
            </div>

            {!editingFiles ? (
              <>
                {attachedFiles.length === 0 ? (
                  <div className={cn(
                    'p-2 rounded border text-sm',
                    useDarkTheme
                      ? 'bg-gray-900 border-gray-700 text-gray-200'
                      : 'bg-gray-50 border-gray-200 text-black'
                  )}>
                    <span className={cn(
                      'italic',
                      useDarkTheme ? 'text-gray-400' : 'text-gray-500'
                    )}>No files attached</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {attachedFiles.map((file, index) => (
                      <div
                        key={index}
                        className={cn(
                          'p-3 rounded border',
                          useDarkTheme
                            ? 'bg-gray-900 border-gray-700 text-gray-200'
                            : 'bg-gray-50 border-gray-200 text-black'
                        )}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <strong className="text-sm">{file.name}</strong>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(file.name)}
                              title="Copy file path"
                              className="px-1.5 py-0.5 text-xs bg-gray-500 text-white border-none rounded cursor-pointer hover:bg-gray-600"
                            >
                              📋 Copy Path
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            {file.content.length} bytes
                          </span>
                        </div>
                        <pre className={cn(
                          'm-0 p-2 rounded border text-sm max-h-[150px] overflow-auto whitespace-pre-wrap break-all font-mono',
                          useDarkTheme
                            ? 'bg-gray-800 border-gray-700'
                            : 'bg-white border-gray-200'
                        )}>
                          {file.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Existing files list */}
                {localFiles.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {localFiles.map((file, index) => (
                      <div
                        key={index}
                        className={cn(
                          'p-2 rounded border flex justify-between items-center',
                          useDarkTheme
                            ? 'bg-gray-700 border-gray-600'
                            : 'bg-gray-100 border-gray-200'
                        )}
                      >
                        <span className="text-sm">{file.name}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditFile(index)}
                            className="px-2 py-1 text-xs bg-blue-500 text-white border-none rounded cursor-pointer hover:bg-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="px-2 py-1 text-xs bg-red-500 text-white border-none rounded cursor-pointer hover:bg-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new file form */}
                <div className={cn(
                  'p-3 rounded border',
                  useDarkTheme
                    ? 'bg-gray-700 border-gray-600'
                    : 'bg-gray-50 border-gray-200'
                )}>
                  <h5 className="m-0 mb-2 text-sm">Add File:</h5>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="Filename (e.g., data.txt)"
                    className={cn(
                      'w-full p-2 mb-2 border rounded text-sm',
                      useDarkTheme
                        ? 'bg-gray-800 border-gray-600 text-gray-100'
                        : 'bg-white border-gray-300 text-black'
                    )}
                  />
                  <textarea
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    placeholder="File content"
                    className={cn(
                      'w-full min-h-[80px] p-2 border rounded text-sm font-mono resize-y',
                      useDarkTheme
                        ? 'bg-gray-800 border-gray-600 text-gray-100'
                        : 'bg-white border-gray-300 text-black'
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleAddFile}
                    disabled={!newFileName.trim() || !newFileContent.trim()}
                    className={cn(
                      'mt-2 px-3 py-2 text-sm text-white border-none rounded',
                      newFileName.trim() && newFileContent.trim()
                        ? 'bg-green-600 cursor-pointer hover:bg-green-700'
                        : 'bg-gray-500 cursor-not-allowed'
                    )}
                  >
                    Add File
                  </button>
                </div>

                {/* Save/Cancel buttons */}
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleSaveFiles}
                    className="px-4 py-2 bg-green-600 text-white border-none rounded cursor-pointer text-sm hover:bg-green-700"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelFilesEdit}
                    className="px-4 py-2 bg-gray-500 text-white border-none rounded cursor-pointer text-sm hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className={cn(
              'mt-2 mb-0 text-xs',
              useDarkTheme ? 'text-gray-400' : 'text-gray-500'
            )}>
              Files your code can read from. Use the filename to open (e.g., <code>open("data.txt")</code>).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
