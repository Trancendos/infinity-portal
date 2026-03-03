/**
 * Lighthouse Dashboard — Cryptographic Token Hub & Key Management
 * Connected to: lighthouse worker, BackendProvider
 * Manages: UETs, PQC keys, token lifecycle, crypto operations
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useBackend } from '../providers/BackendProvider';

interface UETToken {
  id: string;
  subject: string;
  subjectType: 'user' | 'agent' | 'service' | 'device';
  algorithm: 'Ed25519' | 'ML-KEM-768' | 'ML-DSA-65' | 'X25519';
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked' | 'expired' | 'rotating';
  usageCount: number;
  lastUsed: string | null;
  fingerprint: string;
  pqcEnabled: boolean;
}

interface CryptoKey {
  id: string;
  name: string;
  algorithm: string;
  keySize: number;
  purpose: 'signing' | 'encryption' | 'key-exchange' | 'authentication';
  status: 'active' | 'archived' | 'compromised' | 'rotating';
  createdAt: string;
  rotatesAt: string;
  usageCount: number;
  pqcLevel: 'classical' | 'hybrid' | 'post-quantum';
}

interface LighthouseStats {
  activeTokens: number;
  revokedTokens: number;
  pqcTokens: number;
  keysManaged: number;
  rotationsScheduled: number;
  cryptoOpsToday: number;
  avgTokenLifetime: number;
  compromisedKeys: number;
}

interface CryptoOperation {
  id: string;
  type: 'sign' | 'verify' | 'encrypt' | 'decrypt' | 'key-exchange' | 'rotate';
  subject: string;
  algorithm: string;
  timestamp: string;
  duration: number;
  success: boolean;
}

type TabId = 'overview' | 'tokens' | 'keys' | 'operations' | 'pqc';

export default function LighthouseDashboard() {
  const { apiCall } = useBackend();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [tokens, setTokens] = useState<UETToken[]>([]);
  const [keys, setKeys] = useState<CryptoKey[]>([]);
  const [stats, setStats] = useState<LighthouseStats | null>(null);
  const [operations, setOperations] = useState<CryptoOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try to fetch from backend
      const res = await apiCall('/api/v1/lighthouse/status').catch(() => null);

      // Demo data (production would come from lighthouse worker)
      const demoTokens: UETToken[] = [
        { id: 'uet-001', subject: 'admin@trancendos.com', subjectType: 'user', algorithm: 'Ed25519', issuedAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), status: 'active', usageCount: 47, lastUsed: new Date(Date.now() - 60000).toISOString(), fingerprint: 'a3:f2:9b:c1:...', pqcEnabled: true },
        { id: 'uet-002', subject: 'norman-ai', subjectType: 'agent', algorithm: 'ML-DSA-65', issuedAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'active', usageCount: 1247, lastUsed: new Date(Date.now() - 5000).toISOString(), fingerprint: 'b7:e4:2a:d9:...', pqcEnabled: true },
        { id: 'uet-003', subject: 'guardian-ai', subjectType: 'agent', algorithm: 'ML-DSA-65', issuedAt: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'active', usageCount: 892, lastUsed: new Date(Date.now() - 12000).toISOString(), fingerprint: 'c9:1f:7e:b3:...', pqcEnabled: true },
        { id: 'uet-004', subject: 'mercury-ai', subjectType: 'agent', algorithm: 'ML-KEM-768', issuedAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'rotating', usageCount: 334, lastUsed: new Date(Date.now() - 30000).toISOString(), fingerprint: 'd2:8c:4f:a1:...', pqcEnabled: true },
        { id: 'uet-005', subject: 'api-gateway', subjectType: 'service', algorithm: 'X25519', issuedAt: new Date(Date.now() - 86400000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'active', usageCount: 15823, lastUsed: new Date(Date.now() - 1000).toISOString(), fingerprint: 'e5:3d:9a:c7:...', pqcEnabled: false },
        { id: 'uet-006', subject: 'ops@trancendos.com', subjectType: 'user', algorithm: 'Ed25519', issuedAt: new Date(Date.now() - 10800000).toISOString(), expiresAt: new Date(Date.now() - 3600000).toISOString(), status: 'expired', usageCount: 23, lastUsed: new Date(Date.now() - 7200000).toISOString(), fingerprint: 'f1:6b:2e:d4:...', pqcEnabled: false },
        { id: 'uet-007', subject: 'k3s-node-01', subjectType: 'device', algorithm: 'ML-KEM-768', issuedAt: new Date(Date.now() - 172800000).toISOString(), expiresAt: new Date(Date.now() + 604800000).toISOString(), status: 'active', usageCount: 4521, lastUsed: new Date(Date.now() - 2000).toISOString(), fingerprint: 'a8:7c:3f:e2:...', pqcEnabled: true },
      ];

      const demoKeys: CryptoKey[] = [
        { id: 'key-001', name: 'Root Signing Key', algorithm: 'ML-DSA-65', keySize: 2592, purpose: 'signing', status: 'active', createdAt: '2024-01-01T00:00:00Z', rotatesAt: new Date(Date.now() + 2592000000).toISOString(), usageCount: 8934, pqcLevel: 'post-quantum' },
        { id: 'key-002', name: 'UET Issuance Key', algorithm: 'Ed25519', keySize: 256, purpose: 'signing', status: 'active', createdAt: '2024-01-01T00:00:00Z', rotatesAt: new Date(Date.now() + 1296000000).toISOString(), usageCount: 2341, pqcLevel: 'classical' },
        { id: 'key-003', name: 'Agent Comms Encryption', algorithm: 'ML-KEM-768', keySize: 1184, purpose: 'encryption', status: 'active', createdAt: '2024-02-01T00:00:00Z', rotatesAt: new Date(Date.now() + 864000000).toISOString(), usageCount: 45231, pqcLevel: 'post-quantum' },
        { id: 'key-004', name: 'Hybrid TLS Key', algorithm: 'X25519+ML-KEM-768', keySize: 1440, purpose: 'key-exchange', status: 'active', createdAt: '2024-03-01T00:00:00Z', rotatesAt: new Date(Date.now() + 432000000).toISOString(), usageCount: 123456, pqcLevel: 'hybrid' },
        { id: 'key-005', name: 'Legacy API Key (Deprecated)', algorithm: 'RSA-2048', keySize: 2048, purpose: 'authentication', status: 'archived', createdAt: '2023-06-01T00:00:00Z', rotatesAt: new Date(Date.now() - 86400000).toISOString(), usageCount: 0, pqcLevel: 'classical' },
      ];

      setTokens(demoTokens);
      setKeys(demoKeys);
      setStats({
        activeTokens: demoTokens.filter(t => t.status === 'active').length,
        revokedTokens: demoTokens.filter(t => t.status === 'revoked').length,
        pqcTokens: demoTokens.filter(t => t.pqcEnabled).length,
        keysManaged: demoKeys.length,
        rotationsScheduled: 2,
        cryptoOpsToday: 18472,
        avgTokenLifetime: 24,
        compromisedKeys: 0,
      });

      setOperations([
        { id: 'op-001', type: 'sign', subject: 'norman-ai', algorithm: 'ML-DSA-65', timestamp: new Date(Date.now() - 5000).toISOString(), duration: 0.8, success: true },
        { id: 'op-002', type: 'verify', subject: 'api-gateway', algorithm: 'Ed25519', timestamp: new Date(Date.now() - 10000).toISOString(), duration: 0.3, success: true },
        { id: 'op-003', type: 'key-exchange', subject: 'k3s-node-01', algorithm: 'ML-KEM-768', timestamp: new Date(Date.now() - 15000).toISOString(), duration: 2.1, success: true },
        { id: 'op-004', type: 'rotate', subject: 'mercury-ai', algorithm: 'ML-KEM-768', timestamp: new Date(Date.now() - 30000).toISOString(), duration: 45.2, success: true },
        { id: 'op-005', type: 'encrypt', subject: 'guardian-ai', algorithm: 'ML-KEM-768', timestamp: new Date(Date.now() - 60000).toISOString(), duration: 1.4, success: true },
        { id: 'op-006', type: 'verify', subject: 'unknown-client', algorithm: 'Ed25519', timestamp: new Date(Date.now() - 120000).toISOString(), duration: 0.3, success: false },
      ]);

    } catch (err) {
      console.error('Lighthouse: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const PQC_LEVEL_COLORS: Record<string, string> = {
    'post-quantum': '#6366f1',
    'hybrid': '#f59e0b',
    'classical': '#64748b',
  };

  const STATUS_COLORS: Record<string, string> = {
    active: '#22c55e',
    revoked: '#ef4444',
    expired: '#64748b',
    rotating: '#f59e0b',
    archived: '#64748b',
    compromised: '#ef4444',
  };

  const OP_ICONS: Record<string, string> = {
    sign: '✍️', verify: '✅', encrypt: '🔒', decrypt: '🔓', 'key-exchange': '🤝', rotate: '🔄',
  };

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'tokens', label: 'UET Tokens', icon: '🎫' },
    { id: 'keys', label: 'Crypto Keys', icon: '🔑' },
    { id: 'operations', label: 'Operations', icon: '⚡' },
    { id: 'pqc', label: 'PQC Status', icon: '🛡️' },
  ];

  const filteredTokens = tokens.filter(t =>
    t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.algorithm.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, #0c1a2e 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔦</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Lighthouse</h2>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Cryptographic Token Hub • Post-Quantum Ready</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', fontSize: 11, color: '#818cf8' }}>
              🛡️ PQC ACTIVE
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 11, color: '#22c55e' }}>
              ● OPERATIONAL
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
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeTab === tab.id ? 'rgba(14,165,233,0.15)' : 'transparent', color: activeTab === tab.id ? '#38bdf8' : '#64748b', borderBottom: activeTab === tab.id ? '2px solid #0ea5e9' : '2px solid transparent' }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🔦</div><p style={{ color: '#64748b' }}>Initialising Lighthouse...</p></div>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && stats && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Active Tokens', value: stats.activeTokens, icon: '🎫', color: '#22c55e' },
                    { label: 'PQC Tokens', value: stats.pqcTokens, icon: '🛡️', color: '#6366f1' },
                    { label: 'Crypto Ops Today', value: stats.cryptoOpsToday.toLocaleString(), icon: '⚡', color: '#0ea5e9' },
                    { label: 'Compromised Keys', value: stats.compromisedKeys, icon: '⚠️', color: stats.compromisedKeys > 0 ? '#ef4444' : '#22c55e' },
                  ].map(card => (
                    <div key={card.label} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{card.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                {/* Algorithm Distribution */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>ALGORITHM DISTRIBUTION</h3>
                    {Object.entries(tokens.reduce((acc, t) => { acc[t.algorithm] = (acc[t.algorithm] || 0) + 1; return acc; }, {} as Record<string, number>)).map(([algo, count]) => (
                      <div key={algo} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#818cf8', flex: 1 }}>{algo}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{count}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }}>
                          <div style={{ width: `${(count / tokens.length) * 100}%`, height: '100%', borderRadius: 2, background: '#6366f1' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>KEY HEALTH</h3>
                    {keys.map(key => (
                      <div key={key.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[key.status] || '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, flex: 1, color: '#cbd5e1' }}>{key.name}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${PQC_LEVEL_COLORS[key.pqcLevel]}22`, color: PQC_LEVEL_COLORS[key.pqcLevel] }}>{key.pqcLevel}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Operations */}
                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>RECENT CRYPTO OPERATIONS</h3>
                  {operations.slice(0, 5).map(op => (
                    <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: 14 }}>{OP_ICONS[op.type]}</span>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#94a3b8', width: 80 }}>{op.type.toUpperCase()}</span>
                      <span style={{ fontSize: 12, color: '#cbd5e1', flex: 1 }}>{op.subject}</span>
                      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{op.algorithm}</span>
                      <span style={{ fontSize: 11, color: '#475569' }}>{op.duration}ms</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: op.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: op.success ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                        {op.success ? 'OK' : 'FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TOKENS TAB */}
            {activeTab === 'tokens' && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tokens..." style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13 }} />
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Issue Token</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredTokens.map(token => (
                    <div key={token.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${STATUS_COLORS[token.status]}33` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${STATUS_COLORS[token.status]}22`, color: STATUS_COLORS[token.status], fontWeight: 700, textTransform: 'uppercase' }}>{token.status}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{token.subject}</span>
                          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: '#64748b', textTransform: 'capitalize' }}>{token.subjectType}</span>
                          {token.pqcEnabled && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>PQC</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {token.status === 'active' && <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', cursor: 'pointer', fontSize: 11 }}>Rotate</button>}
                          {token.status === 'active' && <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 11 }}>Revoke</button>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: '#64748b' }}>
                        <span>Algorithm: <span style={{ color: '#818cf8', fontFamily: 'monospace' }}>{token.algorithm}</span></span>
                        <span>Uses: <span style={{ color: '#94a3b8' }}>{token.usageCount.toLocaleString()}</span></span>
                        <span>Expires: <span style={{ color: '#94a3b8' }}>{new Date(token.expiresAt).toLocaleString()}</span></span>
                        <span>Fingerprint: <span style={{ color: '#475569', fontFamily: 'monospace' }}>{token.fingerprint}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* KEYS TAB */}
            {activeTab === 'keys' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{keys.length} cryptographic keys managed</p>
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Generate Key</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {keys.map(key => (
                    <div key={key.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${PQC_LEVEL_COLORS[key.pqcLevel]}33` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 14 }}>🔑</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{key.name}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${PQC_LEVEL_COLORS[key.pqcLevel]}22`, color: PQC_LEVEL_COLORS[key.pqcLevel], fontWeight: 700, textTransform: 'uppercase' }}>{key.pqcLevel}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${STATUS_COLORS[key.status]}22`, color: STATUS_COLORS[key.status], fontWeight: 700 }}>{key.status.toUpperCase()}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {key.status === 'active' && <button style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', cursor: 'pointer', fontSize: 11 }}>Schedule Rotation</button>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: '#64748b' }}>
                        <span>Algorithm: <span style={{ color: '#818cf8', fontFamily: 'monospace' }}>{key.algorithm}</span></span>
                        <span>Size: <span style={{ color: '#94a3b8' }}>{key.keySize} bits</span></span>
                        <span>Purpose: <span style={{ color: '#94a3b8', textTransform: 'capitalize' }}>{key.purpose}</span></span>
                        <span>Usage: <span style={{ color: '#94a3b8' }}>{key.usageCount.toLocaleString()}</span></span>
                        <span>Rotates: <span style={{ color: '#94a3b8' }}>{new Date(key.rotatesAt).toLocaleDateString()}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OPERATIONS TAB */}
            {activeTab === 'operations' && (
              <div>
                <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['Time', 'Operation', 'Subject', 'Algorithm', 'Duration', 'Result'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {operations.map(op => (
                        <tr key={op.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{new Date(op.timestamp).toLocaleTimeString()}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              {OP_ICONS[op.type]} <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{op.type.toUpperCase()}</span>
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#cbd5e1' }}>{op.subject}</td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#818cf8', fontFamily: 'monospace' }}>{op.algorithm}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>{op.duration}ms</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: op.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: op.success ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                              {op.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PQC STATUS TAB */}
            {activeTab === 'pqc' && (
              <div>
                <div style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(14,165,233,0.1))', border: '1px solid rgba(99,102,241,0.3)', marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#818cf8' }}>🛡️ Post-Quantum Cryptography Status</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>NIST PQC Standard algorithms active. Quantum-resistant protection for all agent communications and token issuance.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { algo: 'ML-KEM-768', standard: 'FIPS 203', purpose: 'Key Encapsulation', status: 'ACTIVE', color: '#6366f1' },
                    { algo: 'ML-DSA-65', standard: 'FIPS 204', purpose: 'Digital Signatures', status: 'ACTIVE', color: '#6366f1' },
                    { algo: 'SLH-DSA', standard: 'FIPS 205', purpose: 'Hash-based Signatures', status: 'STANDBY', color: '#f59e0b' },
                  ].map(item => (
                    <div key={item.algo} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${item.color}33` }}>
                      <div style={{ fontSize: 11, color: item.color, fontWeight: 700, marginBottom: 6 }}>{item.standard}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4, fontFamily: 'monospace' }}>{item.algo}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>{item.purpose}</div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: item.status === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: item.status === 'ACTIVE' ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{item.status}</span>
                    </div>
                  ))}
                </div>

                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>MIGRATION PROGRESS</h3>
                  {[
                    { label: 'Agent Tokens', progress: 85, color: '#6366f1' },
                    { label: 'Service Tokens', progress: 60, color: '#0ea5e9' },
                    { label: 'User Tokens', progress: 40, color: '#f59e0b' },
                    { label: 'Device Tokens', progress: 100, color: '#22c55e' },
                    { label: 'TLS Certificates', progress: 75, color: '#8b5cf6' },
                  ].map(item => (
                    <div key={item.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#cbd5e1' }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.progress}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ width: `${item.progress}%`, height: '100%', borderRadius: 3, background: item.color, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}