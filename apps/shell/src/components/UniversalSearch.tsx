/**
 * UniversalSearch — Infinity OS Command Palette
 * ============================================================
 * Premium Spotlight/Raycast-style command palette with:
 * - Glassmorphism overlay with backdrop blur
 * - Real-time fuzzy search across modules, files, settings
 * - Keyboard navigation (arrows, enter, escape)
 * - Category grouping with icons
 * - Smooth animations on open/close
 * - WCAG 2.2 AA: ARIA combobox pattern, keyboard accessible
 * ============================================================
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MODULE_REGISTRY } from './WindowManager';

interface UniversalSearchProps {
  onClose: () => void;
  onOpenModule: (moduleId: string, title: string) => void;
}

interface SearchItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: string;
  moduleId?: string;
  action?: string;
}

const QUICK_ACTIONS: SearchItem[] = [
  { id: 'qa-files', icon: '📁', title: 'File Manager', description: 'Browse your files', category: 'Modules', moduleId: 'com.infinity-os.file-manager' },
  { id: 'qa-term', icon: '⌨️', title: 'Terminal', description: 'Open a terminal session', category: 'Modules', moduleId: 'com.infinity-os.terminal' },
  { id: 'qa-ai', icon: '🤖', title: 'AI Studio', description: 'AI-powered tools', category: 'Modules', moduleId: 'com.infinity-os.ai-studio' },
  { id: 'qa-kanban', icon: '📋', title: 'Task Board', description: 'Manage tasks and projects', category: 'Modules', moduleId: 'com.infinity-os.kanban' },
  { id: 'qa-settings', icon: '⚙️', title: 'Settings', description: 'Configure Infinity OS', category: 'Modules', moduleId: 'com.infinity-os.settings' },
  { id: 'qa-observatory', icon: '🔭', title: 'Observatory', description: 'Platform monitoring', category: 'Platform Core', moduleId: 'com.infinity-os.observatory' },
  { id: 'qa-hive', icon: '🐝', title: 'HIVE', description: 'Agent swarm intelligence', category: 'Platform Core', moduleId: 'com.infinity-os.hive' },
];

// Build searchable items from module registry
const ALL_ITEMS: SearchItem[] = [
  ...MODULE_REGISTRY.map(m => ({
    id: m.id,
    icon: m.icon,
    title: m.name,
    description: `Open ${m.name}`,
    category: m.category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    moduleId: m.id,
  })),
];

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function UniversalSearch({ onClose, onOpenModule }: UniversalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return QUICK_ACTIONS;
    return ALL_ITEMS.filter(item =>
      fuzzyMatch(query, item.title) || fuzzyMatch(query, item.description) || fuzzyMatch(query, item.category)
    ).slice(0, 12);
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((item: SearchItem) => {
    if (item.moduleId) {
      onOpenModule(item.moduleId, item.title);
    }
    onClose();
  }, [onOpenModule, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
    }
  }, [results, selectedIndex, handleSelect, onClose]);

  // Group results by category
  const grouped = useMemo(() => {
    const groups: Record<string, SearchItem[]> = {};
    results.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [results]);

  // Flat index mapping for keyboard nav
  let flatIndex = 0;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div
        className="search-palette"
        onClick={(e) => e.stopPropagation()}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-label="Universal search"
      >
        {/* Search input */}
        <div className="search-palette__input-wrapper">
          <svg className="search-palette__search-icon" viewBox="0 0 20 20" fill="currentColor" width="20" height="20" aria-hidden="true">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-palette__input"
            placeholder="Search modules, files, commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-activedescendant={results[selectedIndex] ? `search-item-${results[selectedIndex].id}` : undefined}
          />
          <kbd className="search-palette__kbd" aria-hidden="true">ESC</kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="search-results"
          className="search-palette__results"
          role="listbox"
        >
          {results.length === 0 ? (
            <div className="search-palette__empty">
              <span className="search-palette__empty-icon" aria-hidden="true">🔍</span>
              <p>No results for "{query}"</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="search-palette__group">
                <div className="search-palette__group-label">{category}</div>
                {items.map((item) => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      id={`search-item-${item.id}`}
                      data-index={currentIndex}
                      role="option"
                      aria-selected={isSelected}
                      className={`search-palette__item ${isSelected ? 'search-palette__item--selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <span className="search-palette__item-icon" aria-hidden="true">{item.icon}</span>
                      <div className="search-palette__item-text">
                        <span className="search-palette__item-title">{item.title}</span>
                        <span className="search-palette__item-desc">{item.description}</span>
                      </div>
                      {isSelected && (
                        <kbd className="search-palette__item-hint" aria-hidden="true">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="search-palette__footer" aria-hidden="true">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}