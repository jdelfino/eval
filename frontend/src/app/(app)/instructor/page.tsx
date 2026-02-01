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
  sectionId: string;
  sectionName: string;
}

function InstructorPage() {
  const { user: _user } = useAuth();
  const router = useRouter();

  // Modal state for starting a new session
  const [startSessionState, setStartSessionState] = useState<StartSessionState | null>(null);

  // Handle "Start Session" button click from dashboard
  const handleStartSession = (sectionId: string, sectionName: string) => {
    setStartSessionState({ sectionId, sectionName });
  };

  // Handle "Rejoin Session" button click - navigate directly to session
  const handleRejoinSession = (sessionId: string) => {
    router.push(`/instructor/session/${sessionId}`);
  };

  // Handle session created from modal - navigate to session
  const handleSessionCreated = (sessionId: string) => {
    setStartSessionState(null);
    router.push(`/instructor/session/${sessionId}`);
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
          sectionId={startSessionState.sectionId}
          sectionName={startSessionState.sectionName}
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
