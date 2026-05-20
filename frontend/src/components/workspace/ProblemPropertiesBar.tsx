'use client';

import React, { useState, useRef } from 'react';
import { Menu } from '@/components/ui/Menu';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProblemPropertiesBarProps {
  problemClass: { id: string; name: string } | null;
  classes: Array<{ id: string; name: string }>;
  problemLanguage: 'python' | 'java';
  problemTags: string[];
  onChangeProperties: (next: {
    class: string | null;
    language: 'python' | 'java';
    tags: string[];
  }) => void;
}

// ─── Language display map ─────────────────────────────────────────────────────

const LANGUAGE_LABELS: Record<'python' | 'java', string> = {
  python: 'Python 3.11',
  java: 'Java 21',
};

const LANGUAGE_BACKEND: Record<string, 'python' | 'java'> = {
  'Python 3.11': 'python',
  'Java 21': 'java',
};

// ─── ChipButton ───────────────────────────────────────────────────────────────

interface ChipButtonProps {
  label: string;
  value: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}

function ChipButton({ label, value, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 9px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.3,
          color: 'var(--fg-muted)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ color: 'var(--fg)' }}>{value}</span>
      <span style={{ color: 'var(--fg-muted)', fontSize: 10 }}>▾</span>
    </button>
  );
}

// ─── ProblemPropertiesBar ─────────────────────────────────────────────────────

/**
 * ProblemPropertiesBar — horizontal bar rendered between the Ribbon and editor area
 * in the author skin. Provides Class, Language, and Tag chip-buttons for editing
 * problem metadata.
 */
export function ProblemPropertiesBar({
  problemClass,
  classes,
  problemLanguage,
  problemTags,
  onChangeProperties,
}: ProblemPropertiesBarProps) {
  const [classMenuOpen, setClassMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // ── helpers ───────────────────────────────────────────────────────────────

  function commitTags(raw: string) {
    const next = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...problemTags, ...next]));
    if (next.length > 0) {
      onChangeProperties({
        class: problemClass?.id ?? null,
        language: problemLanguage,
        tags: merged,
      });
    }
    setTagInputValue('');
    setTagInputOpen(false);
  }

  function removeTag(tag: string) {
    onChangeProperties({
      class: problemClass?.id ?? null,
      language: problemLanguage,
      tags: problemTags.filter((t) => t !== tag),
    });
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitTags(tagInputValue);
    } else if (e.key === 'Escape') {
      setTagInputValue('');
      setTagInputOpen(false);
    } else if (e.key === 'Backspace' && tagInputValue === '' && problemTags.length > 0) {
      onChangeProperties({
        class: problemClass?.id ?? null,
        language: problemLanguage,
        tags: problemTags.slice(0, -1),
      });
    }
  }

  // ── class menu items ───────────────────────────────────────────────────────

  const classMenuItems = classes.map((cls) => ({
    label: cls.name,
    onSelect: () => {
      onChangeProperties({
        class: cls.id,
        language: problemLanguage,
        tags: problemTags,
      });
    },
  }));

  // ── language menu items ───────────────────────────────────────────────────

  const langMenuItems = (['Python 3.11', 'Java 21'] as const).map((display) => ({
    label: display,
    onSelect: () => {
      onChangeProperties({
        class: problemClass?.id ?? null,
        language: LANGUAGE_BACKEND[display],
        tags: problemTags,
      });
    },
  }));

  // ── class chip anchor ─────────────────────────────────────────────────────

  const classAnchor = (
    <ChipButton
      label="CLASS"
      value={problemClass?.name ?? 'None'}
      onClick={() => {}}
    />
  );

  // ── language chip anchor ──────────────────────────────────────────────────

  const langAnchor = (
    <ChipButton
      label="LANGUAGE"
      value={LANGUAGE_LABELS[problemLanguage]}
      onClick={() => {}}
    />
  );

  return (
    <div
      style={{
        height: 36,
        padding: '0 14px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-raised)',
        flexShrink: 0,
      }}
    >
      {/* Class chip + dropdown */}
      <Menu
        anchor={classAnchor}
        items={classMenuItems}
        open={classMenuOpen}
        onOpenChange={setClassMenuOpen}
      />

      {/* Language chip + dropdown */}
      <Menu
        anchor={langAnchor}
        items={langMenuItems}
        open={langMenuOpen}
        onOpenChange={setLangMenuOpen}
      />

      {/* Vertical separator */}
      <div
        style={{
          borderLeft: '1px solid var(--border)',
          height: 16,
          flexShrink: 0,
        }}
      />

      {/* Tag chips */}
      {problemTags.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
            background: 'var(--bg-sunken)',
            color: 'var(--fg-muted)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            whiteSpace: 'nowrap',
          }}
        >
          #{tag}
          <button
            type="button"
            aria-label="×"
            onClick={() => removeTag(tag)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              height: 12,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--fg-subtle)',
              cursor: 'pointer',
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}

      {/* + tag adder */}
      {tagInputOpen ? (
        <input
          ref={tagInputRef}
          type="text"
          value={tagInputValue}
          onChange={(e) => setTagInputValue(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => {
            if (tagInputValue) commitTags(tagInputValue);
            else setTagInputOpen(false);
          }}
          autoFocus
          placeholder="tag, tag…"
          style={{
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--fg)',
            outline: 'none',
            width: 100,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setTagInputOpen(true);
            // focus is handled by autoFocus on the input
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--fg-subtle)',
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + tag
        </button>
      )}
    </div>
  );
}

export default ProblemPropertiesBar;
