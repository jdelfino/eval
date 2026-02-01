'use client';

/**
 * User menu dropdown component.
 * Shows user email/name with dropdown containing Sign Out option.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close menu on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!user) {
    return null;
  }

  const displayName = user.displayName || user.email;

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    router.push('/auth/signin');
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
          <User className="h-4 w-4 text-blue-600" aria-hidden="true" />
        </div>
        <span className="hidden sm:inline max-w-32 truncate">{displayName}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {/* User info section */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
            {user.displayName && user.email !== user.displayName && (
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            )}
            <p className="text-xs text-gray-400 capitalize mt-0.5">{user.role.replace('-', ' ')}</p>
          </div>

          {/* Menu items */}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            role="menuitem"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
