'use client';

import React from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DrawerMode = 'idle' | 'output' | 'failure' | 'debug' | 'runtime-error';

/** Failure detail for an io test case. */
export interface FailureIO {
  stdin: string;
  expected: string;
  got: string;
}

/** Failure detail for a pytest test case. */
export interface FailurePytest {
  target: string;
  trace?: string;
}

/**
 * Failure prop shape. Compatible with TestRailItem (T2) intersected with io/pytest detail.
 * kind narrows to 'io' | 'pytest' only — fn/file are out of G1 scope.
 */
export interface DrawerFailure {
  kind: 'io' | 'pytest';
  name?: string;
  io?: FailureIO;
  pytest?: FailurePytest;
}

export interface DrawerOutput {
  lines: Array<{ stream: 'out' | 'err'; text: string }>;
  status?: 'pass' | 'fail';
  summary?: string;
}

export interface DrawerDebugLocal {
  name: string;
  value: string;
  changed?: boolean;
}

export interface DrawerDebugFrame {
  frame: string;
  line: number;
}

export interface DrawerDebug {
  step: number;
  total: number;
  locals: DrawerDebugLocal[];
  stack: DrawerDebugFrame[];
  testName?: string;
  onStep?: (delta: 1 | -1) => void;
  onPlay?: () => void;
}

export interface DrawerRuntimeError {
  type: string;
  message: string;
  trace?: string;
}

export interface DrawerProps {
  mode: DrawerMode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  summary?: string;
  output?: DrawerOutput;
  failure?: DrawerFailure;
  debug?: DrawerDebug;
  runtimeError?: DrawerRuntimeError;
  closeAction?: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawerLabel(mode: DrawerMode): string {
  switch (mode) {
    case 'output':        return 'Output';
    case 'failure':       return 'Failure detail';
    case 'debug':         return 'Debugger';
    case 'runtime-error': return 'Runtime error';
    default:              return 'Console';
  }
}

function drawerHeight(mode: DrawerMode): number | string {
  switch (mode) {
    case 'debug':         return 200;
    case 'failure':       return 200;
    case 'runtime-error': return 180;
    case 'output':        return 160;
    default:              return 30; // idle collapses to bar height
  }
}

function drawerStatusColor(
  mode: DrawerMode,
  output?: DrawerOutput,
  _failure?: DrawerFailure
): string {
  if (mode === 'failure')       return 'var(--danger)';
  if (mode === 'runtime-error') return 'var(--danger)';
  if (mode === 'debug')         return 'var(--accent)';
  if (mode === 'output' && output?.status === 'fail') return 'var(--danger)';
  if (mode === 'output' && output?.status === 'pass') return 'var(--run)';
  return 'var(--fg-subtle)';
}

function drawerAutoSummary(
  mode: DrawerMode,
  output?: DrawerOutput,
  failure?: DrawerFailure,
  debug?: DrawerDebug
): string {
  if (mode === 'output')        return output?.summary ?? '—';
  if (mode === 'failure')       return failure ? `${failure.name ?? '—'} — ${failure.kind}` : '—';
  if (mode === 'debug')         return debug ? `step ${debug.step}/${debug.total} · ${debug.testName ?? '—'}` : '—';
  if (mode === 'runtime-error') return 'unhandled exception — fix and re-run';
  return 'Idle. Run a test to see output here.';
}

// ─── Sub-view styles ──────────────────────────────────────────────────────────

const failLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--fg-inverse-muted)',
};

const failBlock: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1.55,
  padding: '8px 10px',
  background: 'var(--bg-inverse-raised)',
  border: '1px solid var(--border-inverse)',
  borderRadius: 6,
  color: 'var(--fg-inverse)',
  whiteSpace: 'pre-wrap',
};

// ─── Idle view ────────────────────────────────────────────────────────────────

function IdleView() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--fg-subtle)',
        fontSize: 12,
      }}
    >
      Run a test to see output here.
    </div>
  );
}

// ─── Output view ─────────────────────────────────────────────────────────────

function OutputView({ output }: { output?: DrawerOutput }) {
  if (!output) return <IdleView />;
  return (
    <div
      data-testid="workspace-drawer-output"
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '10px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {output.status === 'pass' && (
        <div
          data-testid="output-status-pass"
          style={{ color: 'var(--run)', fontWeight: 600, marginBottom: 6 }}
        >
          ✓ Success
        </div>
      )}
      {output.status === 'fail' && (
        <div
          data-testid="output-status-fail"
          style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 6 }}
        >
          ✗ Error
        </div>
      )}
      {output.lines.map((l, i) => (
        <div
          key={i}
          style={{ color: l.stream === 'err' ? 'var(--danger)' : 'var(--fg-inverse)' }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

// ─── Failure view (kind-specific) ────────────────────────────────────────────

function FailIO({ io }: { io: FailureIO }) {
  return (
    <>
      <div>
        <div style={failLabel}>stdin</div>
        <div style={failBlock}>{io.stdin}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={failLabel}>Expected stdout</div>
          <div style={failBlock}>{io.expected}</div>
        </div>
        <div>
          <div style={{ ...failLabel, color: 'var(--danger)' }}>Got stdout</div>
          <div style={{ ...failBlock, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            {io.got}
          </div>
        </div>
      </div>
    </>
  );
}

function FailPytest({ pytest }: { pytest: FailurePytest }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
        <span style={failLabel}>Target</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-inverse)' }}>
          {pytest.target}
        </span>
      </div>
      <div>
        <div style={{ ...failLabel, color: 'var(--danger)' }}>Traceback</div>
        <pre style={{ ...failBlock, borderColor: 'var(--danger)', color: 'var(--fg-inverse)', margin: 0 }}>
          {pytest.trace ?? ''}
        </pre>
      </div>
    </>
  );
}

function FailureView({ failure }: { failure?: DrawerFailure }) {
  if (!failure) return <IdleView />;
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {failure.kind === 'io' && failure.io && <FailIO io={failure.io} />}
      {failure.kind === 'pytest' && failure.pytest && <FailPytest pytest={failure.pytest} />}
    </div>
  );
}

// ─── Debug view ───────────────────────────────────────────────────────────────

const debugBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 4,
  background: 'var(--bg-inverse-raised)',
  border: '1px solid var(--border-inverse)',
  color: 'var(--fg-inverse)',
  fontSize: 11,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

function DebugView({ debug }: { debug?: DrawerDebug }) {
  if (!debug) return <IdleView />;
  const { step, total, locals = [], stack = [], onStep, onPlay } = debug;
  const fillPct = total > 0 ? (step / total) * 100 : 0;

  return (
    <div data-testid="workspace-drawer-debug" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Scrubber row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-inverse)',
        }}
      >
        <button
          data-testid="debug-step-prev"
          title="Previous step"
          onClick={() => onStep?.(-1)}
          style={debugBtnStyle}
        >
          ◀
        </button>
        <button
          data-testid="debug-step-play"
          title="Play"
          onClick={() => onPlay?.()}
          style={{
            ...debugBtnStyle,
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            border: 'none',
          }}
        >
          ▶
        </button>
        <button
          data-testid="debug-step-next"
          title="Next step"
          onClick={() => onStep?.(1)}
          style={debugBtnStyle}
        >
          ▶
        </button>
        {/* Progress bar */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            height: 8,
            background: 'var(--bg-inverse-raised)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fillPct}%`,
              background: 'var(--accent)',
              borderRadius: 4,
            }}
          />
        </div>
        <div
          data-testid="debug-step-counter"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-inverse-muted)',
            minWidth: 64,
            textAlign: 'right',
          }}
        >
          step {step} / {total}
        </div>
      </div>

      {/* Locals + stack */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Locals panel */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px 12px',
            borderRight: '1px solid var(--border-inverse)',
          }}
        >
          <div style={failLabel}>Locals</div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {locals.map((local, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}
              >
                <span
                  style={{
                    color: local.changed ? 'var(--accent)' : 'var(--fg-inverse-muted)',
                    minWidth: 80,
                  }}
                >
                  {local.name}
                </span>
                <span
                  style={{
                    color: local.changed ? 'var(--accent)' : 'var(--fg-inverse)',
                  }}
                >
                  {local.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Call stack panel */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            overflow: 'auto',
            padding: '8px 12px',
          }}
        >
          <div style={failLabel}>Call stack</div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {stack.map((frame, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}
              >
                <span style={{ color: 'var(--fg-inverse-muted)', minWidth: 24 }}>{i}</span>
                <span style={{ color: 'var(--fg-inverse)' }}>{frame.frame}</span>
                <span style={{ color: 'var(--fg-inverse-muted)' }}>line {frame.line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Runtime error view ──────────────────────────────────────────────────────

function RuntimeErrorView({ err }: { err?: DrawerRuntimeError }) {
  if (!err) return <IdleView />;
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 16px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: 1.65,
      }}
    >
      <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 6 }}>
        {err.type}: {err.message}
      </div>
      {err.trace && (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--fg-inverse)' }}>
          {err.trace}
        </pre>
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

/**
 * Drawer — workspace bottom panel. Content swaps by mode.
 *
 * Modes: idle (placeholder) | output (stdout/stderr) | failure (kind-specific test detail)
 *        | debug (scrubber + locals + stack) | runtime-error (unhandled exception)
 *
 * Collapsed renders a 30px summary bar; expanded renders the full panel.
 * output/failure/debug/runtime-error modes apply inverse theme (dark terminal aesthetic).
 */
export function Drawer({
  mode,
  collapsed = false,
  onToggleCollapsed,
  summary,
  output,
  failure,
  debug,
  runtimeError,
  closeAction,
}: DrawerProps) {
  const inverse =
    mode === 'debug' ||
    mode === 'output' ||
    mode === 'failure' ||
    mode === 'runtime-error';

  const statusColor = drawerStatusColor(mode, output, failure);
  const summaryText = summary ?? drawerAutoSummary(mode, output, failure, debug);

  // ── Collapsed: 30px summary bar ──────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        data-testid="workspace-drawer"
        data-mode={mode}
        data-collapsed="true"
        onClick={onToggleCollapsed}
        style={{
          flexShrink: 0,
          height: '30px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          background: 'var(--bg-sunken)',
          borderTop: '1px solid var(--border)',
          fontSize: 11.5,
          color: 'var(--fg-muted)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: statusColor,
            display: 'inline-block',
          }}
        />
        <span style={{ fontWeight: 600 }}>{drawerLabel(mode)}</span>
        <span>·</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{summaryText}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11 }}>Click to expand ⌃J</span>
      </div>
    );
  }

  // ── Expanded ─────────────────────────────────────────────────────────────
  const height = drawerHeight(mode);

  return (
    <div
      data-testid="workspace-drawer"
      data-mode={mode}
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--border)',
        background: inverse ? 'var(--bg-inverse)' : 'var(--bg-raised)',
        color: inverse ? 'var(--fg-inverse)' : 'var(--fg)',
        height,
        maxHeight: height,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 30,
          padding: '0 12px',
          borderBottom: `1px solid ${inverse ? 'var(--border-inverse)' : 'var(--border)'}`,
          background: inverse ? 'var(--bg-inverse-raised)' : 'var(--bg-sunken)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: statusColor,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: inverse ? 'var(--fg-inverse)' : 'var(--fg)',
          }}
        >
          {drawerLabel(mode)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: inverse ? 'var(--fg-inverse-muted)' : 'var(--fg-muted)',
          }}
        >
          {summaryText}
        </span>
        <div style={{ flex: 1 }} />
        {closeAction}
        {onToggleCollapsed && (
          <button
            title="Collapse drawer"
            onClick={onToggleCollapsed}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              opacity: 0.7,
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 6px',
            }}
          >
            ⌄
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {mode === 'output'        && <OutputView output={output} />}
        {mode === 'failure'       && <FailureView failure={failure} />}
        {mode === 'debug'         && <DebugView debug={debug} />}
        {mode === 'runtime-error' && <RuntimeErrorView err={runtimeError} />}
        {mode === 'idle'          && <IdleView />}
      </div>
    </div>
  );
}

export default Drawer;
