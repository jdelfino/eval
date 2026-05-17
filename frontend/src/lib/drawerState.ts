/**
 * drawerState — shared drawer mode derivation logic.
 *
 * Both student/page.tsx and public-view/page.tsx define an identical
 * deriveDrawerMode function. This module extracts the shared base so both
 * consumers stay consistent. The student variant adds focusedFailureId support
 * via a thin local wrapper.
 */

import type { TestResponse } from '@/types/api';
import type { DrawerMode } from '@/components/workspace/Drawer';

export interface DeriveDrawerModeBaseInput {
  isDebugging: boolean;
  executionResult: TestResponse | null;
  runtimeError: string | null;
}

/**
 * Derive the drawer mode for the base case (projector / author surfaces that
 * do not support per-test failure focus).
 *
 * Priority order: runtime-error > debug > output > idle.
 */
export function deriveDrawerModeBase({
  isDebugging,
  executionResult,
  runtimeError,
}: DeriveDrawerModeBaseInput): DrawerMode {
  if (runtimeError) return 'runtime-error';
  if (isDebugging) return 'debug';
  if (executionResult) return 'output';
  return 'idle';
}
