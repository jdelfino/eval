'use client';

import { useRevisionHistory } from '@/hooks/useRevisionHistory';
import { useState, useEffect, useMemo } from 'react';

interface RevisionViewerProps {
  sessionId: string;
  studentId: string;
  studentName: string;
  onClose: () => void;
}

export default function RevisionViewer({
  sessionId,
  studentId,
  studentName,
  onClose,
}: RevisionViewerProps) {
  const {
    revisions,
    currentRevision,
    currentIndex,
    loading,
    error,
    goToRevision,
    next,
    previous,
    goToFirst,
    goToLast,
    hasNext,
    hasPrevious,
    totalRevisions,
  } = useRevisionHistory({
    sessionId,
    studentId,
  });

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatElapsedTime = (index: number) => {
    if (revisions.length === 0 || index >= revisions.length) return '';
    
    const sessionStart = revisions[0].timestamp;
    const current = revisions[index].timestamp;
    const elapsed = Math.floor((current.getTime() - sessionStart.getTime()) / 1000);
    
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    return `+${minutes}m ${seconds}s`;
  };

  const formatTimeSinceLastRevision = (index: number) => {
    if (revisions.length === 0 || index >= revisions.length || index === 0) return '';
    
    const previous = revisions[index - 1].timestamp;
    const current = revisions[index].timestamp;
    const elapsed = Math.floor((current.getTime() - previous.getTime()) / 1000);
    
    if (elapsed < 60) {
      return `(+${elapsed}s)`;
    }
    
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    return `(+${minutes}m ${seconds}s)`;
  };

  // Track changes and trigger highlight animation
  const [highlightKey, setHighlightKey] = useState(0);
  
  useEffect(() => {
    // Trigger highlight animation when revision changes
    setHighlightKey(prev => prev + 1);
  }, [currentIndex]);

  // Calculate which lines changed compared to previous revision
  const changedLines = useMemo(() => {
    if (currentIndex === 0 || !currentRevision) return new Set<number>();
    
    const prevRevision = revisions[currentIndex - 1];
    if (!prevRevision) return new Set<number>();
    
    const prevLines = prevRevision.code.split('\n');
    const currLines = currentRevision.code.split('\n');
    const changes = new Set<number>();
    
    // Simple line-by-line comparison
    const maxLines = Math.max(prevLines.length, currLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (prevLines[i] !== currLines[i]) {
        changes.add(i);
      }
    }
    
    return changes;
  }, [currentIndex, currentRevision, revisions]);

  // Render code with line highlighting
  const renderCodeWithHighlights = () => {
    if (!currentRevision) return '';
    
    const lines = currentRevision.code.split('\n');
    return lines.map((line, idx) => {
      const isChanged = changedLines.has(idx);
      return (
        <div
          key={`${highlightKey}-${idx}`}
          style={{
            backgroundColor: isChanged ? '#3d5016' : 'transparent',
            animation: isChanged ? 'fadeOut 2s ease-out forwards' : 'none',
            transition: 'background-color 0.3s',
          }}
        >
          {line || '\n'}
        </div>
      );
    });
  };

  if (loading && totalRevisions === 0) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '90%',
          maxHeight: '90%',
        }}>
          <p>Loading revision history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '90%',
          maxHeight: '90%',
        }}>
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={onClose} style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '1rem',
          }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (totalRevisions === 0) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '90%',
          maxHeight: '90%',
        }}>
          <h3>No Revision History</h3>
          <p>No code revisions have been captured for {studentName} yet.</p>
          <button onClick={onClose} style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '1rem',
          }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '900px',
          height: '600px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>
              Revision History: {studentName}
            </h3>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>
              Revision {currentIndex + 1}/{totalRevisions} | {' '}
              {currentRevision && formatTimestamp(currentRevision.timestamp)} | {' '}
              {formatElapsedTime(currentIndex)}
              {formatTimeSinceLastRevision(currentIndex) && ` ${formatTimeSinceLastRevision(currentIndex)}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#e0e0e0',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1.2rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Code Display */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem',
          backgroundColor: '#f5f5f5',
          minHeight: 0,
        }}>
          <style>{`
            @keyframes fadeOut {
              0% { background-color: #3d5016; }
              100% { background-color: transparent; }
            }
          `}</style>
          <pre style={{
            margin: 0,
            padding: '1rem',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            minHeight: '100%',
            lineHeight: '1.5',
          }}>
            {renderCodeWithHighlights()}
          </pre>
        </div>

        {/* Controls */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid #ddd',
          flexShrink: 0,
        }}>
          {/* Navigation Buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            justifyContent: 'center',
          }}>
            <button
              onClick={goToFirst}
              disabled={!hasPrevious}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: hasPrevious ? '#0070f3' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: hasPrevious ? 'pointer' : 'not-allowed',
              }}
            >
              ⏮ First
            </button>
            <button
              onClick={previous}
              disabled={!hasPrevious}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: hasPrevious ? '#0070f3' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: hasPrevious ? 'pointer' : 'not-allowed',
              }}
            >
              ◀ Prev
            </button>
            <button
              onClick={next}
              disabled={!hasNext}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: hasNext ? '#0070f3' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: hasNext ? 'pointer' : 'not-allowed',
              }}
            >
              Next ▶
            </button>
            <button
              onClick={goToLast}
              disabled={!hasNext}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: hasNext ? '#0070f3' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: hasNext ? 'pointer' : 'not-allowed',
              }}
            >
              Last ⏭
            </button>
          </div>

          {/* Timeline Slider */}
          <div style={{ width: '100%' }}>
            <input
              type="range"
              min={0}
              max={totalRevisions - 1}
              value={currentIndex}
              onChange={(e) => goToRevision(parseInt(e.target.value))}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.5rem',
              fontSize: '0.85rem',
              color: '#666',
            }}>
              <span>{revisions[0] && formatTimestamp(revisions[0].timestamp)}</span>
              {totalRevisions > 1 && (
                <span>
                  {revisions[totalRevisions - 1] && formatTimestamp(revisions[totalRevisions - 1].timestamp)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
