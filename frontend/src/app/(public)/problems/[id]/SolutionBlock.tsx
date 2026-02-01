'use client';

import { useRef } from 'react';
import CopyButton from './CopyButton';

export default function SolutionBlock({ html }: { html: string }) {
  const codeRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mt-4 relative">
      <CopyButton codeRef={codeRef} />
      <div
        ref={codeRef}
        className="rounded-lg overflow-x-auto border border-gray-200 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:bg-gray-50"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
