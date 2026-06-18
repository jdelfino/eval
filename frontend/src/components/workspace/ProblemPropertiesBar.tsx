'use client';

import React, { useState, useRef } from 'react';
import { Menu } from '@/components/ui/Menu';
import { LANGUAGE_VERSIONS } from '@/lib/languageVersions';

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
// Derived from LANGUAGE_VERSIONS (single source of truth in lib/languageVersions.ts)

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const LANGUAGE_LABELS: Record<'python' | 'java', string> = {
  python: `${capitalize('python')} ${LANGUAGE_VERSIONS['python']}`,
  java: `${capitalize('java')} ${LANGUAGE_VERSIONS['java']}`,
};

const LANGUAGE_BACKEND: Record<string, 'python' | 'java'> = Object.fromEntries(
  (Object.keys(LANGUAGE_LABELS) as Array<'python' | 'java'>).map((k) => [LANGUAGE_LABELS[k], k])
) as Record<string, 'python' | 'java'>;

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
      className="border border-border bg-bg"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 24,
        padding: '0 9px',
        borderRadius: 12,
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
        className="text-fg-muted"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span className="text-fg">{value}</span>
      <span className="text-fg-muted" style={{ fontSize: 10 }}>▾</span>
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

  const langMenuItems = (Object.values(LANGUAGE_LABELS) as string[]).map((display) => ({
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
      className="border-b border-border bg-bg-raised"
      style={{
        height: 36,
        padding: '0 14px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
        className="border-l border-border"
        style={{
          height: 16,
          flexShrink: 0,
        }}
      />

      {/* Tag chips */}
      {problemTags.map((tag) => (
        <span
          key={tag}
          className="bg-bg-sunken text-fg-muted border border-border"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
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
            className="text-fg-subtle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              height: 12,
              padding: 0,
              border: 'none',
              background: 'transparent',
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
          className="border border-border bg-bg text-fg"
          style={{
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
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
          className="text-fg-subtle"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'transparent',
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
