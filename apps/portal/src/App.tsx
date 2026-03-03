/**
 * Infinity OS Portal — Unified Application Shell
 *
 * Routes between all four core platform dashboards:
 *   • Infinity-One  — Account & Identity Hub
 *   • The Lighthouse — Cryptographic Token Hub
 *   • The HIVE       — Swarm Data Router
 *   • The Void       — Secure Secret Store
 *
 * No external CSS dependencies — all styles are inline.
 * No router library — uses simple hash-based navigation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { InfinityOneDashboard } from './components/infinity-one/InfinityOneDashboard';
import { LighthouseDashboard }  from './components/lighthouse/LighthouseDashboard';
import { HiveDashboard }        from './components/hive/HiveDashboard';
import { VoidDashboard }        from './components/void/VoidDashboard';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SystemId = 'infinity-one' | 'lighthouse' | 'hive' | 'void';

interface SystemConfig {
  id:          SystemId;
  label:       string;
  subtitle:    string;
  icon:        string;
  accentColor: string;
  glowColor:   string;
  status:      'online' | 'degraded' | 'offline';
  version:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEMS: SystemConfig[] = [
  {
    id:          'infinity-one',
    label:       'Infinity-One',
    subtitle:    'Account & Identity Hub',
    icon:        '∞',
    accentColor: '#6366f1',
    glowColor:   'rgba(99,102,241,0.3)',
    status:      'online',
    version:     'v1.0.0',
  },
  {
    id:          'lighthouse',
    label:       'The Lighthouse',
    subtitle:    'Cryptographic Token Hub',
    icon:        '⬡',
    accentColor: '#f59e0b',
    glowColor:   'rgba(245,158,11,0.3)',
    status:      'online',
    version:     'v1.0.0',
  },
  {
    id:          'hive',
    label:       'The HIVE',
    subtitle:    'Swarm Data Router',
    icon:        '⬢',
    accentColor: '#f97316',
    glowColor:   'rgba(249,115,22,0.3)',
    status:      'online',
    version:     'v1.0.0',
  },
  {
    id:          'void',
    label:       'The Void',
    subtitle:    'Secure Secret Store',
    icon:        '◈',
    accentColor: '#8b5cf6',
    glowColor:   'rgba(139,92,246,0.3)',
    status:      'online',
    version:     'v1.0.0',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getHashSystem(): SystemId | null {
  const hash = window.location.hash.replace('#', '');
  if (SYSTEMS.find(s => s.id === hash)) return hash as SystemId;
  return null;
}

function StatusDot({ status }: { status: SystemConfig['status'] }) {
  const color =
    status === 'online'   ? '#22c55e' :
    status === 'degraded' ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      display:       'inline-block',
      width:         8,
      height:        8,
      borderRadius:  '50%',
      background:    color,
      boxShadow:     `0 0 6px ${color}`,
      marginRight:   6,
      flexShrink:    0,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING / SYSTEM SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

function SystemCard({
  system,
  onSelect,
}: {
  system: SystemConfig;
  onSelect: (id: SystemId) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect(system.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    hovered
          ? `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`
          : `linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)`,
        border:        `1px solid ${hovered ? system.accentColor : 'rgba(255,255,255,0.08)'}`,
        borderRadius:  16,
        padding:       '32px 28px',
        cursor:        'pointer',
        textAlign:     'left',
        transition:    'all 0.25s ease',
        boxShadow:     hovered ? `0 0 32px ${system.glowColor}` : 'none',
        transform:     hovered ? 'translateY(-4px)' : 'none',
        width:         '100%',
      }}
    >
      {/* Icon */}
      <div style={{
        fontSize:      48,
        color:         system.accentColor,
        marginBottom:  16,
        lineHeight:    1,
        filter:        hovered ? `drop-shadow(0 0 12px ${system.accentColor})` : 'none',
        transition:    'filter 0.25s ease',
      }}>
        {system.icon}
      </div>

      {/* Label */}
      <div style={{
        fontSize:      20,
        fontWeight:    700,
        color:         '#f1f5f9',
        marginBottom:  4,
        letterSpacing: '-0.3px',
      }}>
        {system.label}
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize:      13,
        color:         '#64748b',
        marginBottom:  20,
      }}>
        {system.subtitle}
      </div>

      {/* Footer */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <StatusDot status={system.status} />
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'capitalize' }}>
            {system.status}
          </span>
        </div>
        <span style={{
          fontSize:      11,
          color:         system.accentColor,
          background:    `${system.accentColor}18`,
          padding:       '2px 8px',
          borderRadius:  20,
          border:        `1px solid ${system.accentColor}30`,
        }}>
          {system.version}
        </span>
      </div>
    </button>
  );
}

function LandingPage({ onSelect }: { onSelect: (id: SystemId) => void }) {
  return (
    <div style={{
      minHeight:      '100vh',
      background:     '#020617',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '40px 24px',
      fontFamily:     "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 64 }}>
        {/* Logo mark */}
        <div style={{
          width:          72,
          height:         72,
          borderRadius:   20,
          background:     'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       36,
          margin:         '0 auto 24px',
          boxShadow:      '0 0 40px rgba(99,102,241,0.4)',
        }}>
          ∞
        </div>

        <h1 style={{
          fontSize:      40,
          fontWeight:    800,
          color:         '#f1f5f9',
          margin:        '0 0 8px',
          letterSpacing: '-1px',
          background:    'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Infinity OS
        </h1>

        <p style={{
          fontSize:  16,
          color:     '#475569',
          margin:    0,
          maxWidth:  480,
        }}>
          Platform Core — Select a system to manage
        </p>

        {/* Platform status bar */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            24,
          marginTop:      24,
          padding:        '10px 24px',
          background:     'rgba(255,255,255,0.03)',
          borderRadius:   40,
          border:         '1px solid rgba(255,255,255,0.06)',
          width:          'fit-content',
          margin:         '24px auto 0',
        }}>
          <StatusDot status="online" />
          <span style={{ fontSize: 13, color: '#64748b' }}>All systems operational</span>
          <span style={{ fontSize: 13, color: '#334155' }}>|</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
          </span>
        </div>
      </div>

      {/* System grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap:                 20,
        width:               '100%',
        maxWidth:            1100,
      }}>
        {SYSTEMS.map(system => (
          <SystemCard key={system.id} system={system} onSelect={onSelect} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop:  48,
        textAlign:  'center',
        color:      '#1e293b',
        fontSize:   12,
      }}>
        Infinity OS Platform Core · Built for 2060 · Zero-cost · Modular · Quantum-safe
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION BAR (shown when inside a system)
// ─────────────────────────────────────────────────────────────────────────────

function NavBar({
  active,
  onNavigate,
  onHome,
}: {
  active: SystemId;
  onNavigate: (id: SystemId) => void;
  onHome: () => void;
}) {
  const activeSystem = SYSTEMS.find(s => s.id === active)!;

  return (
    <nav style={{
      position:       'fixed',
      top:            0,
      left:           0,
      right:          0,
      zIndex:         1000,
      background:     'rgba(2,6,23,0.92)',
      backdropFilter: 'blur(20px)',
      borderBottom:   '1px solid rgba(255,255,255,0.06)',
      display:        'flex',
      alignItems:     'center',
      padding:        '0 24px',
      height:         56,
      gap:            8,
    }}>
      {/* Home button */}
      <button
        onClick={onHome}
        style={{
          background:   'none',
          border:       'none',
          cursor:       'pointer',
          color:        '#64748b',
          fontSize:     22,
          padding:      '4px 8px',
          borderRadius: 8,
          lineHeight:   1,
          transition:   'color 0.2s',
          marginRight:  8,
        }}
        title="Back to Platform Home"
      >
        ∞
      </button>

      <span style={{ color: '#1e293b', fontSize: 16, marginRight: 8 }}>/</span>

      {/* System tabs */}
      {SYSTEMS.map(system => {
        const isActive = system.id === active;
        return (
          <button
            key={system.id}
            onClick={() => onNavigate(system.id)}
            style={{
              background:    isActive ? `${system.accentColor}18` : 'none',
              border:        isActive ? `1px solid ${system.accentColor}40` : '1px solid transparent',
              borderRadius:  8,
              padding:       '5px 14px',
              cursor:        'pointer',
              color:         isActive ? system.accentColor : '#475569',
              fontSize:      13,
              fontWeight:    isActive ? 600 : 400,
              transition:    'all 0.2s',
              display:       'flex',
              alignItems:    'center',
              gap:           6,
              whiteSpace:    'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>{system.icon}</span>
            {system.label}
          </button>
        );
      })}

      {/* Right side — active system info */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={activeSystem.status} />
        <span style={{ fontSize: 12, color: '#475569' }}>
          {activeSystem.version}
        </span>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM VIEW WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

function SystemView({ systemId }: { systemId: SystemId }) {
  switch (systemId) {
    case 'infinity-one': return <InfinityOneDashboard />;
    case 'lighthouse':   return <LighthouseDashboard />;
    case 'hive':         return <HiveDashboard />;
    case 'void':         return <VoidDashboard />;
    default:             return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeSystem, setActiveSystem] = useState<SystemId | null>(
    () => getHashSystem()
  );

  // Sync hash with active system
  useEffect(() => {
    const onHashChange = () => setActiveSystem(getHashSystem());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = useCallback((id: SystemId) => {
    window.location.hash = id;
    setActiveSystem(id);
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '';
    setActiveSystem(null);
  }, []);

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#020617',
      minHeight:  '100vh',
    }}>
      {activeSystem ? (
        <>
          <NavBar
            active={activeSystem}
            onNavigate={navigateTo}
            onHome={goHome}
          />
          {/* Offset for fixed navbar */}
          <div style={{ paddingTop: 56 }}>
            <SystemView systemId={activeSystem} />
          </div>
        </>
      ) : (
        <LandingPage onSelect={navigateTo} />
      )}
    </div>
  );
}