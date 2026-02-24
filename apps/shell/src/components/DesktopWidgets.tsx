/**
 * DesktopWidgets — Customisable widget grid on the desktop
 */

import React, { useState, useEffect } from 'react';
import type { User } from '@infinity-os/types';

interface DesktopWidgetsProps {
  user: User;
}

function ClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 20,
      padding: '20px 28px',
      color: 'white',
      textAlign: 'center',
      minWidth: 180,
    }}>
      <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

function WelcomeWidget({ user }: { user: User }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{
      background: 'rgba(108,99,255,0.25)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(108,99,255,0.4)',
      borderRadius: 20,
      padding: '16px 20px',
      color: 'white',
      minWidth: 200,
    }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{greeting},</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
        {user?.displayName ?? 'User'} 👋
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
        Infinity OS is ready
      </div>
    </div>
  );
}

export function DesktopWidgets({ user }: DesktopWidgetsProps) {
  return (
    <div
      aria-label="Desktop widgets"
      style={{
        position: 'absolute',
        top: 40,
        left: 40,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <ClockWidget />
      <WelcomeWidget user={user} />
    </div>
  );
}