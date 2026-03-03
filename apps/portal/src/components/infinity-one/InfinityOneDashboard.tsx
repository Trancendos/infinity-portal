/**
 * Infinity-One Dashboard
 * Central Account Management Hub — Google One / Microsoft Account style
 */

import React, { useState, useEffect } from 'react';

// ============================================================
// TYPES
// ============================================================

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
  verificationLevel: string;
  riskLevel: string;
  riskScore: number;
  roles: string[];
  mfaEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  lighthouseTokenId?: string;
}

interface SecurityScore {
  overall: number;
  mfa: number;
  sessions: number;
  recentActivity: number;
}

// ============================================================
// COLOUR HELPERS
// ============================================================

function getRiskColour(level: string): string {
  switch (level) {
    case 'critical': return '#ef4444';
    case 'high':     return '#f97316';
    case 'medium':   return '#eab308';
    case 'low':      return '#3b82f6';
    default:         return '#22c55e';
  }
}

function getStatusColour(status: string): string {
  switch (status) {
    case 'active':    return '#22c55e';
    case 'suspended': return '#f97316';
    case 'quarantined': return '#ef4444';
    case 'pending_verification': return '#eab308';
    default:          return '#6b7280';
  }
}

function getVerificationIcon(level: string): string {
  switch (level) {
    case 'quantum_verified':   return '⚛️';
    case 'biometric_verified': return '🧬';
    case 'identity_verified':  return '✅';
    case 'phone_verified':     return '📱';
    case 'email_verified':     return '📧';
    default:                   return '⚠️';
  }
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

const SecurityScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 80 }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const colour = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={colour} strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 700, color: colour }}>{score}</span>
        <span style={{ fontSize: size * 0.12, color: '#64748b' }}>/ 100</span>
      </div>
    </div>
  );
};

const Badge: React.FC<{ label: string; colour: string }> = ({ label, colour }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 10px', borderRadius: 9999,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
    background: colour + '22', color: colour,
    border: `1px solid ${colour}44`,
  }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: colour }} />
    {label.toUpperCase()}
  </span>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    border: '1px solid #334155',
    borderRadius: 16,
    padding: 24,
    ...style,
  }}>
    {children}
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; icon: string; colour: string; sub?: string }> = ({
  label, value, icon, colour, sub,
}) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: colour + '22', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: 22, flexShrink: 0,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: colour, marginTop: 2 }}>{sub}</div>}
    </div>
  </Card>
);

// ============================================================
// PROFILE SECTION
// ============================================================

const ProfileSection: React.FC<{ user: User }> = ({ user }) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
    {/* Avatar */}
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, fontWeight: 700, color: 'white',
        border: '3px solid #6366f1',
        overflow: 'hidden',
      }}>
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : user.displayName?.[0]?.toUpperCase() ?? '?'
        }
      </div>
      {/* Online indicator */}
      <div style={{
        position: 'absolute', bottom: 4, right: 4,
        width: 14, height: 14, borderRadius: '50%',
        background: getStatusColour(user.status),
        border: '2px solid #0f172a',
      }} />
    </div>

    {/* Info */}
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
          {user.displayName || 'Unknown User'}
        </h2>
        <span style={{ fontSize: 18 }}>{getVerificationIcon(user.verificationLevel)}</span>
      </div>
      <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>{user.email}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Badge label={user.status} colour={getStatusColour(user.status)} />
        <Badge label={user.riskLevel + ' risk'} colour={getRiskColour(user.riskLevel)} />
        {user.mfaEnabled && <Badge label="MFA Active" colour="#22c55e" />}
        {user.roles.map((role) => (
          <Badge key={role} label={role.replace('_', ' ')} colour="#6366f1" />
        ))}
      </div>
    </div>

    {/* Lighthouse Token */}
    {user.lighthouseTokenId && (
      <div style={{
        background: '#0f172a', border: '1px solid #334155',
        borderRadius: 10, padding: '10px 14px',
        fontFamily: 'monospace', fontSize: 11, color: '#64748b',
      }}>
        <div style={{ color: '#6366f1', fontWeight: 600, marginBottom: 4 }}>🔦 Lighthouse Token</div>
        <div style={{ color: '#94a3b8' }}>{user.lighthouseTokenId}</div>
      </div>
    )}
  </Card>
);

// ============================================================
// SECURITY PANEL
// ============================================================

const SecurityPanel: React.FC<{ user: User; score: SecurityScore }> = ({ user, score }) => {
  const checks = [
    { label: 'Multi-Factor Authentication', done: user.mfaEnabled, icon: '🔐' },
    { label: 'Email Verified', done: user.verificationLevel !== 'unverified', icon: '📧' },
    { label: 'Risk Score Below 30', done: user.riskScore < 30, icon: '🛡️' },
    { label: 'Lighthouse Token Active', done: !!user.lighthouseTokenId, icon: '🔦' },
    { label: 'Recent Login Activity Normal', done: user.riskLevel === 'none' || user.riskLevel === 'low', icon: '📊' },
  ];

  return (
    <Card>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
        🛡️ Security Overview
      </h3>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <SecurityScoreRing score={score.overall} size={100} />
        <div style={{ flex: 1, minWidth: 200 }}>
          {checks.map((check) => (
            <div key={check.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid #1e293b',
            }}>
              <span style={{ fontSize: 16 }}>{check.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: check.done ? '#94a3b8' : '#64748b' }}>
                {check.label}
              </span>
              <span style={{ fontSize: 16 }}>{check.done ? '✅' : '⚠️'}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

// ============================================================
// QUICK ACTIONS
// ============================================================

const QuickActions: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const actions = [
    { label: 'Change Password', icon: '🔑', colour: '#6366f1' },
    { label: 'Manage MFA', icon: '🔐', colour: '#8b5cf6' },
    { label: 'Active Sessions', icon: '💻', colour: '#06b6d4' },
    { label: 'Privacy Settings', icon: '🔒', colour: '#22c55e' },
    { label: 'Download My Data', icon: '📦', colour: '#f59e0b' },
    { label: 'Connected Apps', icon: '🔗', colour: '#ec4899' },
    ...(isAdmin ? [
      { label: 'Manage Users', icon: '👥', colour: '#f97316' },
      { label: 'Role Management', icon: '🎭', colour: '#ef4444' },
      { label: 'Audit Logs', icon: '📋', colour: '#84cc16' },
      { label: 'Security Policies', icon: '🛡️', colour: '#14b8a6' },
    ] : []),
  ];

  return (
    <Card>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
        ⚡ Quick Actions
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {actions.map((action) => (
          <button
            key={action.label}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '14px 10px', borderRadius: 12,
              background: action.colour + '11', border: `1px solid ${action.colour}33`,
              cursor: 'pointer', transition: 'all 0.2s',
              color: action.colour,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = action.colour + '22';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = action.colour + '11';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            <span style={{ fontSize: 22 }}>{action.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
};

// ============================================================
// CONNECTED SYSTEMS
// ============================================================

const ConnectedSystems: React.FC = () => {
  const systems = [
    { name: 'The Lighthouse', icon: '🔦', status: 'active', description: 'Token monitoring active', colour: '#f59e0b' },
    { name: 'The HIVE', icon: '🐝', status: 'active', description: 'Data routing connected', colour: '#eab308' },
    { name: 'The Void', icon: '🌑', status: 'active', description: 'Secrets vault sealed', colour: '#8b5cf6' },
    { name: 'Warp Tunnel', icon: '⚡', status: 'standby', description: 'Ready for transfer', colour: '#06b6d4' },
    { name: 'IceBox', icon: '🧊', status: 'active', description: '0 entities quarantined', colour: '#3b82f6' },
    { name: 'Infinity OS', icon: '♾️', status: 'active', description: 'Kernel v1.0.0 running', colour: '#6366f1' },
  ];

  return (
    <Card>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
        🔗 Connected Systems
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {systems.map((sys) => (
          <div key={sys.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 10,
            background: sys.colour + '11', border: `1px solid ${sys.colour}33`,
          }}>
            <span style={{ fontSize: 20 }}>{sys.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{sys.name}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sys.description}</div>
            </div>
            <div style={{
              marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
              background: sys.status === 'active' ? '#22c55e' : '#eab308',
              flexShrink: 0,
            }} />
          </div>
        ))}
      </div>
    </Card>
  );
};

// ============================================================
// MAIN DASHBOARD
// ============================================================

const InfinityOneDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'security' | 'sessions' | 'apps' | 'admin'>('overview');

  // Mock user data — in production: fetch from /users/me
  const user: User = {
    id: 'usr-001',
    email: 'admin@trancendos.com',
    displayName: 'Platform Administrator',
    status: 'active',
    verificationLevel: 'identity_verified',
    riskLevel: 'none',
    riskScore: 5,
    roles: ['super_admin'],
    mfaEnabled: true,
    lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    lighthouseTokenId: 'UET-M8X2K1-A4F9B2C3D5E6',
  };

  const securityScore: SecurityScore = {
    overall: 94,
    mfa: 100,
    sessions: 90,
    recentActivity: 95,
  };

  const isAdmin = user.roles.some((r) => ['super_admin', 'org_admin'].includes(r));

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'security', label: 'Security', icon: '🛡️' },
    { id: 'sessions', label: 'Sessions', icon: '💻' },
    { id: 'apps', label: 'Apps', icon: '🔗' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: '⚙️' }] : []),
  ] as const;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#f1f5f9',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1e293b',
        padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', height: 64 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 40 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>♾️</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>Infinity-One</div>
              <div style={{ fontSize: 10, color: '#6366f1', letterSpacing: '0.1em' }}>ACCOUNT HUB</div>
            </div>
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: activeTab === tab.id ? '#6366f1' : 'transparent',
                  color: activeTab === tab.id ? 'white' : '#94a3b8',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* User avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {user.displayName[0]}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              <StatCard label="Security Score" value={securityScore.overall} icon="🛡️" colour="#22c55e" sub="Excellent" />
              <StatCard label="Risk Score" value={user.riskScore} icon="⚠️" colour={getRiskColour(user.riskLevel)} sub={user.riskLevel + ' risk'} />
              <StatCard label="Active Sessions" value={2} icon="💻" colour="#6366f1" sub="2 devices" />
              <StatCard label="Connected Apps" value={5} icon="🔗" colour="#8b5cf6" sub="All authorised" />
            </div>

            <ProfileSection user={user} />
            <SecurityPanel user={user} score={securityScore} />
            <QuickActions isAdmin={isAdmin} />
            <ConnectedSystems />
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SecurityPanel user={user} score={securityScore} />
            <Card>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
                🔐 MFA Methods
              </h3>
              {[
                { type: 'TOTP Authenticator', icon: '📱', active: true, primary: true },
                { type: 'WebAuthn / Passkey', icon: '🔑', active: true, primary: false },
                { type: 'Backup Codes', icon: '📋', active: true, primary: false },
                { type: 'Neural Interface (2060)', icon: '🧠', active: false, primary: false },
              ].map((method) => (
                <div key={method.type} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 0', borderBottom: '1px solid #1e293b',
                }}>
                  <span style={{ fontSize: 20 }}>{method.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 500 }}>{method.type}</div>
                    {method.primary && <div style={{ fontSize: 11, color: '#6366f1' }}>Primary method</div>}
                  </div>
                  <Badge label={method.active ? 'Active' : 'Inactive'} colour={method.active ? '#22c55e' : '#64748b'} />
                </div>
              ))}
            </Card>
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
                👥 User Management
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <StatCard label="Total Users" value={1247} icon="👥" colour="#6366f1" />
                <StatCard label="Active Users" value={1198} icon="✅" colour="#22c55e" />
                <StatCard label="Suspended" value={12} icon="⏸️" colour="#f97316" />
                <StatCard label="High Risk" value={3} icon="⚠️" colour="#ef4444" />
              </div>
            </Card>
            <Card>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
                🎭 Role Distribution
              </h3>
              {[
                { role: 'Super Admin', count: 2, colour: '#ef4444' },
                { role: 'Org Admin', count: 15, colour: '#f97316' },
                { role: 'Power User', count: 87, colour: '#8b5cf6' },
                { role: 'Standard User', count: 1098, colour: '#6366f1' },
                { role: 'Bot / Agent', count: 45, colour: '#06b6d4' },
              ].map((item) => (
                <div key={item.role} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderBottom: '1px solid #1e293b',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.colour }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>{item.role}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{item.count}</span>
                  <div style={{
                    width: 80, height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2, background: item.colour,
                      width: `${Math.min(100, (item.count / 1247) * 100 * 5)}%`,
                    }} />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfinityOneDashboard;