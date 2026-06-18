'use client';

/**
 * GenerateSolutionModal (G7 T7)
 *
 * Author-only "Generate a solution" flow built on the v4 Modal primitive. Wraps
 * the EXISTING `generateSolution({ description, starter_code?, custom_instructions? })`
 * client (DEC-12: the LLM endpoint already exists — this is a reskin, no backend).
 *
 * The modal reads the problem statement (read-only), collects optional hints and a
 * few option toggles (docstring / type hints / two approaches) that fold into the
 * `custom_instructions` string, then renders the generated draft in a CodeBlock.
 * Generated code never auto-publishes: "Use as solution.py" only fills the host
 * editor via `onUse`, and is gated on a successful generation.
 */

import React, { useState } from 'react';
import { Modal, Field, Input, Button, CodeBlock, Spinner, Icon } from '@/components/ui';
import { generateSolution } from '@/lib/api/problems';

export interface GenerateSolutionModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Close the modal (Cancel / backdrop / Escape). */
  onClose: () => void;
  /** Problem statement, shown read-only and sent as the generation `description`. */
  description: string;
  /** Optional current starter code, forwarded to the generator. */
  starterCode?: string;
  /** Called with the chosen draft when the author clicks "Use as solution.py". */
  onUse: (solution: string) => void;
}

interface OptionToggle {
  key: string;
  label: string;
  /** Text folded into custom_instructions when enabled. */
  instruction: string;
  defaultOn: boolean;
}

const OPTIONS: OptionToggle[] = [
  { key: 'docstring', label: 'Include docstring', instruction: 'Include a docstring.', defaultOn: true },
  { key: 'typeHints', label: 'Add type hints', instruction: 'Add type hints.', defaultOn: true },
  { key: 'twoApproaches', label: 'Show two approaches', instruction: 'Show two approaches.', defaultOn: false },
];

function composeInstructions(hints: string, enabled: Record<string, boolean>): string | undefined {
  const parts: string[] = [];
  const trimmedHints = hints.trim();
  if (trimmedHints) parts.push(trimmedHints);
  for (const opt of OPTIONS) {
    if (enabled[opt.key]) parts.push(opt.instruction);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function GenerateSolutionModal({
  open,
  onClose,
  description,
  starterCode,
  onUse,
}: GenerateSolutionModalProps): React.ReactElement | null {
  const [hints, setHints] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(OPTIONS.map((o) => [o.key, o.defaultOn]))
  );
  const [generated, setGenerated] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const { solution } = await generateSolution({
        description,
        starter_code: starterCode,
        custom_instructions: composeInstructions(hints, enabled),
      });
      setGenerated(solution);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate solution');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUse = () => {
    if (generated === null) return;
    onUse(generated);
    onClose();
  };

  const toggleOption = (key: string) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
        Cancel
      </Button>
      <span style={{ flex: 1 }} />
      <Button variant="quiet" onClick={handleGenerate} disabled={isGenerating}>
        {generated === null ? 'Generate' : 'Regenerate'}
      </Button>
      <Button variant="accent" onClick={handleUse} disabled={generated === null || isGenerating}>
        Use as solution.py
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      tone="accent"
      title="Generate a solution"
      sub="From the problem statement, draft a reference solution you can edit. Generated code never publishes automatically."
      width={620}
      onClose={onClose}
      footer={footer}
    >
      <Field label="Statement (read-only)">
        <div
          style={{
            padding: 10,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 12.5,
            color: 'var(--fg-muted)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {description}
        </div>
      </Field>

      <Field label="Hints for the model" hint="Optional. Tone, constraints, idioms.">
        <Input
          value={hints}
          onChange={(e) => setHints(e.target.value)}
          placeholder="Prefer a one-pass dict; comment the time complexity."
        />
      </Field>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: 'var(--fg-muted)',
          marginTop: 4,
          marginBottom: 12,
        }}
      >
        {OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={enabled[opt.key]}
              onChange={() => toggleOption(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {error && (
        <div role="alert" style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: 'var(--fg-subtle)',
          marginBottom: 6,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        Draft
      </div>

      {isGenerating ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size="md" label="Generating solution..." />
        </div>
      ) : generated !== null ? (
        <>
          <CodeBlock aria-label="generated solution">{generated}</CodeBlock>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 10,
              fontSize: 11,
              color: 'var(--fg-subtle)',
              alignItems: 'center',
            }}
          >
            <Icon name="info" size={11} /> Generated by Eval. You&apos;re responsible for what you publish.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', padding: '8px 0' }}>
          No draft yet — click Generate to draft a reference solution.
        </div>
      )}
    </Modal>
  );
}

export default GenerateSolutionModal;
