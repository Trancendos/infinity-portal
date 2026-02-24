/**
 * NotificationCentre — Slide-in notification panel
 * WCAG 2.2 AA: ARIA live regions, keyboard dismissal
 */

import React from 'react';

interface NotificationCentreProps {
  onClose: () => void;
}

const MOCK_NOTIFICATIONS = [
  { id: '1', title: 'Welcome to Infinity OS', body: 'Your workspace is ready. Explore the App Store to install modules.', time: 'Just now', icon: '∞', priority: 'normal' },
  { id: '2', title: 'Security tip', body: 'Enable two-factor authentication to protect your account.', time: '5m ago', icon: '🔐', priority: 'high' },
  { id: '3', title: 'Infinity Market', body: 'New modules available: Calendar, Notes, and Weather.', time: '1h ago', icon: '🏪', priority: 'low' },
];

export function NotificationCentre({ onClose }: NotificationCentreProps) {
  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 7999 }} />
      <aside
        role="complementary"
        aria-label="Notification Centre"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 52,
          width: 360,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 8000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Notifications
          </h2>
          <button
            onClick={onClose}
            aria-label="Close notification centre"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 18, padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <ul
          role="list"
          aria-live="polite"
          aria-label="Notifications list"
          style={{ flex: 1, overflowY: 'auto', padding: '8px 0', listStyle: 'none' }}
        >
          {MOCK_NOTIFICATIONS.map(n => (
            <li
              key={n.id}
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{n.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.time}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button style={{
            width: '100%', padding: '8px', background: 'var(--bg-input)',
            border: '1px solid var(--border-default)', borderRadius: 8,
            color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
          }}>
            Clear all notifications
          </button>
        </div>
      </aside>
    </>
  );
}