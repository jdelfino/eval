'use client';

import React from 'react';
import { ConnectionDot } from '@/components/ui/ConnectionDot';

interface InstructorNavProps {
  currentView: 'classes' | 'sections' | 'problems' | 'sessions' | 'session' | 'details';
  onNavigate: (view: 'classes' | 'problems' | 'sessions') => void;
  activeSessionId: string | null;
  onReturnToSession?: () => void;
}

const InstructorNav: React.FC<InstructorNavProps> = ({ 
  currentView, 
  onNavigate, 
  activeSessionId,
  onReturnToSession 
}) => {
  const navItems = [
    { id: 'classes' as const, label: 'Classes', icon: '📚' },
    { id: 'sessions' as const, label: 'Sessions', icon: '🎯' },
    { id: 'problems' as const, label: 'Problems', icon: '💡' },
  ];

  return (
    <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1 mb-6">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all
              ${isActive 
                ? 'bg-accent text-accent-fg shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
              }
              cursor-pointer
            `}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
            {isActive && (
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            )}
          </button>
        );
      })}
      {activeSessionId && (
        <button
          onClick={onReturnToSession}
          className={`
            ml-auto flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all
            ${currentView === 'session'
              ? 'bg-green-100 text-green-800 border-2 border-green-400'
              : 'text-green-600 hover:bg-green-50 border border-green-300'
            }
            cursor-pointer
          `}
          title="Click to return to active session"
        >
          <ConnectionDot status="live" compact />
          <span>{currentView === 'session' ? 'In Session' : 'Return to Session'}</span>
        </button>
      )}
    </div>
  );
};

export default InstructorNav;
