/**
 * Void Dashboard
 * Secure Secret Store Interface — The Void
 */

import React, { useState } from 'react';

// ============================================================
// TYPES
// ============================================================

interface SecretMeta {
  secretId: string;
  name: string;
  type: string;
  classification: string;
  status: string;
  version: number;
  path: string;
  tags: string[];
  expiresAt?: string;
  lastAccessedAt?: string;
  createdAt: string;
  sensitivityScore: number;
}

interface VaultStatus {
  sealed: boolean;
  shamirThreshold: number;
  shamirTotal: number;
  shardsProvided: number;
  shardsRemaining: number;
  progress: number;
}

interface VoidMetrics {
  totalSecrets: number;
  active: number;
  shredded: number;
  quarantined: number;
  expiringIn7Days: number;
  expiringIn30Days: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const CLASSIFICATION_CONFIG: Record<string, { colour: string; icon: string; label: string }> = {
  INTERNAL:     { colour: '#3b82f6', icon: '🏢', label: 'Internal' },
  CONFIDENTIAL: { colour: '#f59e0b', icon: '🔒', label: 'Confidential' },
  CLASSIFIED:   { colour: '#f97316', icon: '🔐', label: 'Classified' },
  VOID:         { colour: '#8b5cf6', icon: '🌑', label: 'Void' },
  QUANTUM:      { colour: '#ec4899', icon: '⚛️', label: 'Quantum' },
};

const SECRET_TYPE_ICONS: Record<string, string> = {
  PRIVATE_KEY: '🔑', SYMMETRIC_KEY: '🗝️', SIGNING_KEY: '✍️',
  API_KEY: '🔌', OAUTH_SECRET: '🔓', DATABASE_URL: '🗄️',
  MASTER_KEY: '👑', SHAMIR_SHARD: '🧩', QUANTUM_KEY: '⚛️',
  PAYMENT_KEY: '💳', BANK_CREDENTIAL: '🏦', TOTP_SEED: '📱',
  NEURAL_BINDING: '🧠', CERTIFICATE: '📜', WEBHOOK_SECRET: '🪝',
};

// ============================================================
// VAULT SEAL STATUS
// ============================================================

const VaultSealPanel: React.FC<{ status: VaultStatus; onUnseal: (shard: string) => void }> = ({
  status, onUnseal,
}) => {
  const [shardInput, setShardInput] = useState('');

  if (!status.sealed) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #052e16, #14532d)',
        border: '1px solid #16a34a', borderRadius: 16, padding: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#22c55e22', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 24,
        }}>🔓</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>Vault UNSEALED</div>
          <div style={{ fontSize: 12, color: '#86efac', marginTop: 4 }}>
            All secrets accessible • Master key active • {status.shamirThreshold}-of-{status.shamirTotal} Shamir SSS
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Encryption</div>
          <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>ML-KEM-1024</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
      border: '1px solid #6366f1', borderRadius: 16, padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: '#6366f122', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 28,
        }}>🔒</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Vault SEALED</div>
          <div style={{ fontSize: 12, color: '#a5b4fc', marginTop: 4 }}>
            Provide {status.shardsRemaining} more Shamir shard{status.shardsRemaining !== 1 ? 's' : ''} to unseal
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1' }}>{status.progress}%</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {status.shardsProvided}/{status.shamirThreshold} shards
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 8, borderRadius: 4, background: '#1e1b4b', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            width: `${status.progress}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          {Array.from({ length: status.shamirThreshold }, (_, i) => (
            <div key={i} style={{
              width: 20, height: 20, borderRadius: 4,
              background: i < status.shardsProvided ? '#6366f1' : '#1e1b4b',
              border: `1px solid ${i < status.shardsProvided ? '#6366f1' : '#334155'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: i < status.shardsProvided ? 'white' : '#64748b',
            }}>
              {i < status.shardsProvided ? '✓' : i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Shard input */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="password"
          placeholder="Enter Shamir shard..."
          value={shardInput}
          onChange={(e) => setShardInput(e.target.value)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: '#0f172a', border: '1px solid #334155',
            color: '#f1f5f9', fontSize: 13, fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        <button
          onClick={() => { onUnseal(shardInput); setShardInput(''); }}
          disabled={!shardInput}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: shardInput ? '#6366f1' : '#334155',
            color: shardInput ? 'white' : '#64748b',
            cursor: shardInput ? 'pointer' : 'not-allowed',
            fontSize: 13, fontWeight: 600,
          }}
        >
          Provide Shard
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        🧩 Shamir's Secret Sharing ({status.shamirThreshold}-of-{status.shamirTotal}) •
        Post-Quantum ML-KEM-1024 • Zero-Knowledge Proofs
      </div>
    </div>
  );
};

// ============================================================
// SECRET CARD
// ============================================================

const SecretCard: React.FC<{ secret: SecretMeta; onRetrieve: (id: string) => void; onRotate: (id: string) => void }> = ({
  secret, onRetrieve, onRotate,
}) => {
  const cls = CLASSIFICATION_CONFIG[secret.classification] ?? CLASSIFICATION_CONFIG.INTERNAL;
  const typeIcon = SECRET_TYPE_ICONS[secret.type] ?? '🔐';
  const daysUntilExpiry = secret.expiresAt
    ? Math.floor((new Date(secret.expiresAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      border: `1px solid ${cls.colour}33`,
      borderRadius: 14, padding: 16,
      transition: 'all 0.2s',
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = cls.colour + '66';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = cls.colour + '33';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cls.colour + '22', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>{typeIcon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 }}>
            {secret.name}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
            {secret.path}
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: '2px 8px', borderRadius: 4,
          background: cls.colour + '22', color: cls.colour,
          fontWeight: 600, flexShrink: 0,
        }}>
          {cls.icon} {cls.label}
        </span>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: '#64748b' }}>v{secret.version}</span>
        <span style={{ fontSize: 10, color: '#64748b' }}>•</span>
        <span style={{ fontSize: 10, color: '#64748b' }}>{secret.type.replace(/_/g, ' ')}</span>
        {daysUntilExpiry !== null && (
          <>
            <span style={{ fontSize: 10, color: '#64748b' }}>•</span>
            <span style={{
              fontSize: 10,
              color: daysUntilExpiry <= 7 ? '#ef4444' : daysUntilExpiry <= 30 ? '#f59e0b' : '#64748b',
            }}>
              {daysUntilExpiry <= 0 ? 'EXPIRED' : `expires in ${daysUntilExpiry}d`}
            </span>
          </>
        )}
      </div>

      {/* Sensitivity bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: '#64748b' }}>Sensitivity</span>
          <span style={{ fontSize: 9, color: cls.colour, fontWeight: 600 }}>{secret.sensitivityScore}/100</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: cls.colour,
            width: `${secret.sensitivityScore}%`,
          }} />
        </div>
      </div>

      {/* Tags */}
      {secret.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {secret.tags.map((tag) => (
            <span key={tag} style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: '#334155', color: '#94a3b8',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onRetrieve(secret.secretId)}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
            background: cls.colour + '22', color: cls.colour,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          🔓 Retrieve
        </button>
        <button
          onClick={() => onRotate(secret.secretId)}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
            background: '#334155', color: '#94a3b8',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          🔄 Rotate
        </button>
      </div>
    </div>
  );
};

// ============================================================
// STORE SECRET MODAL
// ============================================================

const StoreSecretModal: React.FC<{ onClose: () => void; onStore: (data: Record<string, string>) => void }> = ({
  onClose, onStore,
}) => {
  const [form, setForm] = useState({
    name: '', type: 'API_KEY', classification: 'INTERNAL',
    plaintext: '', path: '', tags: '', reason: '',
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    background: '#0f172a', border: '1px solid #334155',
    color: '#f1f5f9', fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        border: '1px solid #334155', borderRadius: 20,
        padding: 28, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
              🌑 Store Secret in The Void
            </h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Quantum-safe encryption • Zero-knowledge proof binding
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: 20, padding: 4,
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Secret Name *</label>
            <input style={inputStyle} placeholder="e.g. Production Database URL"
              value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.type} onChange={(e) => update('type', e.target.value)}>
                {Object.keys(SECRET_TYPE_ICONS).map((t) => (
                  <option key={t} value={t}>{SECRET_TYPE_ICONS[t]} {t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Classification *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.classification} onChange={(e) => update('classification', e.target.value)}>
                {Object.entries(CLASSIFICATION_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Secret Value *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'monospace' }}
              placeholder="Enter secret value..."
              value={form.plaintext}
              onChange={(e) => update('plaintext', e.target.value)}
            />
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
              🔒 Encrypted with {CLASSIFICATION_CONFIG[form.classification]?.colour ? form.classification === 'VOID' ? 'ML-KEM-1024' : form.classification === 'CLASSIFIED' ? 'Hybrid-X25519-MLKEM' : 'AES-256-GCM' : 'AES-256-GCM'} before storage
            </div>
          </div>

          <div>
            <label style={labelStyle}>Path *</label>
            <input style={inputStyle} placeholder="e.g. platform/database/primary"
              value={form.path} onChange={(e) => update('path', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input style={inputStyle} placeholder="e.g. production, database, critical"
              value={form.tags} onChange={(e) => update('tags', e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Reason for storing</label>
            <input style={inputStyle} placeholder="Why is this secret being stored?"
              value={form.reason} onChange={(e) => update('reason', e.target.value)} />
          </div>

          {/* Classification warning */}
          {(form.classification === 'VOID' || form.classification === 'CLASSIFIED') && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: '#7c3aed22', border: '1px solid #7c3aed',
              fontSize: 12, color: '#c4b5fd',
            }}>
              ⚠️ <strong>{form.classification}</strong> secrets require MFA verification for retrieval
              {form.classification === 'VOID' && ' and hardware key signature'}.
              Shamir's Secret Sharing (5-of-9) will be applied.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #334155',
              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
            }}>Cancel</button>
            <button
              onClick={() => onStore(form)}
              disabled={!form.name || !form.plaintext || !form.path}
              style={{
                flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
                background: form.name && form.plaintext && form.path ? '#8b5cf6' : '#334155',
                color: form.name && form.plaintext && form.path ? 'white' : '#64748b',
                cursor: form.name && form.plaintext && form.path ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 600,
              }}
            >
              🌑 Store in The Void
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN DASHBOARD
// ============================================================

const VoidDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'secrets' | 'vault' | 'audit' | 'shamir'>('secrets');
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({
    sealed: false,
    shamirThreshold: 5,
    shamirTotal: 9,
    shardsProvided: 5,
    shardsRemaining: 0,
    progress: 100,
  });

  const mockSecrets: SecretMeta[] = [
    { secretId: 'SEC-001', name: 'Production Database URL', type: 'DATABASE_URL', classification: 'CLASSIFIED', status: 'ACTIVE', version: 3, path: 'platform/database/primary', tags: ['production', 'database'], expiresAt: new Date(Date.now() + 45 * 86400000).toISOString(), lastAccessedAt: new Date(Date.now() - 3600000).toISOString(), createdAt: new Date(Date.now() - 86400000 * 90).toISOString(), sensitivityScore: 90 },
    { secretId: 'SEC-002', name: 'Platform Master Signing Key', type: 'SIGNING_KEY', classification: 'VOID', status: 'ACTIVE', version: 1, path: 'platform/crypto/signing', tags: ['crypto', 'jwt', 'critical'], createdAt: new Date(Date.now() - 86400000 * 180).toISOString(), sensitivityScore: 100 },
    { secretId: 'SEC-003', name: 'Stripe Payment API Key', type: 'PAYMENT_KEY', classification: 'CLASSIFIED', status: 'ACTIVE', version: 2, path: 'platform/payments/stripe', tags: ['payments', 'stripe'], expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), createdAt: new Date(Date.now() - 86400000 * 60).toISOString(), sensitivityScore: 95 },
    { secretId: 'SEC-004', name: 'Cloudflare API Token', type: 'API_KEY', classification: 'CONFIDENTIAL', status: 'ACTIVE', version: 4, path: 'infrastructure/cloudflare/api', tags: ['cloudflare', 'infrastructure'], createdAt: new Date(Date.now() - 86400000 * 30).toISOString(), sensitivityScore: 75 },
    { secretId: 'SEC-005', name: 'Supabase Service Key', type: 'API_KEY', classification: 'CONFIDENTIAL', status: 'ACTIVE', version: 2, path: 'infrastructure/supabase/service', tags: ['supabase', 'database'], createdAt: new Date(Date.now() - 86400000 * 45).toISOString(), sensitivityScore: 80 },
    { secretId: 'SEC-006', name: 'Quantum Entangled Key Pair', type: 'QUANTUM_KEY', classification: 'VOID', status: 'ACTIVE', version: 1, path: 'platform/quantum/keypair-alpha', tags: ['quantum', '2060', 'experimental'], createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), sensitivityScore: 100 },
  ];

  const metrics: VoidMetrics = {
    totalSecrets: mockSecrets.length,
    active: mockSecrets.filter((s) => s.status === 'ACTIVE').length,
    shredded: 3,
    quarantined: 0,
    expiringIn7Days: mockSecrets.filter((s) => s.expiresAt && Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 86400000) <= 7).length,
    expiringIn30Days: mockSecrets.filter((s) => s.expiresAt && Math.floor((new Date(s.expiresAt).getTime() - Date.now()) / 86400000) <= 30).length,
  };

  const handleUnseal = (shard: string) => {
    setVaultStatus((prev) => {
      const newProvided = prev.shardsProvided + 1;
      const newRemaining = Math.max(0, prev.shamirThreshold - newProvided);
      const newProgress = Math.round((newProvided / prev.shamirThreshold) * 100);
      return {
        ...prev,
        shardsProvided: newProvided,
        shardsRemaining: newRemaining,
        progress: newProgress,
        sealed: newProvided < prev.shamirThreshold,
      };
    });
  };

  const tabs = [
    { id: 'secrets', label: 'Secrets', icon: '🔐' },
    { id: 'vault', label: 'Vault', icon: '🌑' },
    { id: 'audit', label: 'Audit Chain', icon: '📋' },
    { id: 'shamir', label: "Shamir's SSS", icon: '🧩' },
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
        background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1e293b', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 40 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🌑</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>The Void</div>
              <div style={{ fontSize: 10, color: '#8b5cf6', letterSpacing: '0.1em' }}>SECURE SECRET STORE</div>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: activeTab === tab.id ? '#8b5cf6' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#94a3b8',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: vaultStatus.sealed ? '#ef444422' : '#22c55e22',
              border: `1px solid ${vaultStatus.sealed ? '#ef4444' : '#22c55e'}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: vaultStatus.sealed ? '#ef4444' : '#22c55e',
              }} />
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: vaultStatus.sealed ? '#ef4444' : '#22c55e',
              }}>
                {vaultStatus.sealed ? 'SEALED' : 'UNSEALED'}
              </span>
            </div>
            <button
              onClick={() => setShowStoreModal(true)}
              disabled={vaultStatus.sealed}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: vaultStatus.sealed ? '#334155' : '#8b5cf6',
                color: vaultStatus.sealed ? '#64748b' : 'white',
                cursor: vaultStatus.sealed ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              + Store Secret
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'secrets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Vault status */}
            <VaultSealPanel status={vaultStatus} onUnseal={handleUnseal} />

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {[
                { label: 'Total Secrets', value: metrics.totalSecrets, icon: '🔐', colour: '#8b5cf6' },
                { label: 'Active', value: metrics.active, icon: '✅', colour: '#22c55e' },
                { label: 'Shredded', value: metrics.shredded, icon: '🔥', colour: '#64748b' },
                { label: 'Expiring (7d)', value: metrics.expiringIn7Days, icon: '⏰', colour: '#ef4444' },
                { label: 'Expiring (30d)', value: metrics.expiringIn30Days, icon: '📅', colour: '#f59e0b' },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                  border: '1px solid #334155', borderRadius: 14, padding: 16,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: stat.colour + '22', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Secrets grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {mockSecrets.map((secret) => (
                <SecretCard
                  key={secret.secretId}
                  secret={secret}
                  onRetrieve={(id) => console.log('Retrieve:', id)}
                  onRotate={(id) => console.log('Rotate:', id)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <VaultSealPanel status={vaultStatus} onUnseal={handleUnseal} />
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              border: '1px solid #334155', borderRadius: 16, padding: 24,
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
                🔐 Encryption Algorithms by Classification
              </h3>
              {Object.entries(CLASSIFICATION_CONFIG).map(([cls, config]) => (
                <div key={cls} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 0', borderBottom: '1px solid #1e293b',
                }}>
                  <span style={{ fontSize: 20 }}>{config.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: config.colour }}>{cls}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {cls === 'VOID' ? 'ML-KEM-1024 (Post-Quantum)' :
                       cls === 'CLASSIFIED' ? 'Hybrid X25519 + ML-KEM-1024' :
                       cls === 'CONFIDENTIAL' ? 'ChaCha20-Poly1305' :
                       cls === 'QUANTUM' ? 'SLH-DSA-256 (SPHINCS+)' :
                       'AES-256-GCM'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: '3px 10px', borderRadius: 6,
                    background: config.colour + '22', color: config.colour, fontWeight: 600,
                  }}>
                    {cls === 'VOID' || cls === 'QUANTUM' ? 'Post-Quantum' : 'Standard'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'shamir' && (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid #334155', borderRadius: 16, padding: 24,
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
              🧩 Shamir's Secret Sharing — 5-of-9 Configuration
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
              The Void master key is split into 9 shards using Shamir's Secret Sharing.
              Any 5 shards are sufficient to reconstruct the key and unseal the vault.
              Shards are geo-distributed across HSMs, Cloudflare KV, Supabase, and offline cold storage.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { index: 1, holder: 'HSM Primary', type: 'hsm', region: 'eu-west-1', confirmed: true },
                { index: 2, holder: 'Cloudflare KV', type: 'cloudflare_kv', region: 'global', confirmed: true },
                { index: 3, holder: 'Supabase DB', type: 'supabase', region: 'eu-west-1', confirmed: true },
                { index: 4, holder: 'Offline Cold', type: 'offline', region: 'eu-central-1', confirmed: true },
                { index: 5, holder: 'HSM Secondary', type: 'hsm', region: 'us-east-1', confirmed: true },
                { index: 6, holder: 'Cloudflare KV 2', type: 'cloudflare_kv', region: 'us-east-1', confirmed: false },
                { index: 7, holder: 'Offline Cold 2', type: 'offline', region: 'ap-southeast-1', confirmed: false },
                { index: 8, holder: 'Supabase DB 2', type: 'supabase', region: 'ap-southeast-1', confirmed: false },
                { index: 9, holder: 'Offline DR', type: 'offline', region: 'sa-east-1', confirmed: false },
              ].map((shard) => (
                <div key={shard.index} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: shard.confirmed ? '#22c55e11' : '#1e293b',
                  border: `1px solid ${shard.confirmed ? '#22c55e44' : '#334155'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: shard.confirmed ? '#22c55e22' : '#334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      color: shard.confirmed ? '#22c55e' : '#64748b',
                    }}>
                      {shard.index}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{shard.holder}</div>
                    {shard.confirmed && <span style={{ marginLeft: 'auto', fontSize: 14 }}>✅</span>}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    {shard.type.replace(/_/g, ' ')} • {shard.region}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 20, padding: '14px 16px', borderRadius: 12,
              background: '#8b5cf622', border: '1px solid #8b5cf6',
              fontSize: 12, color: '#c4b5fd',
            }}>
              🧩 <strong>5 confirmed</strong> • 4 pending distribution •
              Threshold: 5-of-9 • Algorithm: Shamir's Secret Sharing (GF(2^8)) •
              Geo-distributed across 6 regions
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid #334155', borderRadius: 16, padding: 24,
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>
              📋 Immutable Audit Chain
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
              Every secret operation is recorded in a tamper-evident hash chain.
              Each entry includes the hash of the previous entry, making retroactive modification detectable.
            </p>
            {[
              { action: 'READ', secret: 'Production Database URL', principal: 'admin@trancendos.com', result: 'success', time: new Date(Date.now() - 3600000).toISOString(), isBreakGlass: false },
              { action: 'ROTATE', secret: 'Stripe Payment API Key', principal: 'system:auto-rotation', result: 'success', time: new Date(Date.now() - 7200000).toISOString(), isBreakGlass: false },
              { action: 'CREATE', secret: 'Quantum Entangled Key Pair', principal: 'admin@trancendos.com', result: 'success', time: new Date(Date.now() - 86400000).toISOString(), isBreakGlass: false },
              { action: 'ACCESS_DENIED', secret: 'Platform Master Signing Key', principal: 'user@example.com', result: 'denied', time: new Date(Date.now() - 172800000).toISOString(), isBreakGlass: false },
              { action: 'BREAK_GLASS', secret: 'Production Database URL', principal: 'admin@trancendos.com', result: 'success', time: new Date(Date.now() - 259200000).toISOString(), isBreakGlass: true },
            ].map((entry, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 0', borderBottom: '1px solid #1e293b',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: entry.result === 'success' ? '#22c55e22' : entry.result === 'denied' ? '#ef444422' : '#f59e0b22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                }}>
                  {entry.result === 'success' ? '✅' : entry.result === 'denied' ? '🚫' : '⚠️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: '#334155', color: '#94a3b8', fontWeight: 600,
                    }}>{entry.action}</span>
                    <span style={{ fontSize: 13, color: '#f1f5f9' }}>{entry.secret}</span>
                    {entry.isBreakGlass && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: '#ef444422', color: '#ef4444',
                      }}>BREAK-GLASS</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {entry.principal} • {new Date(entry.time).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace', flexShrink: 0 }}>
                  #{(Math.abs(entry.action.charCodeAt(0) * 31 + i * 17)).toString(16).padStart(8, '0')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showStoreModal && (
        <StoreSecretModal
          onClose={() => setShowStoreModal(false)}
          onStore={(data) => { console.log('Storing secret:', data); setShowStoreModal(false); }}
        />
      )}
    </div>
  );
};

export default VoidDashboard;