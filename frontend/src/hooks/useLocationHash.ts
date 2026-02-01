/**
 * Hook to read location hash
 *
 * This is extracted to allow mocking in tests since jsdom doesn't
 * allow modifying window.location.hash directly.
 */

export function useLocationHash(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.hash;
}

export function useLocationReload(): () => void {
  return () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };
}
