'use client';

import * as React from 'react';
import { AuthPublicShell } from './AuthPublicShell';
import { Spinner } from '@/components/ui/Spinner';

export interface AuthLoadingProps {
  /** Optional caption text shown below the spinner. */
  caption?: string;
}

/**
 * AuthLoading — shared loading state for public auth pages.
 *
 * Used as the Suspense fallback and as the loading branch for all five public
 * auth pages (email sign-in, register/student, invite/accept, landing page,
 * sections/join). Replaces hand-rolled inline spinners with @keyframes spin.
 */
export function AuthLoading({ caption }: AuthLoadingProps): React.ReactElement {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          gap: 12,
        }}
      >
        <Spinner size="lg" />
        {caption && (
          <p className="text-fg-muted" style={{ fontSize: 13, margin: 0 }}>{caption}</p>
        )}
      </div>
    </AuthPublicShell>
  );
}

export default AuthLoading;
