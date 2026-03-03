/**
 * Lighthouse Dashboard
 * Cryptographic Token Management Hub — Real-time threat monitoring
 */

import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

interface EntityToken {
  tokenId: string;
  entityId: string;
  entityType: string;
  riskScore: number;
  riskLevel: string;
  status: string;
  classification: string;
  issuedAt: string;
  lastVerifiedAt?: string;
}

interface ThreatEvent {
  threatId: string;
  entityId: string;
  entityType: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  mitreTactic?: string;
  detectedAt: string;
}

interface IceBoxEntry {
  entryId: string;
  entityId: string;
  entityType: string;
  status: string;
  quarantinedAt: string;
  verdict?: { decision: string };
}

interface Metrics {
  tokens: { total: number; active: number; revoked: number; highRisk: number };
  threats: { total: number; open: number; critical: number };
  warpTunnel: { total: number; completed: number };
  iceBox: { total: number; quarantined: number; released: number };
}

// ============================================================
// HELPERS
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

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high':     return '🟠';
    case 'medium':   return '🟡';
    default:         return '🔵';
  }
}

function getEntityIcon(type: string): string {
  switch (type) {
    case 'user':            return '👤';
    case 'bot':             return '🤖';
    case 'agent':           return '🧠';
    case 'ai_model':        return '⚡';
    case 'service':         return '⚙️';
    case 'data':            return '📦';
    case 'transaction':     return '💳';
    case 'quantum_resource':return '⚛️';
    case 'neural_pattern':  return '🧬';
    default:                return '🔷';
  }
}

// ============================================================
// ANIMATED PULSE RING
// ============================================================

const PulseRing: React.FC<{ colour: string; size?: number; active?: boolean }> = ({
  colour, size = 12, active = true,
}) => (
  <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colour,
    }} />
    {active && (
      <div style={{
        position: 'absolute', inset: -4,
        borderRadius: '50%', border: `2px solid ${colour}`,
        animation: 'pulse 2s infinite',
        opacity: 0.6,
      }} />
    )}
  </div>
);

// ============================================================
// THREAT FEED
// ============================================================

const ThreatFeed: React.FC<{ threats: ThreatEvent[] }> = ({ threats }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: '1px solid #334155', borderRadius: 16, padding: 20,
    maxHeight: 400, overflowY: 'auto',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
        🚨 Live Threat Feed
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <PulseRing colour="#ef4444" size={8} />
        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>LIVE</span>
      </div>
    </div>

    {threats.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontSize: 13 }}>No active threats detected</div>
      </div>
    ) : (
      threats.map((threat) => (
        <div key={threat.threatId} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 0', borderBottom: '1px solid #1e293b',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{getSeverityIcon(threat.severity)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 }}>
              {threat.title}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {getEntityIcon(threat.entityType)} {threat.entityId.substring(0, 12)}...
              </span>
              {threat.mitreTactic && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: '#ef444422', color: '#ef4444',
                }}>
                  MITRE: {threat.mitreTactic}
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
            {new Date(threat.detectedAt).toLocaleTimeString()}
          </div>
        </div>
      ))
    )}
  </div>
);

// ============================================================
// TOKEN TABLE
// ============================================================

const TokenTable: React.FC<{ tokens: EntityToken[] }> = ({ tokens }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: '1px solid #334155', borderRadius: 16, padding: 20,
  }}>
    <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
      🔑 Entity Token Registry
    </h3>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155' }}>
            {['Token ID', 'Entity', 'Type', 'Risk', 'Classification', 'Status', 'Issued'].map((h) => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left',
                color: '#64748b', fontWeight: 600, fontSize: 11,
                letterSpacing: '0.05em', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.tokenId} style={{
              borderBottom: '1px solid #1e293b',
              transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#ffffff08')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#6366f1', fontSize: 11 }}>
                {token.tokenId.substring(0, 20)}...
              </td>
              <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                {token.entityId.substring(0, 12)}...
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
                  {getEntityIcon(token.entityType)} {token.entityType}
                </span>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 40, height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: getRiskColour(token.riskLevel),
                      width: `${token.riskScore}%`,
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: getRiskColour(token.riskLevel), fontWeight: 600 }}>
                    {token.riskScore}
                  </span>
                </div>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                  background: '#6366f122', color: '#6366f1',
                }}>
                  {token.classification}
                </span>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                  background: token.status === 'active' ? '#22c55e22' : '#ef444422',
                  color: token.status === 'active' ? '#22c55e' : '#ef4444',
                }}>
                  {token.status}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11 }}>
                {new Date(token.issuedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ============================================================
// ICEBOX PANEL
// ============================================================

const IceBoxPanel: React.FC<{ entries: IceBoxEntry[] }> = ({ entries }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: '1px solid #1d4ed8', borderRadius: 16, padding: 20,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 24 }}>🧊</span>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>IceBox</h3>
        <div style={{ fontSize: 11, color: '#3b82f6' }}>Quarantine & Forensic Analysis</div>
      </div>
      <div style={{
        marginLeft: 'auto', background: '#1d4ed822', border: '1px solid #1d4ed8',
        borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#3b82f6',
      }}>
        {entries.filter((e) => e.status === 'quarantined').length} quarantined
      </div>
    </div>

    {entries.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🧊</div>
        <div style={{ fontSize: 13 }}>IceBox is empty — no quarantined entities</div>
      </div>
    ) : (
      entries.map((entry) => (
        <div key={entry.entryId} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 10, marginBottom: 8,
          background: '#1d4ed811', border: '1px solid #1d4ed833',
        }}>
          <span style={{ fontSize: 18 }}>{getEntityIcon(entry.entityType)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#94a3b8' }}>
              {entry.entityId.substring(0, 20)}...
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Quarantined {new Date(entry.quarantinedAt).toLocaleString()}
            </div>
          </div>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            background: entry.status === 'quarantined' ? '#3b82f622' : '#22c55e22',
            color: entry.status === 'quarantined' ? '#3b82f6' : '#22c55e',
          }}>
            {entry.verdict?.decision ?? entry.status}
          </span>
        </div>
      ))
    )}
  </div>
);

// ============================================================
// WARP TUNNEL VISUALISER
// ============================================================

const WarpTunnelVisualiser: React.FC<{ active: boolean }> = ({ active }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: `1px solid ${active ? '#06b6d4' : '#334155'}`,
    borderRadius: 16, padding: 20,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 24 }}>⚡</span>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Warp Tunnel</h3>
        <div style={{ fontSize: 11, color: active ? '#06b6d4' : '#64748b' }}>
          {active ? 'Transfer in progress...' : 'Standby — ready for transfer'}
        </div>
      </div>
    </div>

    {/* Pipeline visualisation */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
      {['Scan', 'Capture', 'Encrypt', 'Transfer', 'IceBox'].map((step, i) => (
        <React.Fragment key={step}>
          <div style={{
            flex: 1, padding: '8px 4px', borderRadius: 8, textAlign: 'center',
            background: active && i <= 2 ? '#06b6d422' : '#1e293b',
            border: `1px solid ${active && i <= 2 ? '#06b6d4' : '#334155'}`,
            fontSize: 10, color: active && i <= 2 ? '#06b6d4' : '#64748b',
            fontWeight: 600,
          }}>
            {step}
          </div>
          {i < 4 && (
            <div style={{
              width: 16, height: 2, background: active && i < 2 ? '#06b6d4' : '#334155',
              flexShrink: 0,
            }} />
          )}
        </React.Fragment>
      ))}
    </div>

    <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
      Quantum-safe encryption • Atomic capture • Instant transfer
    </div>
  </div>
);

// ============================================================
// MAIN DASHBOARD
// ============================================================

const LighthouseDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'threats' | 'icebox' | 'warp'>('overview');

  // Mock data — in production: fetch from Lighthouse worker
  const metrics: Metrics = {
    tokens: { total: 4821, active: 4756, revoked: 65, highRisk: 12 },
    threats: { total: 47, open: 8, critical: 2 },
    warpTunnel: { total: 23, completed: 21 },
    iceBox: { total: 15, quarantined: 3, released: 12 },
  };

  const mockThreats: ThreatEvent[] = [
    {
      threatId: 'THR-001', entityId: 'usr-malicious-001', entityType: 'user',
      type: 'brute_force', severity: 'high', status: 'open',
      title: 'Brute force login attempt detected',
      mitreTactic: 'Credential Access', detectedAt: new Date(Date.now() - 300000).toISOString(),
    },
    {
      threatId: 'THR-002', entityId: 'bot-suspicious-007', entityType: 'bot',
      type: 'data_exfiltration', severity: 'critical', status: 'open',
      title: 'Anomalous data access pattern — possible exfiltration',
      mitreTactic: 'Exfiltration', detectedAt: new Date(Date.now() - 600000).toISOString(),
    },
    {
      threatId: 'THR-003', entityId: 'svc-api-003', entityType: 'service',
      type: 'impossible_travel', severity: 'medium', status: 'investigating',
      title: 'Impossible travel detected — 3 continents in 10 minutes',
      mitreTactic: 'Initial Access', detectedAt: new Date(Date.now() - 900000).toISOString(),
    },
  ];

  const mockTokens: EntityToken[] = [
    { tokenId: 'UET-M8X2K1-A4F9B2C3', entityId: 'usr-admin-001', entityType: 'user', riskScore: 5, riskLevel: 'none', status: 'active', classification: 'INTERNAL', issuedAt: new Date(Date.now() - 86400000).toISOString() },
    { tokenId: 'UET-N9Y3L2-B5G0C3D4', entityId: 'bot-worker-042', entityType: 'bot', riskScore: 15, riskLevel: 'low', status: 'active', classification: 'INTERNAL', issuedAt: new Date(Date.now() - 172800000).toISOString() },
    { tokenId: 'UET-P0Z4M3-C6H1D4E5', entityId: 'agent-ai-007', entityType: 'agent', riskScore: 72, riskLevel: 'high', status: 'suspended', classification: 'CONFIDENTIAL', issuedAt: new Date(Date.now() - 259200000).toISOString() },
    { tokenId: 'UET-Q1A5N4-D7I2E5F6', entityId: 'svc-payment-001', entityType: 'service', riskScore: 8, riskLevel: 'none', status: 'active', classification: 'CLASSIFIED', issuedAt: new Date(Date.now() - 345600000).toISOString() },
  ];

  const mockIceBox: IceBoxEntry[] = [
    { entryId: 'ICE-001', entityId: 'bot-suspicious-007', entityType: 'bot', status: 'quarantined', quarantinedAt: new Date(Date.now() - 600000).toISOString() },
    { entryId: 'ICE-002', entityId: 'usr-malicious-001', entityType: 'user', status: 'released', quarantinedAt: new Date(Date.now() - 86400000).toISOString(), verdict: { decision: 'RELEASE' } },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '🔦' },
    { id: 'tokens', label: 'Tokens', icon: '🔑' },
    { id: 'threats', label: 'Threats', icon: '🚨' },
    { id: 'icebox', label: 'IceBox', icon: '🧊' },
    { id: 'warp', label: 'Warp Tunnel', icon: '⚡' },
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
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1e293b',
        padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 40 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🔦</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>The Lighthouse</div>
              <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '0.1em' }}>TOKEN MANAGEMENT HUB</div>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: activeTab === tab.id ? '#f59e0b' : 'transparent',
                color: activeTab === tab.id ? '#0f172a' : '#94a3b8',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PulseRing colour="#ef4444" size={8} />
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
              {metrics.threats.open} OPEN THREATS
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { label: 'Total Tokens', value: metrics.tokens.total.toLocaleString(), icon: '🔑', colour: '#6366f1', sub: `${metrics.tokens.active} active` },
                { label: 'High Risk Entities', value: metrics.tokens.highRisk, icon: '⚠️', colour: '#ef4444', sub: 'Require attention' },
                { label: 'Open Threats', value: metrics.threats.open, icon: '🚨', colour: '#f97316', sub: `${metrics.threats.critical} critical` },
                { label: 'IceBox Entries', value: metrics.iceBox.total, icon: '🧊', colour: '#3b82f6', sub: `${metrics.iceBox.quarantined} quarantined` },
                { label: 'Warp Transfers', value: metrics.warpTunnel.total, icon: '⚡', colour: '#06b6d4', sub: `${metrics.warpTunnel.completed} completed` },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                  border: '1px solid #334155', borderRadius: 16, padding: 20,
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: stat.colour + '22', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{stat.label}</div>
                    <div style={{ fontSize: 11, color: stat.colour, marginTop: 2 }}>{stat.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <ThreatFeed threats={mockThreats} />
              <IceBoxPanel entries={mockIceBox} />
            </div>
            <WarpTunnelVisualiser active={false} />
          </div>
        )}

        {activeTab === 'tokens' && <TokenTable tokens={mockTokens} />}
        {activeTab === 'threats' && <ThreatFeed threats={mockThreats} />}
        {activeTab === 'icebox' && <IceBoxPanel entries={mockIceBox} />}
        {activeTab === 'warp' && <WarpTunnelVisualiser active={false} />}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default LighthouseDashboard;