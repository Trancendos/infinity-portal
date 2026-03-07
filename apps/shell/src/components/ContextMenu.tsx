/**
 * ContextMenu — Infinity OS Desktop Right-Click Menu
 * ============================================================
 * Premium Figma-grade context menu with:
 * - Glassmorphism surface with backdrop blur
 * - Smooth scale-in animation from click origin
 * - Keyboard navigation (arrows, enter, escape)
 * - Grouped items with separators
 * - Hover highlight with accent color
 * - Auto-repositioning to stay within viewport
 * - WCAG 2.2 AA: role="menu", keyboard accessible
 * ============================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpenModule: (moduleId: string, title: string) => void;
}

interface MenuItem {
  label?: string;
  icon?: string;
  shortcut?: string;
  action?: string;
  moduleId?: string;
  title?: string;
  type?: 'separator';
  disabled?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'New File', icon: '📄', shortcut: '⌘N', action: 'new-file' },
  { label: 'New Folder', icon: '📁', shortcut: '⇧⌘N', action: 'new-folder' },
  { type: 'separator' },
  { label: 'Open File Manager', icon: '📂', moduleId: 'com.infinity-os.file-manager', title: 'File Manager' },
  { label: 'Open Terminal', icon: '⌨️', shortcut: '⌘T', moduleId: 'com.infinity-os.terminal', title: 'Terminal' },
  { label: 'Open AI Studio', icon: '🤖', moduleId: 'com.infinity-os.ai-studio', title: 'AI Studio' },
  { type: 'separator' },
  { label: 'Change Wallpaper', icon: '🖼️', action: 'wallpaper' },
  { label: 'Display Settings', icon: '🖥️', moduleId: 'com.infinity-os.settings', title: 'Settings' },
  { type: 'separator' },
  { label: 'About Infinity OS', icon: '∞', action: 'about' },
];

export function ContextMenu({ x, y, onClose, onOpenModule }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Get actionable items (non-separators)
  const actionableIndices = MENU_ITEMS
    .map((item, i) => (item.type !== 'separator' && !item.disabled ? i : -1))
    .filter(i => i >= 0);

  // Auto-reposition to stay within viewport
  const menuWidth = 220;
  const menuHeight = MENU_ITEMS.length * 36;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing immediately from the right-click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const handleAction = useCallback((item: MenuItem) => {
    if (item.disabled) return;
    if (item.moduleId && item.title) {
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
      case 'ArrowDown': {
        e.preventDefault();
        const currentPos = actionableIndices.indexOf(focusedIndex);
        const nextPos = currentPos < actionableIndices.length - 1 ? currentPos + 1 : 0;
        setFocusedIndex(actionableIndices[nextPos]);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const currentPos = actionableIndices.indexOf(focusedIndex);
        const prevPos = currentPos > 0 ? currentPos - 1 : actionableIndices.length - 1;
        setFocusedIndex(actionableIndices[prevPos]);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleAction(MENU_ITEMS[focusedIndex]);
        }
        break;
      }
    }
  }, [focusedIndex, actionableIndices, handleAction, onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label="Desktop context menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        left: adjustedX,
        top: adjustedY,
        transformOrigin: `${x - adjustedX}px ${y - adjustedY}px`,
      }}
    >
      {MENU_ITEMS.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="context-menu__separator" role="separator" />;
        }
        const isFocused = focusedIndex === i;
        return (
          <button
            key={i}
            role="menuitem"
            className={`context-menu__item ${isFocused ? 'context-menu__item--focused' : ''} ${item.disabled ? 'context-menu__item--disabled' : ''}`}
            onClick={() => handleAction(item)}
            onMouseEnter={() => setFocusedIndex(i)}
            onMouseLeave={() => setFocusedIndex(-1)}
            disabled={item.disabled}
            aria-disabled={item.disabled}
            tabIndex={-1}
          >
            <span className="context-menu__icon" aria-hidden="true">{item.icon}</span>
            <span className="context-menu__label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu__shortcut" aria-hidden="true">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}