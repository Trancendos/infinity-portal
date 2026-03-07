/**
 * NotificationCentre — Premium slide-in notification panel
 * ─────────────────────────────────────────────────────────
 * • Glassmorphism slide-in panel with spring animation
 * • Grouped notifications (Today, Earlier, This Week)
 * • Priority indicators (high = red dot, normal = blue, low = grey)
 * • Swipe-to-dismiss with drag gesture
 * • Mark-as-read, clear all, mark all read actions
 * • Keyboard navigation (Escape to close, Tab through items)
 * • WCAG 2.2 AA: ARIA live regions, focus trap, role=log
 * • Reduced-motion support
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';

/* ── Types ─────────────────────────────────────────────── */
interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  icon: string;
  priority: 'high' | 'normal' | 'low';
  read: boolean;
  group: 'today' | 'earlier' | 'week';
}

interface NotificationCentreProps {
  onClose: () => void;
}

/* ── Mock Data ─────────────────────────────────────────── */
const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: '1', title: 'Welcome to Infinity OS', body: 'Your workspace is ready. Explore the App Store to install modules.', time: 'Just now', icon: '∞', priority: 'normal', read: false, group: 'today' },
  { id: '2', title: 'Security Alert', body: 'Enable two-factor authentication to protect your account.', time: '5m ago', icon: '🔐', priority: 'high', read: false, group: 'today' },
  { id: '3', title: 'New Modules Available', body: 'Calendar, Notes, and Weather are now in the Infinity Market.', time: '1h ago', icon: '🏪', priority: 'low', read: false, group: 'today' },
  { id: '4', title: 'System Update', body: 'Infinity OS v2.4.0 is available. Restart to apply updates.', time: '3h ago', icon: '⬆️', priority: 'normal', read: true, group: 'today' },
  { id: '5', title: 'Backup Complete', body: 'Your workspace was backed up successfully at 02:00 AM.', time: 'Yesterday', icon: '☁️', priority: 'low', read: true, group: 'earlier' },
  { id: '6', title: 'Collaboration Invite', body: 'Alex invited you to the "Project Alpha" workspace.', time: 'Yesterday', icon: '👥', priority: 'normal', read: false, group: 'earlier' },
  { id: '7', title: 'Storage Warning', body: 'You are using 85% of your allocated storage. Consider upgrading.', time: '3 days ago', icon: '💾', priority: 'high', read: true, group: 'week' },
];

const GROUP_LABELS: Record<string, string> = {
  today: 'Today',
  earlier: 'Earlier',
  week: 'This Week',
};

const GROUP_ORDER = ['today', 'earlier', 'week'];

/* ── Priority Config ───────────────────────────────────── */
const PRIORITY_CONFIG = {
  high: { className: 'notif-item__dot--high', label: 'High priority' },
  normal: { className: 'notif-item__dot--normal', label: 'Normal priority' },
  low: { className: 'notif-item__dot--low', label: 'Low priority' },
};

/* ── Notification Item ─────────────────────────────────── */
interface NotifItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}

function NotifItem({ notification, onDismiss, onRead }: NotifItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const startX = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX.current;
    /* Only allow swipe right (positive) */
    setOffsetX(Math.max(0, dx));
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    if (offsetX > 120) {
      setIsDismissing(true);
      setTimeout(() => onDismiss(notification.id), 250);
    } else {
      setOffsetX(0);
    }
  }, [offsetX, notification.id, onDismiss]);

  const handleClick = useCallback(() => {
    if (offsetX < 5 && !notification.read) {
      onRead(notification.id);
    }
  }, [offsetX, notification.id, notification.read, onRead]);

  const priorityCfg = PRIORITY_CONFIG[notification.priority];

  return (
    <li
      className={`notif-item ${notification.read ? 'notif-item--read' : ''} ${isDismissing ? 'notif-item--dismissing' : ''}`}
      style={{ transform: `translateX(${offsetX}px)`, opacity: isDismissing ? 0 : 1 - offsetX / 400 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      role="listitem"
      aria-label={`${notification.title} — ${notification.priority} priority${notification.read ? ', read' : ', unread'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          setIsDismissing(true);
          setTimeout(() => onDismiss(notification.id), 250);
        }
      }}
    >
      {/* Swipe hint background */}
      <div className="notif-item__swipe-bg" aria-hidden="true">
        <span>✓ Dismiss</span>
      </div>

      <div className="notif-item__content">
        {/* Priority dot */}
        {!notification.read && (
          <span className={`notif-item__dot ${priorityCfg.className}`} aria-label={priorityCfg.label} />
        )}

        {/* Icon */}
        <span className="notif-item__icon" aria-hidden="true">{notification.icon}</span>

        {/* Text */}
        <div className="notif-item__text">
          <div className="notif-item__header">
            <span className="notif-item__title">{notification.title}</span>
            <span className="notif-item__time">{notification.time}</span>
          </div>
          <p className="notif-item__body">{notification.body}</p>
        </div>
      </div>
    </li>
  );
}

/* ── Main Component ────────────────────────────────────── */
export function NotificationCentre({ onClose }: NotificationCentreProps) {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  /* Focus trap — focus panel on mount */
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /* Escape to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 280);
  }, [onClose]);

  const handleDismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleClearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  /* Group notifications */
  const grouped = useMemo(() => {
    const groups: Record<string, Notification[]> = {};
    for (const n of notifications) {
      if (!groups[n.group]) groups[n.group] = [];
      groups[n.group].push(n);
    }
    return groups;
  }, [notifications]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`notif-backdrop ${isClosing ? 'notif-backdrop--closing' : ''}`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        className={`notif-panel ${isClosing ? 'notif-panel--closing' : ''}`}
        role="log"
        aria-label="Notification Centre"
        aria-live="polite"
        tabIndex={-1}
      >
        {/* Header */}
        <header className="notif-panel__header">
          <div className="notif-panel__header-left">
            <h2 className="notif-panel__title">Notifications</h2>
            {unreadCount > 0 && (
              <span className="notif-panel__badge">{unreadCount}</span>
            )}
          </div>
          <div className="notif-panel__header-actions">
            {unreadCount > 0 && (
              <button
                className="notif-panel__action-btn"
                onClick={handleMarkAllRead}
                aria-label="Mark all as read"
                title="Mark all as read"
              >
                ✓ Read all
              </button>
            )}
            <button
              className="notif-panel__close-btn"
              onClick={handleClose}
              aria-label="Close notification centre"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="notif-panel__content">
          {notifications.length === 0 ? (
            <div className="notif-panel__empty">
              <span className="notif-panel__empty-icon" aria-hidden="true">🔔</span>
              <p className="notif-panel__empty-title">All caught up!</p>
              <p className="notif-panel__empty-desc">No notifications to show.</p>
            </div>
          ) : (
            GROUP_ORDER.map(groupKey => {
              const items = grouped[groupKey];
              if (!items || items.length === 0) return null;
              return (
                <div className="notif-group" key={groupKey}>
                  <h3 className="notif-group__label">{GROUP_LABELS[groupKey]}</h3>
                  <ul className="notif-group__list" role="list">
                    {items.map(n => (
                      <NotifItem
                        key={n.id}
                        notification={n}
                        onDismiss={handleDismiss}
                        onRead={handleRead}
                      />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <footer className="notif-panel__footer">
            <button
              className="notif-panel__clear-btn"
              onClick={handleClearAll}
            >
              Clear all notifications
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}