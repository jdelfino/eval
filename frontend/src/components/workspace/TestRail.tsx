'use client';

import React from 'react';
import { Pill } from '@/components/ui/Pill';
import { StateDot } from '@/components/ui/StateDot';
import { Button } from '@/components/ui/Button';
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
}: TestRailProps) {
  return (
    <aside
      data-testid="workspace-test-rail"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--bg-raised)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Rail header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          height: 32,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-sunken)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: 'var(--fg-muted)',
            }}
          >
            {title}
          </span>
          {selectedSummary && (
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
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
            testId={`testrail-row-${test.id}`}
          />
        ))}
        {tests.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              color: 'var(--fg-subtle)',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {emptyHint ?? 'No tests yet.'}
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
  testId?: string;
}

function TestRow({ test, active, mode, onSelect, onRun, onDebug, testId }: TestRowProps) {
  const showControls = active && mode !== 'view';

  return (
    <div
      data-testid={testId}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        background: active ? 'var(--bg)' : 'transparent',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* Active indicator bar */}
      {active && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--accent)',
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
        {/* Primary row: dot + name + kind pill + [hidden pill] + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-testid="state-dot">
            <StateDot state={test.state} />
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              color: 'var(--fg)',
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
          {!test.visible && (
            <Pill tone="warn">hidden</Pill>
          )}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--fg-subtle)',
              flexShrink: 0,
            }}
          >
            {test.t}
          </span>
        </div>

        {/* Kind preview line */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-muted)',
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
            {/* mode='edit' slot: G2 wires the "Edit body" button here */}
          </div>
        )}
      </div>
    </div>
  );
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
