'use client';

import { useRouter } from 'next/navigation';
import { useSections } from '@/hooks/useSections';
import { AuthHeading } from '@/components/ui/AuthHeading';
import JoinSectionForm from '../components/JoinSectionForm';

export default function JoinSectionPage() {
  const router = useRouter();
  const { joinSection } = useSections();

  const handleJoinSection = async (join_code: string) => {
    const membership = await joinSection(join_code);
    router.push(`/sections/${membership.section_id}`);
  };

  return (
    <div>
      <div style={{ padding: '20px 24px 0' }}>
        <AuthHeading
          size="xs"
          sub="Enter the join code your teacher gave you. You'll keep your existing sections."
        >
          Join a new section
        </AuthHeading>
      </div>
      <div style={{ padding: 24, maxWidth: 480 }}>
        <JoinSectionForm onSubmit={handleJoinSection} />
      </div>
    </div>
  );
}
