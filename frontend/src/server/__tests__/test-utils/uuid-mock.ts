/**
 * Mock UUID for testing
 */

let counter = 0;

export function v4(): string {
  return `test-uuid-${counter++}`;
}

export function reset(): void {
  counter = 0;
}
