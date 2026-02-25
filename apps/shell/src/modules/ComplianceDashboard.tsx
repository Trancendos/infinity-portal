/**
 * ComplianceDashboard — EU AI Act compliance monitoring
 */
import React, { useState, useEffect } from 'react';
import { useCompliance } from '../providers/BackendProvider';

interface AuditEntry {
  id: string;
  event_type: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
  metadata: any;
}

interface DashboardData {
  total_ai_systems: number;
  high_risk_systems: number;
  total_dpias: number;
  pending_hitl_tasks: number;
  total_audit_entries: number;
  compliance_score: number;
  risk_distribution: Record<string, number>;
}

export default function ComplianceDashboard() {
  const { getDashboard, getAuditLogs, getDPIAs, registerSystem } = useCompliance();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [dpias, setDpias] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'audit' | 'dpias' | 'register'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Register form
  const [regForm, setRegForm] = useState({
    name: '', description: '', purpose: '', risk_level: 'MINIMAL_RISK',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashData, logsData, dpiasData] = await Promise.allSettled([
        getDashboard(),
        getAuditLogs(100),
        getDPIAs(),
      ]);
      if (dashData.status === 'fulfilled') setDashboard(dashData.value);
      if (logsData.status === 'fulfilled') setAuditLogs(logsData.value);
      if (dpiasData.status === 'fulfilled') setDpias(dpiasData.value);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    try {
      await registerSystem(regForm);
      setRegForm({ name: '', description: '', purpose: '', risk_level: 'MINIMAL_RISK' });
      loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const riskColors: Record<string, string> = {
    PROHIBITED: 'bg-red-500',
    HIGH_RISK: 'bg-orange-500',
    LIMITED_RISK: 'bg-yellow-500',
    MINIMAL_RISK: 'bg-green-500',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">🛡️ Compliance Dashboard</h2>
          <span className="text-xs text-white/40">EU AI Act • GDPR • ISO 27001</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-sm text-red-200">
            {error}
            <button onClick={() => setError('')} className="ml-2">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          {(['overview', 'audit', 'dpias', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {t === 'overview' ? '📊 Overview' : t === 'audit' ? '📋 Audit Log' :
               t === 'dpias' ? '📄 DPIAs' : '➕ Register System'}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && dashboard && (
          <div className="space-y-6">
            {/* Score */}
            <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-xl border border-purple-500/30">
              <div className="text-5xl font-bold text-purple-400">
                {dashboard.compliance_score}%
              </div>
              <div>
                <p className="text-lg font-medium">Compliance Score</p>
                <p className="text-sm text-white/50">Based on registered systems, DPIAs, and audit coverage</p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-2xl font-bold">{dashboard.total_ai_systems}</p>
                <p className="text-sm text-white/50">AI Systems</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-2xl font-bold text-orange-400">{dashboard.high_risk_systems}</p>
                <p className="text-sm text-white/50">High Risk</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-2xl font-bold">{dashboard.total_dpias}</p>
                <p className="text-sm text-white/50">DPIAs</p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-2xl font-bold text-yellow-400">{dashboard.pending_hitl_tasks}</p>
                <p className="text-sm text-white/50">Pending HITL</p>
              </div>
            </div>

            {/* Risk Distribution */}
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <h3 className="font-medium mb-3">Risk Distribution</h3>
              <div className="space-y-2">
                {Object.entries(dashboard.risk_distribution || {}).map(([level, count]) => (
                  <div key={level} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${riskColors[level] || 'bg-gray-500'}`} />
                    <span className="text-sm flex-1">{level.replace('_', ' ')}</span>
                    <span className="text-sm font-mono">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit entries count */}
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-white/50">Total Audit Entries</p>
              <p className="text-3xl font-bold">{dashboard.total_audit_entries.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Audit Log */}
        {tab === 'audit' && (
          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <p className="text-white/50 text-center py-8">No audit entries yet</p>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/10 text-sm">
                  <span className="text-white/40 font-mono w-40 shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    log.event_type.includes('success') || log.event_type.includes('approved') ? 'bg-green-500/20 text-green-300' :
                    log.event_type.includes('failed') || log.event_type.includes('rejected') ? 'bg-red-500/20 text-red-300' :
                    'bg-blue-500/20 text-blue-300'
                  }`}>
                    {log.event_type}
                  </span>
                  <span className="text-white/60 truncate">{log.resource_type} {log.resource_id}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* DPIAs */}
        {tab === 'dpias' && (
          <div className="space-y-3">
            {dpias.length === 0 ? (
              <p className="text-white/50 text-center py-8">No DPIAs recorded</p>
            ) : (
              dpias.map((d: any) => (
                <div key={d.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{d.title || d.system_name || 'DPIA'}</p>
                      <p className="text-sm text-white/50 mt-1">{d.description || 'No description'}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      d.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                      d.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>
                      {d.status || 'draft'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Register System */}
        {tab === 'register' && (
          <div className="max-w-lg space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">System Name</label>
              <input
                value={regForm.name}
                onChange={e => setRegForm({...regForm, name: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="e.g. Content Generation Engine"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Description</label>
              <textarea
                value={regForm.description}
                onChange={e => setRegForm({...regForm, description: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                placeholder="What does this system do?"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Purpose</label>
              <input
                value={regForm.purpose}
                onChange={e => setRegForm({...regForm, purpose: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="e.g. Automated content generation for marketing"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Risk Level (EU AI Act)</label>
              <select
                value={regForm.risk_level}
                onChange={e => setRegForm({...regForm, risk_level: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
              >
                <option value="MINIMAL_RISK" className="bg-slate-800">Minimal Risk</option>
                <option value="LIMITED_RISK" className="bg-slate-800">Limited Risk</option>
                <option value="HIGH_RISK" className="bg-slate-800">High Risk</option>
                <option value="PROHIBITED" className="bg-slate-800">Prohibited</option>
              </select>
            </div>
            <button
              onClick={handleRegister}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Register AI System
            </button>
          </div>
        )}
      </div>
    </div>
  );
}