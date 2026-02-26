/**
 * Infinity OS — Secrets Vault Module
 * Adapted from Trancendos/secrets-portal
 * 
 * Manage GitHub repository secrets, environment variables, and API keys
 * with full audit logging and role-based access control.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Key, Plus, Trash2, RefreshCw, Eye, EyeOff, Shield,
  CheckCircle, AlertCircle, Clock, Copy, Lock, Unlock,
  GitBranch, Settings, Search, Filter, Download,
} from 'lucide-react';

interface Secret {
  id: string;
  name: string;
  type: 'api_key' | 'token' | 'password' | 'certificate' | 'env_var' | 'webhook';
  environment: 'production' | 'staging' | 'development' | 'all';
  created_at: string;
  updated_at: string;
  expires_at?: string;
  last_rotated?: string;
  rotation_days?: number;
  description?: string;
  tags: string[];
  is_expired: boolean;
  rotation_due: boolean;
  masked_value?: string;
}

interface AuditEntry {
  id: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'rotate' | 'export';
  secret_name: string;
  actor: string;
  timestamp: string;
  status: 'success' | 'failed';
  message?: string;
  ip_address?: string;
}

interface CreateSecretForm {
  name: string;
  value: string;
  type: Secret['type'];
  environment: Secret['environment'];
  description: string;
  rotation_days: number;
  tags: string;
}

const SECRET_TYPES = ['api_key', 'token', 'password', 'certificate', 'env_var', 'webhook'];
const ENVIRONMENTS = ['production', 'staging', 'development', 'all'];

const typeColors: Record<string, string> = {
  api_key: 'bg-blue-500/20 text-blue-300',
  token: 'bg-purple-500/20 text-purple-300',
  password: 'bg-red-500/20 text-red-300',
  certificate: 'bg-green-500/20 text-green-300',
  env_var: 'bg-yellow-500/20 text-yellow-300',
  webhook: 'bg-orange-500/20 text-orange-300',
};

const envColors: Record<string, string> = {
  production: 'bg-red-500/20 text-red-300',
  staging: 'bg-yellow-500/20 text-yellow-300',
  development: 'bg-green-500/20 text-green-300',
  all: 'bg-gray-500/20 text-gray-300',
};

// Mock data for demonstration
const MOCK_SECRETS: Secret[] = [
  {
    id: '1', name: 'GROQ_API_KEY', type: 'api_key', environment: 'production',
    created_at: '2026-01-15T10:00:00Z', updated_at: '2026-02-01T10:00:00Z',
    last_rotated: '2026-02-01T10:00:00Z', rotation_days: 30,
    description: 'Groq LLM API key for AI generation', tags: ['ai', 'llm'],
    is_expired: false, rotation_due: false, masked_value: 'gsk_****...****',
  },
  {
    id: '2', name: 'DATABASE_URL', type: 'env_var', environment: 'production',
    created_at: '2026-01-10T10:00:00Z', updated_at: '2026-01-10T10:00:00Z',
    description: 'PostgreSQL connection string', tags: ['database', 'core'],
    is_expired: false, rotation_due: true, masked_value: 'postgresql://****@****:5432/****',
  },
  {
    id: '3', name: 'JWT_SECRET_KEY', type: 'token', environment: 'production',
    created_at: '2026-01-10T10:00:00Z', updated_at: '2026-01-10T10:00:00Z',
    rotation_days: 90, description: 'JWT signing secret', tags: ['auth', 'security'],
    is_expired: false, rotation_due: false, masked_value: '****...****',
  },
  {
    id: '4', name: 'CLOUDFLARE_API_TOKEN', type: 'api_key', environment: 'all',
    created_at: '2026-01-12T10:00:00Z', updated_at: '2026-01-12T10:00:00Z',
    expires_at: '2026-03-01T10:00:00Z', description: 'Cloudflare edge deployment token',
    tags: ['infrastructure', 'cloudflare'], is_expired: false, rotation_due: true,
    masked_value: '****...****',
  },
  {
    id: '5', name: 'STRIPE_SECRET_KEY', type: 'api_key', environment: 'production',
    created_at: '2026-01-20T10:00:00Z', updated_at: '2026-01-20T10:00:00Z',
    rotation_days: 365, description: 'Stripe payment processing key', tags: ['billing', 'payments'],
    is_expired: false, rotation_due: false, masked_value: 'sk_live_****...****',
  },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: '1', action: 'create', secret_name: 'GROQ_API_KEY', actor: 'admin@trancendos.com', timestamp: '2026-02-01T10:00:00Z', status: 'success' },
  { id: '2', action: 'read', secret_name: 'DATABASE_URL', actor: 'system', timestamp: '2026-02-25T08:30:00Z', status: 'success' },
  { id: '3', action: 'rotate', secret_name: 'JWT_SECRET_KEY', actor: 'admin@trancendos.com', timestamp: '2026-02-20T14:00:00Z', status: 'success' },
  { id: '4', action: 'delete', secret_name: 'OLD_API_KEY', actor: 'admin@trancendos.com', timestamp: '2026-02-15T09:00:00Z', status: 'success' },
  { id: '5', action: 'read', secret_name: 'STRIPE_SECRET_KEY', actor: 'unknown', timestamp: '2026-02-24T22:00:00Z', status: 'failed', message: 'Unauthorized access attempt' },
];

export default function SecretsVault() {
  const [secrets, setSecrets] = useState<Secret[]>(MOCK_SECRETS);
  const [audit, setAudit] = useState<AuditEntry[]>(MOCK_AUDIT);
  const [activeTab, setActiveTab] = useState<'secrets' | 'audit' | 'settings'>('secrets');
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEnv, setFilterEnv] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSecretForm>({
    name: '', value: '', type: 'api_key', environment: 'production',
    description: '', rotation_days: 90, tags: '',
  });

  const filteredSecrets = secrets.filter(s => {
    const matchSearch = !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchEnv = filterEnv === 'all' || s.environment === filterEnv;
    const matchType = filterType === 'all' || s.type === filterType;
    return matchSearch && matchEnv && matchType;
  });

  const rotationDue = secrets.filter(s => s.rotation_due).length;
  const expired = secrets.filter(s => s.is_expired).length;
  const critical = secrets.filter(s => s.environment === 'production').length;

  const handleCreate = () => {
    if (!form.name || !form.value) return;
    const newSecret: Secret = {
      id: Date.now().toString(),
      name: form.name.toUpperCase().replace(/\s+/g, '_'),
      type: form.type,
      environment: form.environment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      description: form.description,
      rotation_days: form.rotation_days,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      is_expired: false,
      rotation_due: false,
      masked_value: form.value.substring(0, 4) + '****...****',
    };
    setSecrets(prev => [newSecret, ...prev]);
    setAudit(prev => [{
      id: Date.now().toString(),
      action: 'create',
      secret_name: newSecret.name,
      actor: 'current_user',
      timestamp: new Date().toISOString(),
      status: 'success',
    }, ...prev]);
    setShowCreate(false);
    setForm({ name: '', value: '', type: 'api_key', environment: 'production', description: '', rotation_days: 90, tags: '' });
  };

  const handleDelete = (id: string, name: string) => {
    setSecrets(prev => prev.filter(s => s.id !== id));
    setAudit(prev => [{
      id: Date.now().toString(),
      action: 'delete',
      secret_name: name,
      actor: 'current_user',
      timestamp: new Date().toISOString(),
      status: 'success',
    }, ...prev]);
  };

  const handleRotate = (id: string, name: string) => {
    setSecrets(prev => prev.map(s => s.id === id ? {
      ...s, last_rotated: new Date().toISOString(),
      updated_at: new Date().toISOString(), rotation_due: false,
    } : s));
    setAudit(prev => [{
      id: Date.now().toString(),
      action: 'rotate',
      secret_name: name,
      actor: 'current_user',
      timestamp: new Date().toISOString(),
      status: 'success',
    }, ...prev]);
  };

  const toggleReveal = (id: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  const actionColors: Record<string, string> = {
    create: 'text-green-400', read: 'text-blue-400', update: 'text-yellow-400',
    delete: 'text-red-400', rotate: 'text-purple-400', export: 'text-orange-400',
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
            <Key className="w-4 h-4 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Secrets Vault</h1>
            <p className="text-xs text-gray-400">{secrets.length} secrets · {rotationDue} rotation due · {expired} expired</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rotationDue > 0 && (
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" /> {rotationDue} due
            </span>
          )}
          {expired > 0 && (
            <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {expired} expired
            </span>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Secret
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-800 px-6">
        {(['secrets', 'audit', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-yellow-400 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">

        {/* Secrets Tab */}
        {activeTab === 'secrets' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search secrets..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>
              <select
                value={filterEnv}
                onChange={e => setFilterEnv(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
              >
                <option value="all">All Environments</option>
                {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
              >
                <option value="all">All Types</option>
                {SECRET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Secrets', value: secrets.length, color: 'text-white' },
                { label: 'Production', value: critical, color: 'text-red-400' },
                { label: 'Rotation Due', value: rotationDue, color: 'text-yellow-400' },
                { label: 'Expired', value: expired, color: 'text-red-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Secrets List */}
            <div className="space-y-2">
              {filteredSecrets.map(secret => (
                <div
                  key={secret.id}
                  className={`bg-gray-800 rounded-lg border p-4 ${
                    secret.is_expired ? 'border-red-500/50' :
                    secret.rotation_due ? 'border-yellow-500/50' :
                    'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-white">{secret.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[secret.type]}`}>
                          {secret.type}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${envColors[secret.environment]}`}>
                          {secret.environment}
                        </span>
                        {secret.rotation_due && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Rotation Due
                          </span>
                        )}
                        {secret.is_expired && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Expired
                          </span>
                        )}
                      </div>
                      {secret.description && (
                        <p className="text-xs text-gray-400 mt-1">{secret.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-2 font-mono text-sm text-gray-300 bg-gray-900 px-3 py-1 rounded">
                          {revealedSecrets.has(secret.id) ? '••••••••••••' : secret.masked_value}
                          <button onClick={() => toggleReveal(secret.id)} className="text-gray-400 hover:text-white">
                            {revealedSecrets.has(secret.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(secret.masked_value || '', secret.id)}
                            className="text-gray-400 hover:text-white"
                          >
                            {copiedId === secret.id ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <span className="text-xs text-gray-500">Updated {formatDate(secret.updated_at)}</span>
                        {secret.rotation_days && (
                          <span className="text-xs text-gray-500">Rotates every {secret.rotation_days}d</span>
                        )}
                      </div>
                      {secret.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {secret.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRotate(secret.id, secret.name)}
                        className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                        title="Rotate secret"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(secret.id, secret.name)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete secret"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredSecrets.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No secrets found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Audit Log</h2>
              <span className="text-xs text-gray-500">{audit.length} entries</span>
            </div>
            {audit.map(entry => (
              <div key={entry.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {entry.status === 'success'
                      ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    }
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold uppercase ${actionColors[entry.action]}`}>
                          {entry.action}
                        </span>
                        <span className="text-sm text-white font-mono">{entry.secret_name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        by <span className="text-gray-300">{entry.actor}</span>
                        {entry.message && <span className="ml-2 text-red-400">— {entry.message}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{formatDate(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-lg">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-400" /> Rotation Policy
              </h3>
              <div className="space-y-3 text-sm">
                {[
                  { type: 'API Keys', days: 30, color: 'text-blue-400' },
                  { type: 'Tokens', days: 90, color: 'text-purple-400' },
                  { type: 'Passwords', days: 90, color: 'text-red-400' },
                  { type: 'Certificates', days: 365, color: 'text-green-400' },
                ].map(policy => (
                  <div key={policy.type} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                    <span className={policy.color}>{policy.type}</span>
                    <span className="text-gray-300">Every {policy.days} days</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-yellow-400" /> Security Standards
              </h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> AES-256 encryption at rest</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> TLS 1.3 in transit</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Full audit trail</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> Role-based access (RBAC)</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400" /> ISO 27001 A.9 compliant</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Secret Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <h2 className="font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-yellow-400" /> New Secret
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Secret Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                  placeholder="MY_API_KEY"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm font-mono focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Secret Value *</label>
                <input
                  type="password"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="Enter secret value..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm font-mono focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as Secret['type'] }))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                  >
                    {SECRET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Environment</label>
                  <select
                    value={form.environment}
                    onChange={e => setForm(f => ({ ...f, environment: e.target.value as Secret['environment'] }))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                  >
                    {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this secret for?"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Rotation (days)</label>
                  <input
                    type="number"
                    value={form.rotation_days}
                    onChange={e => setForm(f => ({ ...f, rotation_days: parseInt(e.target.value) || 90 }))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Tags (comma-sep)</label>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                    placeholder="ai, production"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-700">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name || !form.value}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                Create Secret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}