/**
 * ITSMDashboard — IT Service Management Dashboard
 * Mobile-first: card-based incidents, SLA timers, severity badges
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface Incident {
  id: string; key: string; title: string; severity: string;
  status: string; category: string | null; assignee_id: string | null;
  escalation_level: number; tags: string[]; created_at: string;
  resolved_at: string | null;
}

interface DashboardStats {
  open_incidents: number; by_severity: Record<string, number>;
  sla_breaches: number; resolved_today: number; pending_changes: number;
}

const SEV_COLORS: Record<string, string> = {
  P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#3b82f6', P5: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  open: '🔴 Open', acknowledged: '🟡 Ack', in_progress: '🔵 In Progress',
  on_hold: '⏸ Hold', resolved: '✅ Resolved', closed: '⬛ Closed',
};

export default function ITSMDashboard() {
  const [tab, setTab] = useState<'dashboard' | 'incidents' | 'changes' | 'problems'>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ status: '', severity: '', search: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSeverity, setNewSeverity] = useState('P3');
  const [newDesc, setNewDesc] = useState('');
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/itsm/incidents/dashboard`, { headers });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const fetchIncidents = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.severity) params.set('severity', filter.severity);
    if (filter.search) params.set('search', filter.search);
    params.set('limit', '50');
    try {
      const r = await fetch(`${API}/api/v1/itsm/incidents?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setIncidents(d.items || []); setTotal(d.total || 0); }
    } catch {}
  }, [filter]);

  useEffect(() => { fetchStats(); fetchIncidents(); }, [fetchStats, fetchIncidents]);

  const createIncident = async () => {
    if (!newTitle.trim()) return;
    try {
      await fetch(`${API}/api/v1/itsm/incidents`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: newTitle, severity: newSeverity, description: newDesc }),
      });
      setShowCreate(false); setNewTitle(''); setNewDesc('');
      fetchIncidents(); fetchStats();
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      {/* Tab Bar */}
      <div style={s({ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', flexShrink: 0 })}>
        {(['dashboard', 'incidents', 'changes', 'problems'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={s({
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? '#818cf8' : '#64748b', fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', fontSize: '13px',
            textTransform: 'capitalize',
          })}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={s({
          margin: '6px 0', padding: '6px 14px', background: '#818cf8', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        })}>+ New Incident</button>
      </div>

      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>
        {/* Dashboard Tab */}
        {tab === 'dashboard' && stats && (
          <div>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' })}>
              {[
                { label: 'Open Incidents', value: stats.open_incidents, color: '#ef4444' },
                { label: 'SLA Breaches', value: stats.sla_breaches, color: '#f97316' },
                { label: 'Resolved Today', value: stats.resolved_today, color: '#22c55e' },
                { label: 'Pending Changes', value: stats.pending_changes, color: '#3b82f6' },
              ].map(kpi => (
                <div key={kpi.label} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', borderLeft: `3px solid ${kpi.color}` })}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{kpi.label}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>By Severity</h3>
            <div style={s({ display: 'flex', gap: '8px', flexWrap: 'wrap' })}>
              {Object.entries(stats.by_severity).map(([sev, count]) => (
                <div key={sev} style={s({ background: '#1e293b', borderRadius: '6px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' })}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: SEV_COLORS[sev] || '#6b7280' }} />
                  <span style={{ fontWeight: 600 }}>{sev}</span>
                  <span style={{ color: '#94a3b8' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incidents Tab */}
        {tab === 'incidents' && (
          <div>
            <div style={s({ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' })}>
              <input placeholder="Search..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                style={s({ flex: 1, minWidth: '120px', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })} />
              <select value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))}
                style={s({ padding: '8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })}>
                <option value="">All Severity</option>
                {['P1','P2','P3','P4','P5'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
                style={s({ padding: '8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })}>
                <option value="">All Status</option>
                {['open','acknowledged','in_progress','on_hold','resolved','closed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{total} incidents</div>
            {incidents.map(inc => (
              <div key={inc.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', marginBottom: '8px',
                borderLeft: `3px solid ${SEV_COLORS[inc.severity] || '#6b7280'}`, cursor: 'pointer' })}>
                <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' })}>
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>{inc.key}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                    background: SEV_COLORS[inc.severity] + '22', color: SEV_COLORS[inc.severity] }}>{inc.severity}</span>
                </div>
                <div style={{ fontSize: '14px', marginBottom: '6px' }}>{inc.title}</div>
                <div style={s({ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8', flexWrap: 'wrap' })}>
                  <span>{STATUS_LABELS[inc.status] || inc.status}</span>
                  {inc.category && <span>📁 {inc.category}</span>}
                  {inc.escalation_level > 0 && <span>⬆️ L{inc.escalation_level}</span>}
                  <span>{new Date(inc.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Changes Tab */}
        {tab === 'changes' && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔄</div>
            <div>Change Management</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>View and manage change requests</div>
          </div>
        )}

        {/* Problems Tab */}
        {tab === 'problems' && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
            <div>Problem Management</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Root cause analysis and tracking</div>
          </div>
        )}
      </div>

      {/* Create Incident Modal */}
      {showCreate && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>New Incident</h3>
            <input placeholder="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <select value={newSeverity} onChange={e => setNewSeverity(e.target.value)}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px' })}>
              {['P1','P2','P3','P4','P5'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <textarea placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' })} />
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowCreate(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={createIncident} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}