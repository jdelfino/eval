'use client';

import React, { useState } from 'react';
import { Button } from './Button';
import { authProviders } from '@/config/auth-providers';
import { isTestMode, setTestUser } from '@/lib/auth-provider';

export interface SignInButtonsProps {
  onSuccess: () => void;
  onError: (error: Error) => void;
  /** Optional heading shown above the buttons, e.g. "Sign in to join CS101" */
  label?: string;
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
 * In production: renders one button per provider (Google, GitHub, Microsoft).
 * In test mode (NEXT_PUBLIC_AUTH_MODE=test): renders a single "Test Sign In" button
 * that sets a default test user in localStorage and calls onSuccess.
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
export function SignInButtons({ onSuccess, onError, label }: SignInButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  if (isTestMode()) {
    const handleTestSignIn = () => {
      setTestUser('test-user', 'test@example.com');
      onSuccess();
    };

    return (
      <div className="flex flex-col gap-3 w-full">
        {label && <p className="text-sm font-medium text-gray-700 text-center">{label}</p>}
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={handleTestSignIn}
        >
          Test Sign In
        </Button>
      </div>
    );
  }

  const handleSignIn = async (providerType: 'google' | 'github' | 'microsoft', providerId: string) => {
    setLoadingProvider(providerId);
    setPopupBlocked(false);
    try {
      await signInWithProvider(providerType);
      onSuccess();
    } catch (error) {
      const firebaseError = error as { code?: string };
      if (
        firebaseError.code === 'auth/popup-closed-by-user' ||
        firebaseError.code === 'auth/cancelled-popup-request'
      ) {
        // Silently ignore — user cancelled or a new popup replaced the old one
      } else if (firebaseError.code === 'auth/popup-blocked') {
        setPopupBlocked(true);
      } else {
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
          disabled={loadingProvider !== null}
          onClick={() => handleSignIn(provider.providerType, provider.id)}
        >
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
