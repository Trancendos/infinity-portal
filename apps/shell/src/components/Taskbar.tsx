/**
 * Taskbar — Infinity OS bottom taskbar
 * Contains: App launcher, running windows, system tray, clock
 * WCAG 2.2 AA: Full keyboard navigation, ARIA labels
 */

import React, { useState, useEffect } from 'react';
import type { Window as OSWindow, User } from '@infinity-os/types';

interface TaskbarProps {
  windows: OSWindow[];
  user: User;
  uptime: number;
  onOpenModule: (moduleId: string, title: string) => void;
  onFocusWindow: (windowId: string) => void;
  onToggleSearch: () => void;
  onToggleNotifications: () => void;
}

const PINNED_APPS = [
  { moduleId: 'com.infinity-os.file-manager', title: 'File Manager', icon: '📁' },
  { moduleId: 'com.infinity-os.text-editor',  title: 'Text Editor',  icon: '📝' },
  { moduleId: 'com.infinity-os.terminal',     title: 'Terminal',     icon: '⌨️' },
  { moduleId: 'com.infinity-os.app-store',    title: 'App Store',    icon: '🏪' },
  { moduleId: 'com.infinity-os.settings',     title: 'Settings',     icon: '⚙️' },
];

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div
      className="taskbar-clock"
      aria-label={`Current time: ${timeStr}, ${dateStr}`}
      role="timer"
      aria-live="off"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontSize: '11px',
        lineHeight: 1.3,
        color: 'var(--text-secondary)',
        minWidth: '60px',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '13px' }}>{timeStr}</span>
      <span style={{ color: 'var(--text-muted)' }}>{dateStr}</span>
    </div>
  );
}

export function Taskbar({
  windows,
  user,
  onOpenModule,
  onFocusWindow,
  onToggleSearch,
  onToggleNotifications,
}: TaskbarProps) {
  return (
    <nav
      className="taskbar"
      role="navigation"
      aria-label="Infinity OS Taskbar"
    >
      {/* Start / Search Button */}
      <button
        className="taskbar-btn taskbar-btn--start"
        onClick={onToggleSearch}
        aria-label="Open universal search (Ctrl+Space)"
        title="Search (Ctrl+Space)"
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--accent-primary)',
          color: 'white',
          fontSize: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        ∞
      </button>

      {/* Separator */}
      <div
        aria-hidden="true"
        style={{ width: 1, height: 24, background: 'var(--border-default)', flexShrink: 0 }}
      />

      {/* Pinned Apps */}
      <div
        role="list"
        aria-label="Pinned applications"
        style={{ display: 'flex', gap: 4, alignItems: 'center' }}
      >
        {PINNED_APPS.map(app => {
          const isRunning = windows.some(w => w.moduleId === app.moduleId);
          return (
            <button
              key={app.moduleId}
              role="listitem"
              onClick={() => onOpenModule(app.moduleId, app.title)}
              aria-label={`${app.title}${isRunning ? ' (running)' : ''}`}
              title={app.title}
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: isRunning ? 'rgba(108,99,255,0.15)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                position: 'relative',
                transition: 'background 0.15s ease',
              }}
            >
              {app.icon}
              {/* Running indicator dot */}
              {isRunning && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--accent-primary)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div
        aria-hidden="true"
        style={{ width: 1, height: 24, background: 'var(--border-default)', flexShrink: 0 }}
      />

      {/* Running Windows */}
      <div
        role="list"
        aria-label="Open windows"
        style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, overflow: 'hidden' }}
      >
        {windows.filter(w => !w.isMinimised).map(window => (
          <button
            key={window.id}
            role="listitem"
            onClick={() => onFocusWindow(window.id)}
            aria-label={`${window.title} window${window.isFocused ? ' (active)' : ''}`}
            aria-pressed={window.isFocused}
            style={{
              height: 32,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid',
              borderColor: window.isFocused ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background: window.isFocused ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.05)',
              color: window.isFocused ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 140,
              transition: 'all 0.15s ease',
            }}
          >
            {window.title}
          </button>
        ))}
      </div>

      {/* System Tray */}
      <div
        role="group"
        aria-label="System tray"
        style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}
      >
        {/* Notifications */}
        <button
          onClick={onToggleNotifications}
          aria-label="Notifications"
          title="Notifications"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          🔔
        </button>

        {/* User Avatar */}
        <button
          aria-label={`User menu — ${user?.displayName ?? 'User'}`}
          title={user?.displayName ?? 'User'}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid var(--accent-primary)',
            background: 'var(--accent-primary)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {user?.displayName?.[0]?.toUpperCase() ?? '?'}
        </button>

        {/* Clock */}
        <Clock />
      </div>
    </nav>
  );
}