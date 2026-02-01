'use client';

/**
 * Protected route wrapper.
 * Redirects to sign-in if not authenticated.
 * Can check for specific roles OR permissions.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission, useAnyPermission } from '@/hooks/usePermissions';
import type { UserRole } from '@/server/auth/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredPermission?: string; // Single permission required
  requiredPermissions?: string[]; // Any of these permissions required
  fallbackPath?: string;
  allowAdmin?: boolean; // Allow admins to access this route even if requiredRole is different
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
  requiredPermissions,
  fallbackPath = '/auth/signin',
  allowAdmin = true, // Default to allowing admins
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Track if we've completed the initial auth check successfully
  // This prevents re-checking on every re-render
  const initialAuthCheckDone = useRef(false);

  // Check permissions
  const hasSinglePermission = usePermission(user, requiredPermission || '');
  const hasAnyPermissions = useAnyPermission(user, requiredPermissions || []);

  useEffect(() => {
    // Only perform auth check if:
    // 1. Loading is complete
    // 2. We haven't already completed a successful auth check
    if (isLoading || initialAuthCheckDone.current) {
      return;
    }

    if (!user) {
      // Not authenticated, redirect to sign-in
      router.push(fallbackPath);
      return; // Don't mark as done if we're redirecting due to no auth
    }

    // User is authenticated, check permissions/role
    if (requiredPermission || requiredPermissions) {
      // Check permission-based access
      const hasPermissionAccess =
        (requiredPermission && hasSinglePermission) ||
        (requiredPermissions && hasAnyPermissions);

      if (!hasPermissionAccess) {
        // No permission, redirect to appropriate page
        const defaultPath = user.role === 'instructor' ? '/instructor' : '/student';
        router.push(defaultPath);
        return; // Don't mark as done if we're redirecting
      }
    } else if (requiredRole) {
      // Check role-based access (legacy support)
      const hasAccess = user.role === requiredRole || (allowAdmin && user.role === 'namespace-admin');
      if (!hasAccess) {
        // Wrong role, redirect to appropriate page
        const defaultPath = user.role === 'instructor' ? '/instructor' : '/student';
        router.push(defaultPath);
        return; // Don't mark as done if we're redirecting
      }
    }

    // If we get here, auth check passed - mark as done
    initialAuthCheckDone.current = true;
  }, [user, isLoading, requiredRole, requiredPermission, requiredPermissions, hasSinglePermission, hasAnyPermissions, router, fallbackPath, allowAdmin]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  // Don't render children until authenticated
  if (!user) {
    return null;
  }

  // SECURITY: Check access BEFORE rendering children
  // This prevents unauthorized users from seeing protected content
  if (requiredPermission || requiredPermissions) {
    const hasPermissionAccess =
      (requiredPermission && hasSinglePermission) ||
      (requiredPermissions && hasAnyPermissions);

    if (!hasPermissionAccess) {
      return null;
    }
  } else if (requiredRole) {
    const hasAccess = user.role === requiredRole || (allowAdmin && user.role === 'namespace-admin');
    if (!hasAccess) {
      return null;
    }
  }

  return <>{children}</>;
}
