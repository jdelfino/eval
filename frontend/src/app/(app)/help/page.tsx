'use client';

/**
 * Help page component.
 * Displays role-aware help content using tabs for multiple guides
 * or a single section when only one guide is available.
 */

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getHelpTopicsForRole, HELP_INTRO } from '@/config/help-content';
import MarkdownContent from '@/components/MarkdownContent';
import Tabs from '@/components/ui/Tabs';

export default function HelpPage() {
  const { user } = useAuth();
  const role = user?.role || 'student';
  const topics = getHelpTopicsForRole(role);
  const [activeTab, setActiveTab] = useState(topics[0]?.id || '');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Help</h1>
      <p className="text-gray-600 mb-8">{HELP_INTRO}</p>

      {topics.length === 1 ? (
        /* Single topic: render heading + content directly, no tabs */
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{topics[0].title}</h2>
          <MarkdownContent content={topics[0].content} />
        </div>
      ) : (
        /* Multiple topics: render in tabs */
        <Tabs activeTab={activeTab} onTabChange={setActiveTab}>
          <Tabs.List>
            {topics.map(topic => (
              <Tabs.Tab key={topic.id} tabId={topic.id}>
                {topic.title}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {topics.map(topic => (
            <Tabs.Panel key={topic.id} tabId={topic.id}>
              <MarkdownContent content={topic.content} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </div>
  );
}
