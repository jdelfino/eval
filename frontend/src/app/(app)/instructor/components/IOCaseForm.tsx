'use client';

/**
 * IOCaseForm Component
 *
 * Renders an ordered list of I/O test case definitions for instructor authoring.
 *
 * Each case has:
 * - name: text label for the case
 * - input: stdin provided to the program (textarea)
 * - expected_output: optional expected stdout (textarea). When empty, the case is
 *   treated as "run-only" (Example Input). When set, it is a test case with
 *   pass/fail validation (Test Case).
 * - match_type: how to compare output (exact | contains | regex)
 * - random_seed: optional integer seed
 * - attached_files: optional file name + content pairs (not yet implemented in UI)
 *
 * Visual distinction:
 * - Cases WITH expected_output → badge "Test Case"
 * - Cases WITHOUT expected_output → badge "Example Input"
 *
 * Controls:
 * - Add Case button appends a new blank case
 * - Remove button per case removes it
 * - Move Up / Move Down buttons reorder cases
 */

import React from 'react';
import type { IOTestCase } from '@/types/problem';

export interface IOCaseFormProps {
  /** Current list of I/O test cases */
  cases: IOTestCase[];
  /** Called whenever the list changes */
  onChange: (cases: IOTestCase[]) => void;
  /** Optional section heading label */
  label?: string;
  /** When true, hides add/remove/reorder controls */
  readOnly?: boolean;
}

/** Generate a default case name for a given index */
function defaultCaseName(index: number): string {
  return `Case ${index + 1}`;
}

/** Re-index `order` fields on the array so they are 0-based and contiguous */
function reindex(cases: IOTestCase[]): IOTestCase[] {
  return cases.map((c, i) => ({ ...c, order: i }));
}

/**
 * IOCaseForm renders an editable list of I/O test cases.
 */
export default function IOCaseForm({
  cases,
  onChange,
  label = 'Test Cases',
  readOnly = false,
}: IOCaseFormProps) {
  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAdd = () => {
    const newCase: IOTestCase = {
      name: defaultCaseName(cases.length),
      input: '',
      match_type: 'exact',
      order: cases.length,
    };
    onChange([...cases, newCase]);
  };

  const handleRemove = (index: number) => {
    const updated = cases.filter((_, i) => i !== index);
    onChange(reindex(updated));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...cases];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(reindex(updated));
  };

  const handleMoveDown = (index: number) => {
    if (index === cases.length - 1) return;
    const updated = [...cases];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(reindex(updated));
  };

  const handleFieldChange = <K extends keyof IOTestCase>(
    index: number,
    field: K,
    value: IOTestCase[K] | undefined
  ) => {
    const updated = cases.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    );
    onChange(updated);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderCaseTypeBadge = (c: IOTestCase) => {
    const isTestCase = c.expected_output !== undefined && c.expected_output !== '';
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.125rem 0.5rem',
          fontSize: '0.7rem',
          fontWeight: 600,
          borderRadius: '9999px',
          backgroundColor: isTestCase ? '#d1fae5' : '#dbeafe',
          color: isTestCase ? '#065f46' : '#1e40af',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {isTestCase ? 'Test Case' : 'Example Input'}
      </span>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#212529',
          }}
        >
          {label}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Add Case"
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: '#0d6efd',
              backgroundColor: 'transparent',
              border: '1px solid #0d6efd',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <svg
              style={{ width: '0.875rem', height: '0.875rem' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Case
          </button>
        )}
      </div>

      {/* Empty state */}
      {cases.length === 0 && (
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            color: '#6c757d',
            fontStyle: 'italic',
          }}
        >
          No cases defined. Click &ldquo;Add Case&rdquo; to create one.
        </p>
      )}

      {/* Case list */}
      {cases.map((c, index) => (
        <div
          key={index}
          style={{
            border: '1px solid #dee2e6',
            borderRadius: '0.375rem',
            backgroundColor: '#fff',
            overflow: 'hidden',
          }}
        >
          {/* Case header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
            }}
          >
            {/* Name input */}
            <input
              type="text"
              value={c.name}
              onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
              disabled={readOnly}
              placeholder="Case name"
              style={{
                flex: 1,
                padding: '0.25rem 0.5rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
                minWidth: 0,
              }}
            />
            {/* Type badge */}
            {renderCaseTypeBadge(c)}

            {/* Reorder + remove controls */}
            {!readOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    aria-label="Move Up"
                    title="Move up"
                    style={iconBtnStyle}
                  >
                    <svg style={{ width: '0.875rem', height: '0.875rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
                {index < cases.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    aria-label="Move Down"
                    title="Move down"
                    style={iconBtnStyle}
                  >
                    <svg style={{ width: '0.875rem', height: '0.875rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  aria-label="Remove Case"
                  title="Remove case"
                  style={{ ...iconBtnStyle, color: '#dc3545' }}
                >
                  <svg style={{ width: '0.875rem', height: '0.875rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Case body */}
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Input (stdin) */}
            <div>
              <label
                htmlFor={`case-input-${index}`}
                style={fieldLabelStyle}
              >
                Input (stdin)
              </label>
              <textarea
                id={`case-input-${index}`}
                value={c.input}
                onChange={(e) => handleFieldChange(index, 'input', e.target.value)}
                disabled={readOnly}
                placeholder="Program input (stdin)..."
                rows={3}
                style={textareaStyle}
              />
            </div>

            {/* Expected output */}
            <div>
              <label
                htmlFor={`case-expected-${index}`}
                style={fieldLabelStyle}
              >
                Expected Output{' '}
                <span style={{ fontWeight: 400, color: '#6c757d' }}>(optional — leave blank for run-only)</span>
              </label>
              <textarea
                id={`case-expected-${index}`}
                value={c.expected_output ?? ''}
                onChange={(e) =>
                  handleFieldChange(index, 'expected_output', e.target.value)
                }
                disabled={readOnly}
                placeholder="Expected program output..."
                rows={3}
                style={textareaStyle}
              />
            </div>

            {/* Match type + Random seed (on one row) */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label
                  htmlFor={`case-match-${index}`}
                  style={fieldLabelStyle}
                >
                  Match Type
                </label>
                <select
                  id={`case-match-${index}`}
                  value={c.match_type}
                  onChange={(e) =>
                    handleFieldChange(index, 'match_type', e.target.value as IOTestCase['match_type'])
                  }
                  disabled={readOnly}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.8125rem',
                    border: '1px solid #ced4da',
                    borderRadius: '0.25rem',
                  }}
                >
                  <option value="exact">Exact</option>
                  <option value="contains">Contains</option>
                  <option value="regex">Regex</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label
                  htmlFor={`case-seed-${index}`}
                  style={fieldLabelStyle}
                >
                  Random Seed
                </label>
                <input
                  id={`case-seed-${index}`}
                  type="number"
                  value={c.random_seed ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    handleFieldChange(
                      index,
                      'random_seed',
                      val === '' ? undefined : parseInt(val, 10)
                    );
                  }}
                  disabled={readOnly}
                  placeholder="e.g. 42"
                  style={{
                    width: '6rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.8125rem',
                    border: '1px solid #ced4da',
                    borderRadius: '0.25rem',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style objects (avoids repeating inline styles)
// ---------------------------------------------------------------------------

const iconBtnStyle: React.CSSProperties = {
  padding: '0.25rem',
  backgroundColor: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#6c757d',
  display: 'flex',
  alignItems: 'center',
  lineHeight: 1,
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#495057',
  marginBottom: '0.25rem',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  fontSize: '0.8125rem',
  border: '1px solid #ced4da',
  borderRadius: '0.25rem',
  resize: 'vertical',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
};
