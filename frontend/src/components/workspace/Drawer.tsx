'use client';

import React, { useState, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DrawerMode = 'idle' | 'output' | 'failure' | 'debug' | 'runtime-error' | 'edit-test';

export type DrawerEditIO = {
  kind: 'io';
  name: string;
  input: string;
  expected_output: string;
  match_type: 'exact' | 'contains' | 'regex';
  random_seed?: number;
  lastResult?: { stdout: string; passed: boolean };
};

export type DrawerEditPytest = {
  kind: 'pytest';
  name: string;
  target_path: string;
  test_code: string;
};

export type DrawerEdit = DrawerEditIO | DrawerEditPytest;

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
  edit?: DrawerEdit;
  onEditChange?: (next: DrawerEdit) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function drawerLabel(mode: DrawerMode): string {
  switch (mode) {
    case 'output':        return 'Output';
    case 'failure':       return 'Failure detail';
    case 'debug':         return 'Debugger';
    case 'runtime-error': return 'Runtime error';
    case 'edit-test':     return 'Test body';
    default:              return 'Console';
  }
}

export function drawerHeight(mode: DrawerMode): number | string {
  switch (mode) {
    case 'debug':         return 200;
    case 'failure':       return 200;
    case 'runtime-error': return 180;
    case 'output':        return 160;
    case 'edit-test':     return 260;
    default:              return 30; // idle collapses to bar height
  }
}

export function drawerStatusColor(
  mode: DrawerMode,
  output?: DrawerOutput,
  _failure?: DrawerFailure
): string {
  if (mode === 'failure')       return 'var(--danger)';
  if (mode === 'runtime-error') return 'var(--danger)';
  if (mode === 'debug')         return 'var(--accent)';
  if (mode === 'edit-test')     return 'var(--accent)';
  if (mode === 'output' && output?.status === 'fail') return 'var(--danger)';
  if (mode === 'output' && output?.status === 'pass') return 'var(--run)';
  return 'var(--fg-subtle)';
}

export function drawerAutoSummary(
  mode: DrawerMode,
  output?: DrawerOutput,
  failure?: DrawerFailure,
  debug?: DrawerDebug
): string {
  if (mode === 'output')        return output?.summary ?? '—';
  if (mode === 'failure')       return failure ? `${failure.name ?? '—'} — ${failure.kind}` : '—';
  if (mode === 'debug')         return debug ? `step ${debug.step}/${debug.total} · ${debug.testName ?? '—'}` : '—';
  if (mode === 'runtime-error') return 'unhandled exception — fix and re-run';
  if (mode === 'edit-test')     return 'editing test body';
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
      className="text-fg-subtle"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
          className="text-run"
          style={{ fontWeight: 600, marginBottom: 6 }}
        >
          ✓ Success
        </div>
      )}
      {output.status === 'fail' && (
        <div
          data-testid="output-status-fail"
          className="text-danger"
          style={{ fontWeight: 600, marginBottom: 6 }}
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
        <span className="text-fg-inverse" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
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
          className="bg-bg-inverse-raised"
          style={{
            flex: 1,
            position: 'relative',
            height: 8,
            borderRadius: 4,
          }}
        >
          <div
            data-testid="scrubber-fill"
            className="bg-accent"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fillPct}%`,
              borderRadius: 4,
            }}
          />
        </div>
        <div
          data-testid="debug-step-counter"
          className="text-fg-inverse-muted"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
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
          className="border-r border-border-inverse"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px 12px',
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
                <span className="text-fg-inverse-muted" style={{ minWidth: 24 }}>{i}</span>
                <span className="text-fg-inverse">{frame.frame}</span>
                <span className="text-fg-inverse-muted">line {frame.line}</span>
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
      <div className="text-danger" style={{ fontWeight: 700, marginBottom: 6 }}>
        {err.type}: {err.message}
      </div>
      {err.trace && (
        <pre className="text-fg-inverse" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {err.trace}
        </pre>
      )}
    </div>
  );
}

// ─── Edit-test view ──────────────────────────────────────────────────────────

const editInput: React.CSSProperties = {
  height: 22,
  padding: '0 8px',
  background: 'var(--bg-inverse-raised)',
  border: '1px solid var(--border-inverse)',
  color: 'var(--fg-inverse)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  borderRadius: 3,
  outline: 'none',
};

const editArea: React.CSSProperties = {
  ...editInput,
  height: 'auto',
  padding: '6px 8px',
  width: '100%',
  resize: 'vertical',
  lineHeight: 1.55,
};

const editLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: 'var(--fg-inverse-muted)',
  marginBottom: 4,
};

const kindPillStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 3,
  background: 'var(--bg-inverse-raised)',
  border: '1px solid var(--border-inverse)',
  color: 'var(--fg-inverse)',
};

function EditIOBody({
  edit,
  onChange,
}: {
  edit: DrawerEditIO;
  onChange: (next: DrawerEdit) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      <div>
        <label style={editLabel} htmlFor="edit-stdin">stdin</label>
        <textarea
          id="edit-stdin"
          rows={5}
          style={editArea}
          value={edit.input}
          onChange={e => onChange({ ...edit, input: e.target.value })}
        />
        <div style={{ marginTop: 8 }}>
          <label style={editLabel} htmlFor="edit-match-type">match type</label>
          <select
            id="edit-match-type"
            style={{ ...editInput, width: '100%' }}
            value={edit.match_type}
            onChange={e =>
              onChange({
                ...edit,
                match_type: e.target.value as 'exact' | 'contains' | 'regex',
              })
            }
          >
            <option value="exact">exact</option>
            <option value="contains">contains</option>
            <option value="regex">regex</option>
          </select>
        </div>
      </div>
      <div>
        <label style={editLabel} htmlFor="edit-expected">expected stdout</label>
        <textarea
          id="edit-expected"
          rows={5}
          style={editArea}
          value={edit.expected_output}
          onChange={e => onChange({ ...edit, expected_output: e.target.value })}
        />
      </div>
      <div>
        <label style={{ ...editLabel, color: 'var(--accent)' }} htmlFor="edit-last-run">
          last run · got
        </label>
        <textarea
          id="edit-last-run"
          rows={5}
          readOnly
          style={{ ...editArea, color: 'var(--fg-inverse-muted)' }}
          value={edit.lastResult?.stdout ?? '(not run)'}
        />
      </div>
    </div>
  );
}

function EditPytestBody({
  edit,
  onChange,
}: {
  edit: DrawerEditPytest;
  onChange: (next: DrawerEdit) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
      <div>
        <label style={editLabel} htmlFor="edit-test-body">test body (pytest)</label>
        <textarea
          id="edit-test-body"
          rows={9}
          style={{ ...editArea, fontSize: 12 }}
          value={edit.test_code}
          onChange={e => onChange({ ...edit, test_code: e.target.value })}
        />
      </div>
      <div>
        <label style={editLabel} htmlFor="edit-target-path">target</label>
        <input
          id="edit-target-path"
          style={{ ...editInput, width: '100%' }}
          value={edit.target_path}
          onChange={e => onChange({ ...edit, target_path: e.target.value })}
        />
      </div>
    </div>
  );
}

function EditTestView({
  edit,
  onChange,
}: {
  edit?: DrawerEdit;
  onChange?: (next: DrawerEdit) => void;
}) {
  const [localEdit, setLocalEdit] = useState<DrawerEdit | undefined>(edit);

  // Reset local state when prop changes (new test selected)
  useEffect(() => {
    setLocalEdit(edit);
  }, [edit]);

  if (!localEdit) return <IdleView />;

  function handleChange(next: DrawerEdit) {
    setLocalEdit(next);
    onChange?.(next);
  }

  return (
    <div
      data-testid="workspace-drawer-edit-test"
      style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}
    >
      {/* Header row: kind pill · name input · seed input (io only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={kindPillStyle}>{localEdit.kind}</span>
        <input
          aria-label="test name"
          style={{ ...editInput, flex: 1, maxWidth: 240 }}
          value={localEdit.name}
          onChange={e => handleChange({ ...localEdit, name: e.target.value })}
        />
        {localEdit.kind === 'io' && (
          <>
            <label
              htmlFor="edit-seed"
              className="text-fg-inverse-muted"
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
            >
              seed
            </label>
            <input
              id="edit-seed"
              type="number"
              placeholder="—"
              style={{ ...editInput, width: 90, textAlign: 'right' }}
              value={localEdit.random_seed ?? ''}
              onChange={e => {
                const val = e.target.value;
                handleChange({
                  ...localEdit,
                  random_seed: val === '' ? undefined : Number(val),
                });
              }}
            />
          </>
        )}
      </div>

      {/* Body: kind-specific editor */}
      {localEdit.kind === 'io' && (
        <EditIOBody edit={localEdit} onChange={handleChange} />
      )}
      {localEdit.kind === 'pytest' && (
        <EditPytestBody edit={localEdit} onChange={handleChange} />
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
  edit,
  onEditChange,
}: DrawerProps) {
  const inverse =
    mode === 'debug' ||
    mode === 'output' ||
    mode === 'failure' ||
    mode === 'runtime-error' ||
    mode === 'edit-test';

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
        className="bg-bg-sunken border-t border-border text-fg-muted"
        style={{
          flexShrink: 0,
          height: '30px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          fontSize: 11.5,
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
        {mode === 'edit-test'     && <EditTestView edit={edit} onChange={onEditChange} />}
      </div>
    </div>
  );
}

export default Drawer;
