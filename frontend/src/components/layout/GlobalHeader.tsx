'use client';

/**
 * Global header component.
 * Fixed top bar with logo, session banner, and user menu.
 */

import { Menu } from 'lucide-react';
import { ActiveSessionBanner } from './ActiveSessionBanner';
import { UserMenu } from './UserMenu';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';

interface GlobalHeaderProps {
  /** Callback when mobile menu button is clicked */
  onMobileMenuToggle?: () => void;
  /** Show mobile menu button */
  showMobileMenu?: boolean;
}

export function GlobalHeader({ onMobileMenuToggle, showMobileMenu = false }: GlobalHeaderProps) {
  const { headerSlot } = useHeaderSlot();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left section: Logo and mobile menu */}
      <div className="flex items-center gap-3">
        {showMobileMenu && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">CT</span>
          </div>
          <span className="font-semibold text-gray-900 hidden sm:inline">Coding Tool</span>
        </div>
      </div>

      {/* Center section: Active session banner */}
      <div className="flex-1 flex justify-center px-4">
        <ActiveSessionBanner />
      </div>

      {/* Right section: Header slot (e.g., connection status) + User menu */}
      <div className="flex items-center gap-3">
        {headerSlot}
        <UserMenu />
      </div>
    </header>
  );
}
