import { IssueSeverity } from '@/server/types/analysis';

/**
 * Visual styles for each issue severity level.
 * Used by walkthrough UI components to render severity badges.
 */
export const severityStyles: Record<IssueSeverity, { bg: string; text: string; label: string }> = {
  'error': { bg: '#fef2f2', text: '#991b1b', label: 'Error' },
  'misconception': { bg: '#fef9c3', text: '#854d0e', label: 'Misconception' },
  'style': { bg: '#eff6ff', text: '#1e40af', label: 'Style' },
  'good-pattern': { bg: '#f0fdf4', text: '#166534', label: 'Good Pattern' },
};
