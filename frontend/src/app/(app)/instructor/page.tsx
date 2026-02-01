'use client';

/**
 * Instructor Page
 *
 * Main instructor dashboard showing a table of classes and sections
 * with easy session management (Start Session / Rejoin Session buttons).
 */

import React, { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import NamespaceHeader from '@/components/NamespaceHeader';
import { InstructorDashboard } from './components/InstructorDashboard';
import StartSessionModal from './components/StartSessionModal';

interface StartSessionState {
  section_id: string;
  section_name: string;
}

function InstructorPage() {
  const { user: _user } = useAuth();
  const router = useRouter();

  // Modal state for starting a new session
  const [startSessionState, setStartSessionState] = useState<StartSessionState | null>(null);

  // Handle "Start Session" button click from dashboard
  const handleStartSession = (section_id: string, section_name: string) => {
    setStartSessionState({ section_id, section_name });
  };

  // Handle "Rejoin Session" button click - navigate directly to session
  const handleRejoinSession = (session_id: string) => {
    router.push(`/instructor/session/${session_id}`);
  };

  // Handle session created from modal - navigate to session
  const handleSessionCreated = (session_id: string) => {
    setStartSessionState(null);
    router.push(`/instructor/session/${session_id}`);
  };

  // Close the modal
  const handleCloseModal = () => {
    setStartSessionState(null);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <NamespaceHeader className="text-sm" />
      </div>

      {/* Main dashboard content */}
      <InstructorDashboard
        onStartSession={handleStartSession}
        onRejoinSession={handleRejoinSession}
      />

      {/* Start Session Modal */}
      {startSessionState && (
        <StartSessionModal
          section_id={startSessionState.section_id}
          section_name={startSessionState.section_name}
          onClose={handleCloseModal}
          onSessionCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}

export default function InstructorPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <InstructorPage />
    </Suspense>
  );
}
