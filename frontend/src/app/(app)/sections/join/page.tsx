'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';
import JoinSectionForm from '../components/JoinSectionForm';

export default function JoinSectionPage() {
  const router = useRouter();
  const { user: _user } = useAuth();
  const { joinSection } = useSections();

  const handleJoinSection = async (joinCode: string) => {
    await joinSection(joinCode);
    router.push('/sections');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <JoinSectionForm onSubmit={handleJoinSection} />
      </div>
    </div>
  );
}
