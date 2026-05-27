/**
 * Shared constants for the namespace switcher's localStorage contract.
 *
 * Both useSelectedNamespace (synchronous, used by API filter code) and
 * useSystemNamespace (async, used by the switcher UI) read the same key
 * with the same 'all' sentinel — keep the literals in one place so a
 * rename only touches this file.
 */

export const NAMESPACE_STORAGE_KEY = 'selectedNamespaceId';
export const ALL_NAMESPACES_SENTINEL = 'all';
