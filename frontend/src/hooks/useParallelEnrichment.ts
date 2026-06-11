/**
 * useParallelEnrichment — generic hook for fanning out per-item async fetches.
 *
 * Given an array of items, a key function, and a fetch function, this hook:
 * - Fans out fetchFn(item) calls in parallel (one per item).
 * - Per-item failures degrade gracefully: that key gets `undefined` in the map,
 *   while successful keys still resolve.
 * - Built-in AbortController: when items identity changes or the component
 *   unmounts, in-flight fetches are cancelled (the cancellation flag prevents
 *   stale state updates).
 * - Refetches when items array identity changes (not just length), so additions
 *   or replacements trigger a fresh fan-out. Using the full identity prevents
 *   the stale-keying bug that arises from keying only on length.
 *
 * @template T Item type.
 * @template K Key type (must be valid as a Record key: string | number | symbol).
 * @template V Value type returned per item.
 *
 * @param items     Array of items to enrich.
 * @param keyFn     Returns the map key for an item.
 * @param fetchFn   Async function called per item; rejection causes that key to
 *                  be absent from the result map (graceful degradation).
 *
 * @returns { map, loading }
 *   - map:     Record mapping key → fetched value. Only successfully fetched
 *              keys are present; failed keys are absent.
 *   - loading: True while any parallel fetch is in flight.
 */

import { useEffect, useState } from 'react';

export interface ParallelEnrichmentResult<K extends string | number | symbol, V> {
  map: Partial<Record<K, V>>;
  loading: boolean;
}

export function useParallelEnrichment<T, K extends string | number | symbol, V>(
  items: T[],
  keyFn: (item: T) => K,
  fetchFn: (item: T) => Promise<V>
): ParallelEnrichmentResult<K, V> {
  const [map, setMap] = useState<Partial<Record<K, V>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setMap({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      items.map(async (item) => {
        const key = keyFn(item);
        try {
          const value = await fetchFn(item);
          return { key, value, ok: true as const };
        } catch {
          return { key, ok: false as const };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const newMap: Partial<Record<K, V>> = {};
      for (const result of results) {
        if (result.ok) {
          newMap[result.key] = result.value;
        }
      }
      setMap(newMap);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  // React needs the full items identity to detect real changes (new objects,
  // replacements, additions). JSON.stringify is used so that identical-value
  // arrays with different object references don't trigger unnecessary refetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items)]);

  return { map, loading };
}
