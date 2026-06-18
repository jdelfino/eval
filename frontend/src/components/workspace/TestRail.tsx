'use client';

import React, { useState } from 'react';
import { Pill } from '@/components/ui/Pill';
import { StateDot } from '@/components/ui/StateDot';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import type { TestRailItem } from '@/lib/testRail';

/** KIND_TONE maps test kind to the Pill tone used in the rail. */
const KIND_TONE: Record<TestRailItem['kind'], 'ok' | 'info'> = {
  io:     'ok',
  pytest: 'info',
};

export interface TestRailProps {
  tests: TestRailItem[];
  /** Id of the currently active (selected) test row */
  activeId?: string;
  /** Rail interaction mode */
  mode?: 'run' | 'edit' | 'view';
  /** Fired when a test row is clicked */
  onSelectTest?: (id: string) => void;
  /** Fired when the per-row Run button is clicked */
  onRunTest?: (id: string) => void;
  /** Fired when the per-row Debug button is clicked */
  onDebugTest?: (id: string) => void;
  /** Fired when the header "Run all" button is clicked */
  onRunAll?: () => void;
  /** Whether a "run all" execution is in flight */
  isRunningAll?: boolean;
  /** Rail header title */
  title?: string;
  /** Small summary string shown next to the title */
  selectedSummary?: string;
  /** Text rendered when tests is empty */
  emptyHint?: string;
  // ── G2 author affordances ─────────────────────────────────────────────────
  /** Fired when the per-row "Edit body" button is clicked (edit mode only) */
  onEditTest?: (id: string) => void;
  /** When true, renders a split-button "+ Add <kind> test" row at the bottom */
  railShowAdd?: boolean;
  /** Fired when the main add button or a menu item is clicked */
  onAddTest?: (kind: 'io' | 'pytest') => void;
  /**
   * Sticky default kind for the main add button label.
   * undefined → 'io' (first-use default).
   */
  lastCreatedKind?: 'io' | 'pytest';
}

/**
 * TestRail — right-side panel listing all test cases with state, kind pill,
 * time, and per-row Run/Debug controls when the row is active.
 *
 * This component is intentionally dumb — it takes a joined TestRailItem[] and
 * fires callbacks. Use toTestRailItems(cases, results) to build the input.
 */
export function TestRail({
  tests,
  activeId,
  mode = 'run',
  onSelectTest,
  onRunTest,
  onDebugTest,
  onRunAll,
  isRunningAll = false,
  title = 'Tests',
  selectedSummary,
  emptyHint,
  onEditTest,
  railShowAdd = false,
  onAddTest,
  lastCreatedKind,
}: TestRailProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const stickyKind: 'io' | 'pytest' = lastCreatedKind ?? 'io';
  return (
    <aside
      data-testid="workspace-test-rail"
      className="bg-bg-raised border-l border-border"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Rail header */}
      <div
        className="border-b border-border bg-bg-sunken"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: 32,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="text-fg-muted"
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </span>
          {selectedSummary && (
            <span className="text-fg-subtle" style={{ fontSize: 11 }}>
              {selectedSummary}
            </span>
          )}
        </div>
        {onRunAll && (
          <Button
            data-testid="workspace-run-all"
            variant="run"
            size="sm"
            onClick={onRunAll}
            disabled={isRunningAll}
          >
            {isRunningAll ? 'Running…' : 'Run all'}
          </Button>
        )}
      </div>

      {/* Test list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tests.map(test => (
          <TestRow
            key={test.id}
            test={test}
            active={test.id === activeId}
            mode={mode}
            onSelect={() => onSelectTest?.(test.id)}
            onRun={() => onRunTest?.(test.id)}
            onDebug={() => onDebugTest?.(test.id)}
            onEdit={() => onEditTest?.(test.id)}
            testId={`testrail-row-${test.id}`}
          />
        ))}
        {tests.length === 0 && (
          <div
            className="text-fg-subtle"
            style={{
              padding: '24px 16px',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {emptyHint ?? 'No tests yet.'}
          </div>
        )}

        {/* Split-button add-test row — only when railShowAdd=true */}
        {railShowAdd && (
          <div
            className="border-b border-border"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 10px',
            }}
          >
            <Button
              variant="quiet"
              size="sm"
              onClick={() => onAddTest?.(stickyKind)}
            >
              Add {kindLabel(stickyKind)} test
            </Button>
            <Menu
              anchor={
                <Button
                  variant="quiet"
                  size="sm"
                  aria-label="▾"
                >
                  ▾
                </Button>
              }
              items={[
                { label: 'IO test', onSelect: () => onAddTest?.('io') },
                { label: 'Pytest test', onSelect: () => onAddTest?.('pytest') },
              ]}
              open={addMenuOpen}
              onOpenChange={setAddMenuOpen}
              align="left"
            />
          </div>
        )}
      </div>
    </aside>
  );
}

interface TestRowProps {
  test: TestRailItem;
  active: boolean;
  mode: 'run' | 'edit' | 'view';
  onSelect: () => void;
  onRun: () => void;
  onDebug: () => void;
  onEdit: () => void;
  testId?: string;
}

function TestRow({ test, active, mode, onSelect, onRun, onDebug, onEdit, testId }: TestRowProps) {
  const showControls = active && mode !== 'view';

  return (
    <div
      data-testid={testId}
      onClick={onSelect}
      className="border-b border-border"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        background: active ? 'var(--bg)' : 'transparent',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* Active indicator bar */}
      {active && (
        <div
          className="bg-accent"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
          }}
        />
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {/* Primary row: dot + name + kind pill + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-testid="state-dot">
            <StateDot state={test.state} />
          </span>
          <span
            className="text-fg"
            style={{
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}
          >
            {test.name}
          </span>
          <Pill tone={KIND_TONE[test.kind]} mono>
            {test.kind}
          </Pill>
          <span
            className="text-fg-subtle"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              flexShrink: 0,
            }}
          >
            {test.t}
          </span>
        </div>

        {/* Kind preview line */}
        <div
          className="text-fg-muted"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: 14,
          }}
        >
          {kindPreview(test)}
        </div>

        {/* Per-row action controls — only on active row, only in run/edit mode */}
        {showControls && (
          <div style={{ display: 'flex', gap: 6, paddingTop: 4, paddingLeft: 14 }}>
            <Button
              variant="quiet"
              size="sm"
              onClick={e => {
                e.stopPropagation();
                onRun();
              }}
            >
              ▶ Run
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={e => {
                e.stopPropagation();
                onDebug();
              }}
            >
              Debug
            </Button>
            {/* Edit body button — only in edit mode */}
            {mode === 'edit' && (
              <Button
                data-testid="edit-body-btn"
                variant="quiet"
                size="sm"
                onClick={e => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                Edit body
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * kindLabel — maps a test kind to its human-readable label for the split-button.
 */
function kindLabel(kind: 'io' | 'pytest'): string {
  return kind === 'io' ? 'IO' : 'Pytest';
}

/**
 * kindPreview — produces a short preview string for the inline mono line.
 */
function kindPreview(test: TestRailItem): string {
  if (test.kind === 'io' && test.io) {
    const firstLine = test.io.stdin.split('\n')[0];
    return firstLine ? `stdin: "${firstLine}…"` : '';
  }
  if (test.kind === 'pytest' && test.pytest) {
    return test.pytest.target;
  }
  return '';
}

export default TestRail;
