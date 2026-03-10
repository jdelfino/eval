'use client';

import React, { useState } from 'react';
import { Button } from './Button';
import { authProviders, type ProviderConfig } from '@/config/auth-providers';
import { reportError } from '@/lib/api/error-reporting';

/** Official provider logos rendered as inline SVGs. */
const providerIcons: Record<ProviderConfig['providerType'], React.ReactNode> = {
  google: (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  ),
  github: (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
        fill="#24292f"
      />
    </svg>
  ),
  microsoft: (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  ),
};

export interface SignInButtonsProps {
  onSuccess: () => void;
  onError: (error: Error) => void;
  /** Optional heading shown above the buttons, e.g. "Sign in to join CS101" */
  label?: string;
  /** Disable all buttons (e.g. while a backend call is in flight) */
  disabled?: boolean;
  /**
   * Called immediately before signInWithPopup fires.
   * Use this to set auth flow gating (beginAuthFlow) so that onAuthStateChanged
   * in AuthContext does not race with the registration/accept flow that follows.
   */
  onBeforeSignIn?: () => void;
}

/**
 * Lazily import Firebase and call signInWithPopup for the given provider type.
 */
async function signInWithProvider(providerType: 'google' | 'github' | 'microsoft') {
  const { signInWithPopup, GoogleAuthProvider, GithubAuthProvider, OAuthProvider } =
    await import('firebase/auth');
  const { firebaseAuth } = await import('@/lib/firebase');

  let provider;
  switch (providerType) {
    case 'google':
      provider = new GoogleAuthProvider();
      break;
    case 'github':
      provider = new GithubAuthProvider();
      break;
    case 'microsoft':
      provider = new OAuthProvider('microsoft.com');
      break;
  }

  return signInWithPopup(firebaseAuth, provider);
}

/**
 * Shared sign-in buttons component for rendering social provider sign-in buttons.
 *
 * Renders one button per provider (Google, GitHub, Microsoft).
 *
 * Error handling:
 * - auth/popup-closed-by-user — silently ignored (user cancelled)
 * - auth/cancelled-popup-request — silently ignored (new popup replaced old)
 * - auth/popup-blocked — shows "Please allow popups" message
 * - Other errors — calls onError prop
 *
 * @example
 * ```tsx
 * <SignInButtons onSuccess={handleSuccess} onError={handleError} />
 * <SignInButtons label="Sign in to join CS101" onSuccess={handleSuccess} onError={handleError} />
 * ```
 */
export function SignInButtons({ onSuccess, onError, label, disabled: externalDisabled, onBeforeSignIn }: SignInButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handleSignIn = async (providerType: 'google' | 'github' | 'microsoft', providerId: string) => {
    setLoadingProvider(providerId);
    setPopupBlocked(false);
    try {
      onBeforeSignIn?.();
      await signInWithProvider(providerType);
      onSuccess();
    } catch (error) {
      const firebaseError = error as { code?: string };
      const isUserCancelled =
        firebaseError.code === 'auth/popup-closed-by-user' ||
        firebaseError.code === 'auth/cancelled-popup-request';

      if (!isUserCancelled) {
        // Report non-user-initiated errors to backend for monitoring
        void reportError(
          error instanceof Error ? error : new Error(String(error)),
          { type: 'firebase_sign_in', provider: providerType, code: firebaseError.code ?? 'unknown' }
        );
      }

      if (firebaseError.code === 'auth/popup-blocked') {
        setPopupBlocked(true);
      } else if (!isUserCancelled) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {label && <p className="text-sm font-medium text-gray-700 text-center">{label}</p>}
      {authProviders.map((provider) => (
        <Button
          key={provider.id}
          variant="secondary"
          size="lg"
          className="w-full"
          loading={loadingProvider === provider.id}
          disabled={loadingProvider !== null || externalDisabled}
          onClick={() => handleSignIn(provider.providerType, provider.id)}
        >
          {providerIcons[provider.providerType]}
          Continue with {provider.name}
        </Button>
      ))}
      {popupBlocked && (
        <p className="text-sm text-red-600 text-center">
          Please allow popups for this site to sign in.
        </p>
      )}
    </div>
  );
}

export default SignInButtons;
