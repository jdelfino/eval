'use client';

/**
 * Problem Search Component
 * 
 * Provides search, filter, and sort controls for the problem library.
 */

import React from 'react';

interface ProblemSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: 'title' | 'created' | 'updated';
  onSortChange: (sort: 'title' | 'created' | 'updated') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  availableTags?: string[];
  selectedTags?: string[];
  onTagToggle?: (tag: string) => void;
}

export default function ProblemSearch({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
  viewMode,
  onViewModeChange,
  availableTags = [],
  selectedTags = [],
  onTagToggle,
}: ProblemSearchProps) {
  return (
    <div className="space-y-4 mb-6">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search problems by title..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        {/* View mode toggle */}
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewModeChange('list')}
            className={`px-4 py-2 ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title="List view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`px-4 py-2 border-l border-gray-300 ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title="Grid view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filters and sorting */}
      <div className="flex flex-wrap gap-4">
        {/* Sort by */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as 'title' | 'created' | 'updated')}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="created">Date Created</option>
            <option value="updated">Last Updated</option>
            <option value="title">Title</option>
          </select>
        </div>

        {/* Sort order */}
        <button
          onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
          title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortOrder === 'asc' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span>Asc</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span>Desc</span>
            </>
          )}
        </button>
      </div>

      {/* Tag filters */}
      {availableTags.length > 0 && onTagToggle && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Tags:</span>
          {availableTags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => onTagToggle(tag)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
