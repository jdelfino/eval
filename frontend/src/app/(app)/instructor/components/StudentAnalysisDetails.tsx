'use client';

import React from 'react';
import { AnalysisIssue } from '@/server/types/analysis';
import { severityStyles } from '../constants/analysis';

interface StudentAnalysisDetailsProps {
  issue?: AnalysisIssue;
}

export default function StudentAnalysisDetails({ issue }: StudentAnalysisDetailsProps) {
  if (!issue) {
    return null;
  }

  const style = severityStyles[issue.severity];

  return (
    <div
      style={{
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '0.125rem 0.5rem',
          backgroundColor: style.bg,
          color: style.text,
          borderRadius: '9999px',
          fontSize: '0.7rem',
          fontWeight: 500,
          marginBottom: '0.375rem',
        }}
        data-testid="severity-badge"
      >
        {style.label}
      </span>
      <p
        style={{
          margin: '0.25rem 0 0',
          fontSize: '0.8125rem',
          color: '#4b5563',
          fontWeight: 500,
        }}
        data-testid="issue-title"
      >
        {issue.title}
      </p>
      <p
        style={{
          margin: '0.25rem 0 0',
          fontSize: '0.75rem',
          color: '#6b7280',
        }}
        data-testid="issue-explanation"
      >
        {issue.explanation}
      </p>
    </div>
  );
}
