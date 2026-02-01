/**
 * Panel configuration for the application.
 * Defines collapsible panels and their default states for different pages.
 */

/** Possible states for a panel */
export type PanelDefaultState = 'expanded' | 'collapsed' | 'hidden';

/** Panel configuration */
export interface PanelConfig {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  defaultState: PanelDefaultState;
}

/**
 * Panel configurations for the session page.
 */
export const SESSION_PANELS: PanelConfig[] = [
  {
    id: 'problem-setup',
    label: 'Problem Setup',
    icon: 'FileCode',
    defaultState: 'expanded',
  },
  {
    id: 'ai-walkthrough',
    label: 'AI Walkthrough',
    icon: 'Bot',
    defaultState: 'expanded',
  },
];

/**
 * Get panel configurations for a specific page.
 * @param pageId - The page identifier
 * @returns Array of panel configurations for the page
 */
export function getPanelsForPage(pageId: string): PanelConfig[] {
  switch (pageId) {
    case 'session':
      return SESSION_PANELS;
    default:
      return [];
  }
}
