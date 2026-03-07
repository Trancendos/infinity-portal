/**
 * LockScreen — Infinity OS Session Lock
 * ============================================================
 * Premium Figma-grade lock screen with:
 * - Large clock display with smooth second tick
 * - User avatar with gradient ring
 * - Glassmorphism unlock card
 * - Shake animation on wrong password
 * - Animated background orbs matching desktop
 * - WCAG 2.2 AA compliant
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../providers/AuthProvider';

export default function LockScreen() {
  const { user, unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mounted) inputRef.current?.focus();
  }, [mounted]);

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 600);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setError('');
    setIsLoading(true);
    try {
      const API_URL = import.meta.env.VITE_BACKEND_API_URL || '';
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, password }),
      });
      if (!res.ok) throw new Error('Invalid password');
      const data = await res.json();
      unlock?.(data);
    } catch {
      setError('Incorrect password');
      setPassword('');
      triggerShake();
      inputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const userName = (user as any)?.display_name || (user as any)?.displayName || (user as any)?.email || 'User';
  const userInitial = userName[0]?.toUpperCase() || '∞';

  return (
    <div className="lock-screen" role="main" aria-label="Infinity OS Lock Screen">
      {/* Background orbs */}
      <div className="lock-screen__bg" aria-hidden="true">
        <div className="auth-orb auth-orb--1" />
        <div className="auth-orb auth-orb--2" />
        <div className="auth-orb auth-orb--3" />
      </div>

      {/* Clock */}
      <div className={`lock-screen__clock ${mounted ? 'lock-screen__clock--visible' : ''}`}>
        <time className="lock-screen__time" aria-label={`Current time: ${timeStr}`}>
          {timeStr}
        </time>
        <p className="lock-screen__date">{dateStr}</p>
      </div>

      {/* Unlock card */}
      <div className={`lock-screen__card ${mounted ? 'lock-screen__card--visible' : ''} ${shakeError ? 'auth-container--shake' : ''}`}>
        {/* Avatar */}
        <div className="lock-screen__avatar">
          <div className="lock-screen__avatar-ring">
            <div className="lock-screen__avatar-inner">
              {userInitial}
            </div>
          </div>
          <p className="lock-screen__user-name">{userName}</p>
          <p className="lock-screen__user-status">
            <span className="lock-screen__status-dot" aria-hidden="true" />
            Locked
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-alert auth-alert--error" role="alert" aria-live="polite">
            <svg className="auth-alert__icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Unlock form */}
        <form onSubmit={handleUnlock} className="lock-screen__form" aria-label="Unlock form">
          <div className="auth-field__input-wrapper">
            <svg className="auth-field__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              type="password"
              autoComplete="current-password"
              placeholder="Enter password to unlock"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="auth-field__input"
              aria-label="Password"
            />
            <button
              type="submit"
              disabled={isLoading || !password}
              className="lock-screen__unlock-btn"
              aria-label="Unlock"
            >
              {isLoading ? (
                <span className="auth-btn__spinner" style={{ width: 16, height: 16 }} />
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Bottom hint */}
      <div className="lock-screen__hint" aria-hidden="true">
        Press Enter to unlock · Infinity OS v2.0
      </div>
    </div>
  );
}