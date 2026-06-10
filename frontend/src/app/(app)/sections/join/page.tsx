'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';
import JoinSectionForm from '../components/JoinSectionForm';

export default function JoinSectionPage() {
  const router = useRouter();
  const { user: _user } = useAuth();
  const { joinSection } = useSections();

  const handleJoinSection = async (join_code: string) => {
    const membership = await joinSection(join_code);
    router.push(`/sections/${membership.section_id}`);
  };

  return (
    <div>
      <div style={{ padding: '20px 24px 0' }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: -0.3,
            margin: 0,
          }}
        >
          Join a new section
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--fg-muted)',
            marginTop: 4,
          }}
        >
          Enter the join code your teacher gave you. You&apos;ll keep your existing sections.
        </p>
      </div>
      <div style={{ padding: 24, maxWidth: 480 }}>
        <JoinSectionForm onSubmit={handleJoinSection} />
      </div>
    </div>
  );
}
