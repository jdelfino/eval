'use client';

import React, { forwardRef, HTMLAttributes, ButtonHTMLAttributes, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

/**
 * Context for sharing tab state between components
 */
interface TabsContextValue {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs compound components must be used within a Tabs component');
  }
  return context;
}

/**
 * Props for the Tabs container component
 */
export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  /** Currently active tab identifier */
  activeTab: string;
  /** Callback when a tab is selected */
  onTabChange: (tabId: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Tab content */
  children: React.ReactNode;
}

/**
 * Props for Tabs.List component
 */
export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  /** Additional CSS classes */
  className?: string;
  /** Tab buttons */
  children: React.ReactNode;
}

/**
 * Props for Tabs.Tab component
 */
export interface TabsTabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Unique identifier for this tab */
  tabId: string;
  /** Additional CSS classes */
  className?: string;
  /** Tab label content */
  children: React.ReactNode;
}

/**
 * Props for Tabs.Panel component
 */
export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Tab identifier this panel corresponds to */
  tabId: string;
  /** Keep the panel mounted when inactive instead of unmounting it */
  keepMounted?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Panel content */
  children: React.ReactNode;
}

/**
 * Tab list container component
 */
const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="tablist"
        className={cn('flex border-b border-gray-200', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsList.displayName = 'Tabs.List';

/**
 * Individual tab button component
 */
const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(
  ({ tabId, className, children, disabled, ...props }, ref) => {
    const { activeTab, onTabChange } = useTabsContext();
    const isActive = activeTab === tabId;

    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        aria-selected={isActive}
        aria-controls={`panel-${tabId}`}
        disabled={disabled}
        className={cn(
          'px-4 py-2 text-sm font-medium transition-colors',
          'border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
          isActive
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onClick={() => !disabled && onTabChange(tabId)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTab.displayName = 'Tabs.Tab';

/**
 * Tab panel content component
 */
const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(
  ({ tabId, keepMounted, className, children, ...props }, ref) => {
    const { activeTab } = useTabsContext();
    const isActive = activeTab === tabId;

    if (!isActive && !keepMounted) {
      return null;
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`panel-${tabId}`}
        aria-labelledby={tabId}
        tabIndex={0}
        className={cn('py-4 focus:outline-none', className)}
        hidden={!isActive}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsPanel.displayName = 'Tabs.Panel';

/**
 * Tabs component - a reusable tabbed interface with consistent styling
 *
 * Features:
 * - Controlled state via activeTab + onTabChange
 * - Compound components for List, Tab, and Panel
 * - Active state styling with border-bottom indicator
 * - Accessible with proper ARIA attributes
 * - Support for disabled tabs
 *
 * @example
 * ```tsx
 * const [activeTab, setActiveTab] = useState('details');
 *
 * <Tabs activeTab={activeTab} onTabChange={setActiveTab}>
 *   <Tabs.List>
 *     <Tabs.Tab tabId="details">Details</Tabs.Tab>
 *     <Tabs.Tab tabId="settings">Settings</Tabs.Tab>
 *   </Tabs.List>
 *   <Tabs.Panel tabId="details">
 *     Details content here
 *   </Tabs.Panel>
 *   <Tabs.Panel tabId="settings">
 *     Settings content here
 *   </Tabs.Panel>
 * </Tabs>
 * ```
 */
const TabsBase = forwardRef<HTMLDivElement, TabsProps>(
  ({ activeTab, onTabChange, className, children, ...props }, ref) => {
    return (
      <TabsContext.Provider value={{ activeTab, onTabChange }}>
        <div
          ref={ref}
          className={cn('w-full', className)}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
TabsBase.displayName = 'Tabs';

// Create compound component
type TabsComponent = typeof TabsBase & {
  List: typeof TabsList;
  Tab: typeof TabsTab;
  Panel: typeof TabsPanel;
};

export const Tabs = TabsBase as TabsComponent;
Tabs.List = TabsList;
Tabs.Tab = TabsTab;
Tabs.Panel = TabsPanel;

export default Tabs;
