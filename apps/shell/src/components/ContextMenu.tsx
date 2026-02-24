/**
 * ContextMenu — Right-click desktop context menu
 */

import React, { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpenModule: (moduleId: string, title: string) => void;
}

const MENU_ITEMS = [
  { label: 'New File', icon: '📄', action: 'new-file' },
  { label: 'New Folder', icon: '📁', action: 'new-folder' },
  { type: 'separator' },
  { label: 'Open File Manager', icon: '📂', moduleId: 'com.infinity-os.file-manager', title: 'File Manager' },
  { label: 'Open Terminal', icon: '⌨️', moduleId: 'com.infinity-os.terminal', title: 'Terminal' },
  { type: 'separator' },
  { label: 'Change Wallpaper', icon: '🖼️', action: 'wallpaper' },
  { label: 'Display Settings', icon: '🖥️', moduleId: 'com.infinity-os.settings', title: 'Settings' },
];

export function ContextMenu({ x, y, onClose, onOpenModule }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Desktop context menu"
      tabIndex={-1}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 9500,
        minWidth: 180,
        padding: '4px 0',
        outline: 'none',
      }}
    >
      {MENU_ITEMS.map((item, i) => {
        if (item.type === 'separator') {
          return (
            <div
              key={i}
              role="separator"
              style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }}
            />
          );
        }
        return (
          <button
            key={i}
            role="menuitem"
            onClick={() => {
              if (item.moduleId) onOpenModule(item.moduleId, item.title!);
              onClose();
            }}
            style={{
              width: '100%',
              padding: '8px 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: 'var(--text-primary)',
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(108,99,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}