/**
 * AssetRegistry — Asset Management & CMDB
 * Asset list, relationship graph, lifecycle timeline, maintenance schedule
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface AssetItem {
  id: string; asset_tag: string; name: string; asset_type: string;
  status: string; location: string | null; vendor: string | null;
  owner_id: string | null; tags: string[]; created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  hardware: '🖥', software: '💿', service: '⚙️', license: '📜',
  cloud_resource: '☁️', network: '🌐', data: '💾',
};
const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', maintenance: '#eab308', retired: '#94a3b8',
  disposed: '#64748b', in_stock: '#3b82f6', on_order: '#a855f7',
};

export default function AssetRegistry() {
  const [tab, setTab] = useState<'assets' | 'dashboard' | 'maintenance'>('assets');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dashboard, setDashboard] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', asset_type: 'hardware', vendor: '', location: '' });
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAssets = useCallback(async () => {
    const p = new URLSearchParams({ limit: '50' });
    if (search) p.set('search', search);
    if (typeFilter) p.set('asset_type', typeFilter);
    try {
      const r = await fetch(`${API}/api/v1/assets/?${p}`, { headers });
      if (r.ok) { const d = await r.json(); setAssets(d.items || []); setTotal(d.total || 0); }
    } catch {}
  }, [search, typeFilter]);

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/assets/dashboard`, { headers });
      if (r.ok) setDashboard(await r.json());
    } catch {}
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { if (tab === 'dashboard') fetchDashboard(); }, [tab, fetchDashboard]);

  const createAsset = async () => {
    if (!form.name.trim()) return;
    try {
      await fetch(`${API}/api/v1/assets/`, {
        method: 'POST', headers, body: JSON.stringify(form),
      });
      setShowCreate(false); setForm({ name: '', asset_type: 'hardware', vendor: '', location: '' });
      fetchAssets();
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      <div style={s({ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', flexShrink: 0 })}>
        {(['assets', 'dashboard', 'maintenance'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={s({
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? '#818cf8' : '#64748b', fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', fontSize: '13px',
            textTransform: 'capitalize',
          })}>{t === 'assets' ? '📦 Assets' : t === 'dashboard' ? '📊 Dashboard' : '🔧 Maintenance'}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={s({
          margin: '6px 0', padding: '6px 14px', background: '#818cf8', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        })}>+ Register Asset</button>
      </div>

      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>
        {tab === 'assets' && (
          <div>
            <div style={s({ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' })}>
              <input placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)}
                style={s({ flex: 1, minWidth: '150px', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })} />
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                style={s({ padding: '8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })}>
                <option value="">All Types</option>
                {Object.entries(TYPE_ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{total} assets</div>
            {assets.map(a => (
              <div key={a.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', marginBottom: '6px', display: 'flex', gap: '10px', alignItems: 'center' })}>
                <span style={{ fontSize: '24px' }}>{TYPE_ICONS[a.asset_type] || '📦'}</span>
                <div style={{ flex: 1 }}>
                  <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{a.name}</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                      background: (STATUS_COLORS[a.status] || '#64748b') + '22',
                      color: STATUS_COLORS[a.status] || '#64748b' }}>{a.status}</span>
                  </div>
                  <div style={s({ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8', marginTop: '4px' })}>
                    <span>🏷 {a.asset_tag}</span>
                    {a.vendor && <span>🏢 {a.vendor}</span>}
                    {a.location && <span>📍 {a.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'dashboard' && dashboard && (
          <div>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' })}>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#818cf8' }}>{dashboard.total_assets}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Assets</div>
              </div>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#f97316' }}>{dashboard.expiring_warranties}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Expiring Warranties</div>
              </div>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#eab308' }}>{dashboard.upcoming_maintenance}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Upcoming Maintenance</div>
              </div>
            </div>
            <h4 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>By Type</h4>
            {Object.entries(dashboard.by_type || {}).map(([type, count]) => (
              <div key={type} style={s({ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' })}>
                <span>{TYPE_ICONS[type] || '📦'} {type}</span>
                <span style={{ color: '#94a3b8' }}>{count as number}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'maintenance' && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔧</div>
            <div>Maintenance Schedule</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Schedule and track asset maintenance</div>
          </div>
        )}
      </div>

      {showCreate && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Register Asset</h3>
            <input placeholder="Asset Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <select value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px' })}>
              {Object.entries(TYPE_ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
            </select>
            <input placeholder="Vendor" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <input placeholder="Location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px', boxSizing: 'border-box' })} />
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowCreate(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={createAsset} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Register</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}