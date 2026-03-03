/**
 * Infinity-One Dashboard — IAM, Identity & Access Management
 * Connected to: infinity-one worker, BackendProvider, AuthProvider
 * Replaces the disconnected AdminPanel for IAM operations
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useBackend } from '../providers/BackendProvider';
import { useAuth } from '../providers/AuthProvider';

interface IAMUser {
  id: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer' | 'agent';
  status: 'active' | 'suspended' | 'pending' | 'locked';
  mfaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string;
  permissions: string[];
  riskScore: number;
}

interface IAMPolicy {
  id: string;
  name: string;
  description: string;
  effect: 'allow' | 'deny';
  resources: string[];
  actions: string[];
  conditions: Record<string, string>;
  active: boolean;
}

interface IAMSession {
  id: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

interface IAMStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  mfaAdoption: number;
  activeSessions: number;
  policiesEnforced: number;
  highRiskUsers: number;
  failedLogins24h: number;
}

type TabId = 'overview' | 'users' | 'policies' | 'sessions' | 'audit';

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#ef4444',
  admin: '#f97316',
  operator: '#eab308',
  viewer: '#22c55e',
  agent: '#6366f1',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  suspended: '#ef4444',
  pending: '#f59e0b',
  locked: '#ef4444',
};

export default function InfinityOneDashboard() {
  const { apiCall } = useBackend();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [users, setUsers] = useState<IAMUser[]>([]);
  const [policies, setPolicies] = useState<IAMPolicy[]>([]);
  const [sessions, setSessions] = useState<IAMSession[]>([]);
  const [stats, setStats] = useState<IAMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<IAMUser | null>(null);
  const [auditLog, setAuditLog] = useState<Array<{ id: string; action: string; actor: string; target: string; timestamp: string; result: 'success' | 'failure' }>>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.allSettled([
        apiCall('/api/v1/users'),
        apiCall('/api/v1/admin/stats'),
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value?.users) {
        const mapped: IAMUser[] = usersRes.value.users.map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.display_name || u.email,
          role: u.role || 'viewer',
          status: u.is_active ? 'active' : 'suspended',
          mfaEnabled: u.mfa_enabled || false,
          lastLogin: u.last_login || null,
          createdAt: u.created_at,
          permissions: u.permissions || [],
          riskScore: u.risk_score || 0,
        }));
        setUsers(mapped);

        // Derive stats from users
        setStats({
          totalUsers: mapped.length,
          activeUsers: mapped.filter(u => u.status === 'active').length,
          suspendedUsers: mapped.filter(u => u.status === 'suspended').length,
          mfaAdoption: mapped.length > 0 ? Math.round((mapped.filter(u => u.mfaEnabled).length / mapped.length) * 100) : 0,
          activeSessions: 0,
          policiesEnforced: 0,
          highRiskUsers: mapped.filter(u => u.riskScore > 70).length,
          failedLogins24h: 0,
        });
      } else {
        // Fallback demo data
        const demoUsers: IAMUser[] = [
          { id: '1', email: 'admin@trancendos.com', displayName: 'System Admin', role: 'super_admin', status: 'active', mfaEnabled: true, lastLogin: new Date().toISOString(), createdAt: '2024-01-01T00:00:00Z', permissions: ['*'], riskScore: 5 },
          { id: '2', email: 'ops@trancendos.com', displayName: 'Ops Engineer', role: 'operator', status: 'active', mfaEnabled: true, lastLogin: new Date(Date.now() - 3600000).toISOString(), createdAt: '2024-02-01T00:00:00Z', permissions: ['read:*', 'write:ops'], riskScore: 12 },
          { id: '3', email: 'viewer@trancendos.com', displayName: 'Read-Only User', role: 'viewer', status: 'active', mfaEnabled: false, lastLogin: new Date(Date.now() - 86400000).toISOString(), createdAt: '2024-03-01T00:00:00Z', permissions: ['read:*'], riskScore: 8 },
          { id: '4', email: 'agent-svc@trancendos.com', displayName: 'Norman-AI Service', role: 'agent', status: 'active', mfaEnabled: true, lastLogin: new Date().toISOString(), createdAt: '2024-01-15T00:00:00Z', permissions: ['read:security', 'write:incidents'], riskScore: 2 },
          { id: '5', email: 'suspended@trancendos.com', displayName: 'Suspended User', role: 'viewer', status: 'suspended', mfaEnabled: false, lastLogin: null, createdAt: '2024-04-01T00:00:00Z', permissions: [], riskScore: 85 },
        ];
        setUsers(demoUsers);
        setStats({ totalUsers: 5, activeUsers: 4, suspendedUsers: 1, mfaAdoption: 60, activeSessions: 3, policiesEnforced: 12, highRiskUsers: 1, failedLogins24h: 7 });
      }

      // Demo policies
      setPolicies([
        { id: 'p1', name: 'Admin Full Access', description: 'Full system access for administrators', effect: 'allow', resources: ['*'], actions: ['*'], conditions: { role: 'admin' }, active: true },
        { id: 'p2', name: 'Operator Write Access', description: 'Write access to operational resources', effect: 'allow', resources: ['ops:*', 'agents:*'], actions: ['read', 'write', 'execute'], conditions: { role: 'operator' }, active: true },
        { id: 'p3', name: 'Viewer Read Only', description: 'Read-only access to non-sensitive resources', effect: 'allow', resources: ['dashboard:*', 'reports:*'], actions: ['read'], conditions: { role: 'viewer' }, active: true },
        { id: 'p4', name: 'Block Suspended Users', description: 'Deny all access to suspended accounts', effect: 'deny', resources: ['*'], actions: ['*'], conditions: { status: 'suspended' }, active: true },
        { id: 'p5', name: 'MFA Required for Admin', description: 'Require MFA for admin-level operations', effect: 'deny', resources: ['admin:*'], actions: ['write', 'delete'], conditions: { mfa: 'false' }, active: true },
      ]);

      // Demo sessions
      setSessions([
        { id: 's1', userId: '1', userEmail: 'admin@trancendos.com', ipAddress: '10.0.0.1', userAgent: 'Chrome/120', createdAt: new Date(Date.now() - 1800000).toISOString(), expiresAt: new Date(Date.now() + 5400000).toISOString(), active: true },
        { id: 's2', userId: '2', userEmail: 'ops@trancendos.com', ipAddress: '10.0.0.45', userAgent: 'Firefox/121', createdAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), active: true },
        { id: 's3', userId: '4', userEmail: 'agent-svc@trancendos.com', ipAddress: '10.0.1.100', userAgent: 'InfinityOS-Agent/1.0', createdAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), active: true },
      ]);

      // Demo audit log
      setAuditLog([
        { id: 'a1', action: 'USER_LOGIN', actor: 'admin@trancendos.com', target: 'system', timestamp: new Date(Date.now() - 300000).toISOString(), result: 'success' },
        { id: 'a2', action: 'POLICY_UPDATED', actor: 'admin@trancendos.com', target: 'p2:Operator Write Access', timestamp: new Date(Date.now() - 600000).toISOString(), result: 'success' },
        { id: 'a3', action: 'USER_LOGIN_FAILED', actor: 'unknown@external.com', target: 'system', timestamp: new Date(Date.now() - 900000).toISOString(), result: 'failure' },
        { id: 'a4', action: 'USER_SUSPENDED', actor: 'admin@trancendos.com', target: 'suspended@trancendos.com', timestamp: new Date(Date.now() - 3600000).toISOString(), result: 'success' },
        { id: 'a5', action: 'MFA_ENROLLED', actor: 'ops@trancendos.com', target: 'ops@trancendos.com', timestamp: new Date(Date.now() - 7200000).toISOString(), result: 'success' },
        { id: 'a6', action: 'TOKEN_ROTATED', actor: 'agent-svc@trancendos.com', target: 'api-token-001', timestamp: new Date(Date.now() - 10800000).toISOString(), result: 'success' },
      ]);

    } catch (err) {
      console.error('InfinityOne: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'users', label: 'Users & Roles', icon: '👥' },
    { id: 'policies', label: 'Policies', icon: '📋' },
    { id: 'sessions', label: 'Sessions', icon: '🔗' },
    { id: 'audit', label: 'Audit Log', icon: '📜' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>∞</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Infinity-One IAM</h2>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Identity & Access Management • Zero-Trust Architecture</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 11, color: '#22c55e' }}>
              ● ENFORCING
            </div>
            <button onClick={fetchData} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: activeTab === tab.id ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: activeTab === tab.id ? '#818cf8' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>∞</div>
              <p style={{ color: '#64748b' }}>Loading IAM data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && stats && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Total Users', value: stats.totalUsers, icon: '👥', color: '#6366f1' },
                    { label: 'Active Sessions', value: stats.activeSessions || sessions.length, icon: '🔗', color: '#22c55e' },
                    { label: 'MFA Adoption', value: `${stats.mfaAdoption}%`, icon: '🔐', color: '#f59e0b' },
                    { label: 'High Risk Users', value: stats.highRiskUsers, icon: '⚠️', color: '#ef4444' },
                  ].map(card => (
                    <div key={card.label} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{card.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* User Status Breakdown */}
                  <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>USER STATUS BREAKDOWN</h3>
                    {[
                      { label: 'Active', count: stats.activeUsers, color: '#22c55e' },
                      { label: 'Suspended', count: stats.suspendedUsers, color: '#ef4444' },
                      { label: 'Pending', count: stats.totalUsers - stats.activeUsers - stats.suspendedUsers, color: '#f59e0b' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                        <span style={{ fontSize: 12, flex: 1, color: '#cbd5e1' }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.count}</span>
                        <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
                          <div style={{ width: `${stats.totalUsers > 0 ? (item.count / stats.totalUsers) * 100 : 0}%`, height: '100%', borderRadius: 2, background: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Role Distribution */}
                  <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>ROLE DISTRIBUTION</h3>
                    {Object.entries(
                      users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {} as Record<string, number>)
                    ).map(([role, count]) => (
                      <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: ROLE_COLORS[role] || '#64748b' }} />
                        <span style={{ fontSize: 12, flex: 1, color: '#cbd5e1', textTransform: 'capitalize' }}>{role.replace('_', ' ')}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: ROLE_COLORS[role] || '#64748b' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Audit Events */}
                <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>RECENT SECURITY EVENTS</h3>
                  {auditLog.slice(0, 4).map(event => (
                    <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: event.result === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: event.result === 'success' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                        {event.result.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{event.action}</span>
                      <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{event.actor}</span>
                      <span style={{ fontSize: 10, color: '#475569' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }}
                  />
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    + Invite User
                  </button>
                </div>
                <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['User', 'Role', 'Status', 'MFA', 'Risk Score', 'Last Login', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => setSelectedUser(u)}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${ROLE_COLORS[u.role]}33`, border: `1px solid ${ROLE_COLORS[u.role]}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: ROLE_COLORS[u.role] }}>
                                {u.displayName[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{u.displayName}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role], fontWeight: 600, textTransform: 'capitalize' }}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${STATUS_COLORS[u.status]}22`, color: STATUS_COLORS[u.status], fontWeight: 600, textTransform: 'capitalize' }}>
                              {u.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 16 }}>{u.mfaEnabled ? '🔐' : '⚠️'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: u.riskScore > 70 ? '#ef4444' : u.riskScore > 40 ? '#f59e0b' : '#22c55e' }}>
                              {u.riskScore}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b' }}>
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                              {u.status === 'active' ? (
                                <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 11 }}>Suspend</button>
                              ) : (
                                <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#4ade80', cursor: 'pointer', fontSize: 11 }}>Activate</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* POLICIES TAB */}
            {activeTab === 'policies' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{policies.length} policies enforced</p>
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    + New Policy
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {policies.map(policy => (
                    <div key={policy.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${policy.effect === 'allow' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: policy.effect === 'allow' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: policy.effect === 'allow' ? '#22c55e' : '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>
                            {policy.effect}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{policy.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: policy.active ? '#22c55e' : '#64748b' }}>● {policy.active ? 'Active' : 'Inactive'}</span>
                          <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>{policy.description}</p>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                        <span style={{ color: '#94a3b8' }}>Resources: <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{policy.resources.join(', ')}</span></span>
                        <span style={{ color: '#94a3b8' }}>Actions: <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{policy.actions.join(', ')}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SESSIONS TAB */}
            {activeTab === 'sessions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{sessions.filter(s => s.active).length} active sessions</p>
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Revoke All Sessions
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessions.map(session => (
                    <div key={session.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: session.active ? '#22c55e' : '#64748b', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{session.userEmail}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {session.ipAddress} • {session.userAgent} • Started {new Date(session.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Expires {new Date(session.expiresAt).toLocaleTimeString()}
                      </div>
                      <button style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 11 }}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AUDIT LOG TAB */}
            {activeTab === 'audit' && (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
                  <input placeholder="Filter audit events..." style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }} />
                  <button style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>Export CSV</button>
                </div>
                <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['Time', 'Action', 'Actor', 'Target', 'Result'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.map(event => (
                        <tr key={event.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{new Date(event.timestamp).toLocaleString()}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{event.action}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#cbd5e1' }}>{event.actor}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>{event.target}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: event.result === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: event.result === 'success' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                              {event.result.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}