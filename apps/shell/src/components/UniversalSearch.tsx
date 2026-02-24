/**
 * UniversalSearch — Spotlight-style universal search overlay
 * Searches: files, modules, users, settings, content
 * WCAG 2.2 AA: keyboard navigation, ARIA combobox pattern
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { SearchResult } from '@infinity-os/types';

interface UniversalSearchProps {
  onClose: () => void;
  onOpenModule: (moduleId: string, title: string) => void;
}

const QUICK_ACTIONS = [
  { id: 'qa-files',    type: 'module' as const, title: 'File Manager',  description: 'Browse your files',          moduleId: 'com.infinity-os.file-manager', score: 1, iconUrl: '📁' },
  { id: 'qa-editor',  type: 'module' as const, title: 'Text Editor',   description: 'Create or edit a document',  moduleId: 'com.infinity-os.text-editor',  score: 1, iconUrl: '📝' },
  { id: 'qa-term',    type: 'module' as const, title: 'Terminal',      description: 'Open a terminal session',    moduleId: 'com.infinity-os.terminal',     score: 1, iconUrl: '⌨️' },
  { id: 'qa-store',   type: 'module' as const, title: 'App Store',     description: 'Browse Infinity Market',     moduleId: 'com.infinity-os.app-store',    score: 1, iconUrl: '🏪' },
  { id: 'qa-settings',type: 'module' as const, title: 'Settings',      description: 'Configure Infinity OS',      moduleId: 'com.infinity-os.settings',     score: 1, iconUrl: '⚙️' },
];

export function UniversalSearch({ onClose, onOpenModule }: UniversalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(QUICK_ACTIONS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults(QUICK_ACTIONS);
      setSelectedIndex(0);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      // In production: call Search Service worker
      const filtered = QUICK_ACTIONS.filter(r =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.description?.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
      setSelectedIndex(0);
      setIsSearching(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.type === 'module' && result.moduleId) {
      onOpenModule(result.moduleId, result.title);
      onClose();
    }
  }, [onOpenModule, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) handleSelect(results[selectedIndex]);
        break;
    }
  }, [results, selectedIndex, handleSelect]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          zIndex: 8000,
        }}
      />

      {/* Search Panel */}
      <div
        role="dialog"
        aria-label="Universal Search"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 600,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 8001,
          overflow: 'hidden',
        }}
      >
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span aria-hidden="true" style={{ fontSize: 20, color: 'var(--text-muted)' }}>🔍</span>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={results[selectedIndex] ? `result-${results[selectedIndex].id}` : undefined}
            aria-label="Search Infinity OS"
            placeholder="Search apps, files, settings..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
          {isSearching && (
            <span className="spinner" aria-label="Searching..." style={{ borderTopColor: 'var(--accent-primary)' }} />
          )}
          <kbd style={{
            padding: '2px 8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul
          id="search-results"
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          style={{
            listStyle: 'none',
            maxHeight: 360,
            overflowY: 'auto',
            padding: '8px 0',
          }}
        >
          {results.length === 0 ? (
            <li style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No results for "{query}"
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.id}
                id={`result-${result.id}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 20px',
                  cursor: 'pointer',
                  background: index === selectedIndex ? 'rgba(108,99,255,0.1)' : 'transparent',
                  borderLeft: index === selectedIndex ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'background 0.1s ease',
                }}
              >
                <span style={{ fontSize: 22, width: 32, textAlign: 'center' }}>
                  {result.iconUrl}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {result.title}
                  </div>
                  {result.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                      {result.description}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-input)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--border-subtle)',
                }}>
                  {result.type}
                </span>
              </li>
            ))
          )}
        </ul>

        {/* Footer */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </>
  );
}