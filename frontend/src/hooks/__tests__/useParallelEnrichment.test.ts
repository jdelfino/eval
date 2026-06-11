/**
 * Unit tests for useParallelEnrichment hook.
 * @jest-environment jsdom
 *
 * Verifies: parallel fan-out, graceful per-item failure, cancellation on
 * items identity change, refetch on real identity change (not just length),
 * and loading state transitions.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useParallelEnrichment } from '../useParallelEnrichment';

interface TestItem {
  id: string;
  value: number;
}

function makeItem(id: string, value: number): TestItem {
  return { id, value };
}

describe('useParallelEnrichment', () => {
  it('returns empty map and loading=false when items is empty', () => {
    const { result } = renderHook(() =>
      useParallelEnrichment<TestItem, string, number>(
        [],
        (item) => item.id,
        async (item) => item.value
      )
    );

    expect(result.current.map).toEqual({});
    expect(result.current.loading).toBe(false);
  });

  it('fans out fetchFn per item and populates map with results', async () => {
    const items = [makeItem('a', 1), makeItem('b', 2), makeItem('c', 3)];
    const fetchFn = jest.fn(async (item: TestItem) => item.value * 10);

    const { result } = renderHook(() =>
      useParallelEnrichment(items, (item) => item.id, fetchFn)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.current.map).toEqual({ a: 10, b: 20, c: 30 });
  });

  it('sets loading=true while fetching and loading=false when complete', async () => {
    let resolveAll: (() => void) | null = null;
    const blocker = new Promise<void>((res) => { resolveAll = res; });
    const items = [makeItem('x', 1)];
    const fetchFn = jest.fn(async () => {
      await blocker;
      return 42;
    });

    const { result } = renderHook(() =>
      useParallelEnrichment(items, (item) => item.id, fetchFn)
    );

    // Should be loading while blocker is pending
    expect(result.current.loading).toBe(true);

    act(() => { resolveAll!(); });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.map).toEqual({ x: 42 });
  });

  it('degrades gracefully: failed items absent from map, successful ones present', async () => {
    const items = [makeItem('ok', 1), makeItem('fail', 2), makeItem('also-ok', 3)];
    const fetchFn = jest.fn(async (item: TestItem) => {
      if (item.id === 'fail') throw new Error('fetch failed');
      return item.value;
    });

    const { result } = renderHook(() =>
      useParallelEnrichment(items, (item) => item.id, fetchFn)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.map).toEqual({ ok: 1, 'also-ok': 3 });
    expect(result.current.map['fail']).toBeUndefined();
  });

  it('refetches when items array identity changes (replacement)', async () => {
    const items1 = [makeItem('a', 1)];
    const items2 = [makeItem('a', 99)]; // same key, different value
    const fetchFn = jest.fn(async (item: TestItem) => item.value);

    const { result, rerender } = renderHook(
      ({ items }: { items: TestItem[] }) =>
        useParallelEnrichment(items, (item) => item.id, fetchFn),
      { initialProps: { items: items1 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.map).toEqual({ a: 1 });

    rerender({ items: items2 });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Map should update to reflect the new item value
    expect(result.current.map).toEqual({ a: 99 });
  });

  it('does not stale-refetch when items length stays same but objects are new refs with same content', async () => {
    // Items with same id/value but new object reference should NOT trigger extra fetches
    // because JSON.stringify produces the same string.
    const items1 = [makeItem('a', 1)];
    const items2 = [makeItem('a', 1)]; // same content, new array+object reference
    const fetchFn = jest.fn(async (item: TestItem) => item.value);

    const { result, rerender } = renderHook(
      ({ items }: { items: TestItem[] }) =>
        useParallelEnrichment(items, (item) => item.id, fetchFn),
      { initialProps: { items: items1 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callCount = fetchFn.mock.calls.length;

    rerender({ items: items2 });

    // Give time for any spurious re-fetch to run
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchFn).toHaveBeenCalledTimes(callCount);
  });

  it('cancels stale updates when items change mid-flight', async () => {
    const items1 = [makeItem('a', 1)];
    const items2 = [makeItem('b', 2)];

    let resolveFirst: (() => void) | null = null;
    const firstBlocker = new Promise<void>((res) => { resolveFirst = res; });

    const fetchFn = jest.fn(async (item: TestItem) => {
      if (item.id === 'a') {
        await firstBlocker;
      }
      return item.value;
    });

    const { result, rerender } = renderHook(
      ({ items }: { items: TestItem[] }) =>
        useParallelEnrichment(items, (item) => item.id, fetchFn),
      { initialProps: { items: items1 } }
    );

    // First fetch is in-flight (blocked on firstBlocker)
    expect(result.current.loading).toBe(true);

    // Switch to items2 — this should cancel the first batch
    rerender({ items: items2 });

    // items2 fetch completes immediately
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.map).toEqual({ b: 2 });

    // Now resolve the first blocked fetch — should NOT update state
    act(() => { resolveFirst!(); });
    await new Promise((r) => setTimeout(r, 50));

    // Map should still only contain 'b', not 'a'
    expect(result.current.map).toEqual({ b: 2 });
    expect(result.current.map['a']).toBeUndefined();
  });
});
