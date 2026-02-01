'use client';

import React, { useState, useEffect } from 'react';

interface ProblemInputProps {
  onUpdateProblem: (
    problem: { title: string; description: string; starterCode: string },
    executionSettings?: {
      stdin?: string;
      randomSeed?: number;
      attachedFiles?: Array<{ name: string; content: string }>;
    }
  ) => void;
  initialProblem?: { title: string; description: string; starterCode: string } | null;
  initialExecutionSettings?: {
    stdin?: string;
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  };
}

export default function ProblemInput({ 
  onUpdateProblem,
  initialProblem = null,
  initialExecutionSettings = {}
}: ProblemInputProps) {
  const [problemText, setProblemText] = useState(initialProblem?.description || '');
  const [exampleInput, setExampleInput] = useState(initialExecutionSettings.stdin || '');
  const [showExampleInput, setShowExampleInput] = useState(!!initialExecutionSettings.stdin);
  const [randomSeed, setRandomSeed] = useState(initialExecutionSettings.randomSeed !== undefined ? String(initialExecutionSettings.randomSeed) : '');
  const [showRandomSeed, setShowRandomSeed] = useState(initialExecutionSettings.randomSeed !== undefined);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; content: string }>>(initialExecutionSettings.attachedFiles || []);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [fileError, setFileError] = useState('');

  // Sync state when initial values change (e.g., when rejoining a session)
  useEffect(() => {
    setProblemText(initialProblem?.description || '');
    setExampleInput(initialExecutionSettings?.stdin || '');
    setShowExampleInput(!!initialExecutionSettings?.stdin);
    setRandomSeed(initialExecutionSettings?.randomSeed !== undefined ? String(initialExecutionSettings.randomSeed) : '');
    setShowRandomSeed(initialExecutionSettings?.randomSeed !== undefined);
    setAttachedFiles(initialExecutionSettings?.attachedFiles || []);
  }, [initialProblem, initialExecutionSettings]);

  const addFile = () => {
    setFileError('');
    
    if (!newFileName.trim()) {
      setFileError('File name is required');
      return;
    }

    if (attachedFiles.some(f => f.name === newFileName.trim())) {
      setFileError('File with this name already exists');
      return;
    }

    const maxSize = 10 * 1024; // 10KB
    const maxFiles = 5;

    if (attachedFiles.length >= maxFiles) {
      setFileError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    if (newFileContent.length > maxSize) {
      setFileError(`File content exceeds 10KB limit`);
      return;
    }

    setAttachedFiles([...attachedFiles, { 
      name: newFileName.trim(), 
      content: newFileContent 
    }]);
    setNewFileName('');
    setNewFileContent('');
  };

  const updateFile = (index: number, content: string) => {
    const updated = [...attachedFiles];
    updated[index] = { ...updated[index], content };
    setAttachedFiles(updated);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(attachedFiles.filter((_, i) => i !== index));
  };

  const handleUpdate = () => {
    const seed = showRandomSeed && randomSeed ? parseInt(randomSeed, 10) : undefined;
    const problem = {
      title: '', // TODO: Add title input field
      description: problemText,
      starterCode: '', // TODO: Add starter code input field
    };
    const executionSettings = {
      stdin: showExampleInput ? exampleInput : undefined,
      randomSeed: seed,
      attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
    };
    onUpdateProblem(problem, executionSettings);
  };

  return (
    <div style={{ padding: '1rem', border: '1px solid #ccc', marginBottom: '1rem' }}>
      <h3>Problem Statement</h3>
      <textarea
        value={problemText}
        onChange={(e) => setProblemText(e.target.value)}
        placeholder="Enter the problem for students to solve..."
        style={{
          width: '100%',
          minHeight: '150px',
          padding: '0.5rem',
          fontSize: '1rem',
          fontFamily: 'monospace',
          marginBottom: '0.5rem',
        }}
      />
      
      {/* Optional Example Input Section */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showExampleInput}
            onChange={(e) => setShowExampleInput(e.target.checked)}
          />
          <span>Include example input for students (optional)</span>
        </label>
      </div>
      
      {showExampleInput && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: '#666' }}>
            Example Input:
          </label>
          <textarea
            value={exampleInput}
            onChange={(e) => setExampleInput(e.target.value)}
            placeholder="Enter example input (one value per line)..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '0.5rem',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            This input will be pre-loaded for students when they open the program input section.
          </div>
        </div>
      )}

      {/* Optional Random Seed Section */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showRandomSeed}
            onChange={(e) => setShowRandomSeed(e.target.checked)}
          />
          <span>Set random seed for reproducible results (optional)</span>
        </label>
      </div>
      
      {showRandomSeed && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', color: '#666' }}>
            Random Seed:
          </label>
          <input
            type="number"
            value={randomSeed}
            onChange={(e) => setRandomSeed(e.target.value)}
            placeholder="e.g., 42"
            style={{
              width: '200px',
              padding: '0.5rem',
              fontSize: '0.9rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
            This seed will be used to initialize Python's random module for consistent results across runs.
          </div>
        </div>
      )}

      {/* File Attachments Section */}
      <div style={{ marginBottom: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', padding: '1rem' }}>
        <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Attached Files (optional)</h4>
        
        {/* Add new file */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: 'bold' }}>
            Add File:
          </label>
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="filename.txt"
            style={{
              width: '300px',
              padding: '0.5rem',
              fontSize: '0.9rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              marginBottom: '0.5rem',
            }}
          />
          <textarea
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            placeholder="Paste file content here..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '0.5rem',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              border: '1px solid #ccc',
              borderRadius: '4px',
              marginBottom: '0.5rem',
            }}
          />
          <button
            onClick={addFile}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Add File
          </button>
          
          {fileError && (
            <div style={{ color: '#d32f2f', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {fileError}
            </div>
          )}
          
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
            Max 5 files, 10KB each. Files will be available in student's working directory.
          </div>
        </div>

        {/* List of attached files */}
        {attachedFiles.length > 0 && (
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Current Files:
            </div>
            {attachedFiles.map((file, index) => (
              <div key={index} style={{ 
                marginBottom: '1rem',
                border: '1px solid #eee',
                borderRadius: '4px',
                padding: '0.5rem',
                backgroundColor: '#f9f9f9',
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeFile(index)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={file.content}
                  onChange={(e) => updateFile(index, e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '0.5rem',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                  {(file.content.length / 1024).toFixed(2)} KB
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <button
        onClick={handleUpdate}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Update Problem
      </button>
    </div>
  );
}
