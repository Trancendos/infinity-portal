/**
 * DependencyMap — Visual Dependency Graph & Deployment Chain Manager
 * Interactive graph, impact analysis, deployment chains, repo health
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

const NODE_COLORS: Record<string, string> = {
  repo: '#818cf8', service: '#22c55e', package: '#eab308', infra: '#f97316',
};
const HEALTH_COLORS: Record<string, string> = {
  healthy: '#22c55e', degraded: '#eab308', down: '#ef4444', unknown: '#64748b',
};

export default function DependencyMap() {
  const [tab, setTab] = useState<'maps' | 'chains' | 'repos'>('maps');
  const [maps, setMaps] = useState<any[]>([]);
  const [selectedMap, setSelectedMap] = useState<any>(null);
  const [chains, setChains] = useState<any[]>([]);
  const [repos, setRepos] = useState<any>(null);
  const [impactResult, setImpactResult] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', map_type: 'mixed' });
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchMaps = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/deps/maps`, { headers });
      if (r.ok) setMaps(await r.json());
    } catch {}
  }, []);

  const fetchMap = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API}/api/v1/deps/maps/${id}`, { headers });
      if (r.ok) setSelectedMap(await r.json());
    } catch {}
  }, []);

  const fetchChains = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/deps/chains`, { headers });
      if (r.ok) setChains(await r.json());
    } catch {}
  }, []);

  const fetchRepos = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/deps/repos/health`, { headers });
      if (r.ok) setRepos(await r.json());
    } catch {}
  }, []);

  useEffect(() => { fetchMaps(); }, [fetchMaps]);
  useEffect(() => { if (tab === 'chains') fetchChains(); }, [tab, fetchChains]);
  useEffect(() => { if (tab === 'repos') fetchRepos(); }, [tab, fetchRepos]);

  const createMap = async () => {
    if (!form.name.trim()) return;
    try {
      await fetch(`${API}/api/v1/deps/maps`, { method: 'POST', headers, body: JSON.stringify(form) });
      setShowCreate(false); setForm({ name: '', description: '', map_type: 'mixed' });
      fetchMaps();
    } catch {}
  };

  const runImpact = async (mapId: string, nodeId: string) => {
    try {
      const r = await fetch(`${API}/api/v1/deps/maps/${mapId}/impact-analysis/${nodeId}`, { headers });
      if (r.ok) setImpactResult(await r.json());
    } catch {}
  };

  const executeChain = async (chainId: string) => {
    try {
      await fetch(`${API}/api/v1/deps/chains/${chainId}/execute`, { method: 'POST', headers });
      fetchChains();
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      <div style={s({ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', flexShrink: 0 })}>
        {(['maps', 'chains', 'repos'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedMap(null); setImpactResult(null); }} style={s({
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? '#818cf8' : '#64748b', fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', fontSize: '13px',
          })}>{t === 'maps' ? '🗺 Maps' : t === 'chains' ? '🔗 Deploy Chains' : '📡 Repo Health'}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={s({
          margin: '6px 0', padding: '6px 14px', background: '#818cf8', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        })}>+ New Map</button>
      </div>

      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>
        {/* Maps Tab — List */}
        {tab === 'maps' && !selectedMap && (
          <div>
            {maps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗺</div>
                <div>No dependency maps yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Create a map to visualize your ecosystem dependencies</div>
              </div>
            ) : maps.map((m: any) => (
              <div key={m.id} onClick={() => fetchMap(m.id)} style={s({
                background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px', cursor: 'pointer',
                border: '1px solid #334155',
              })}>
                <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' })}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{m.name}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#334155', color: '#94a3b8' }}>{m.map_type}</span>
                </div>
                {m.description && <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>{m.description}</div>}
                <div style={s({ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b' })}>
                  <span>🔵 {m.node_count} nodes</span>
                  <span>➡️ {m.edge_count} edges</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Maps Tab — Detail */}
        {tab === 'maps' && selectedMap && (
          <div>
            <button onClick={() => { setSelectedMap(null); setImpactResult(null); }} style={s({ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '13px', marginBottom: '12px' })}>← Back to maps</button>
            <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>{selectedMap.name}</h3>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
              {selectedMap.nodes?.length || 0} nodes · {selectedMap.edges?.length || 0} edges
            </div>

            {/* Visual Graph (simplified node list) */}
            <h4 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>NODES</h4>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '16px' })}>
              {(selectedMap.nodes || []).map((n: any) => (
                <div key={n.id} onClick={() => runImpact(selectedMap.id, n.id)} style={s({
                  background: '#1e293b', borderRadius: '8px', padding: '10px', cursor: 'pointer',
                  borderLeft: `3px solid ${NODE_COLORS[n.node_type] || '#64748b'}`,
                })}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{n.name}</div>
                  <div style={s({ display: 'flex', gap: '6px', fontSize: '11px', color: '#64748b', marginTop: '4px' })}>
                    <span>{n.node_type}</span>
                    <span style={{ color: HEALTH_COLORS[n.health_status] || '#64748b' }}>● {n.health_status}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Edges */}
            {(selectedMap.edges || []).length > 0 && (
              <>
                <h4 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>EDGES</h4>
                {(selectedMap.edges || []).map((e: any) => {
                  const src = (selectedMap.nodes || []).find((n: any) => n.id === e.source_id);
                  const tgt = (selectedMap.nodes || []).find((n: any) => n.id === e.target_id);
                  return (
                    <div key={e.id} style={s({ fontSize: '12px', padding: '4px 0', color: '#94a3b8' })}>
                      {src?.name || '?'} <span style={{ color: e.is_critical ? '#ef4444' : '#64748b' }}>→ {e.edge_type} →</span> {tgt?.name || '?'}
                      {e.is_critical && <span style={{ color: '#ef4444', marginLeft: '6px' }}>⚠ CRITICAL</span>}
                    </div>
                  );
                })}
              </>
            )}

            {/* Impact Analysis Result */}
            {impactResult && (
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginTop: '16px', borderLeft: '3px solid #ef4444' })}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#ef4444' }}>💥 Impact Analysis — Blast Radius: {impactResult.blast_radius}</h4>
                {impactResult.affected_nodes.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>No downstream dependencies affected</div>
                ) : impactResult.affected_nodes.map((n: any) => (
                  <div key={n.id} style={s({ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '13px' })}>
                    <span style={{ color: NODE_COLORS[n.node_type] || '#64748b' }}>●</span>
                    <span>{n.name}</span>
                    <span style={{ color: '#64748b' }}>({n.edge_type})</span>
                    {n.is_critical && <span style={{ color: '#ef4444' }}>⚠</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chains Tab */}
        {tab === 'chains' && (
          <div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px' }}>Deployment Chains</h3>
            {chains.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔗</div>
                <div>No deployment chains yet</div>
              </div>
            ) : chains.map((c: any) => (
              <div key={c.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px' })}>
                <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{c.name}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      {c.steps} steps · {c.auto_rollback ? '🔄 Auto-rollback' : '⚠ Manual rollback'}
                      {c.last_executed && ` · Last: ${new Date(c.last_executed).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button onClick={() => executeChain(c.id)} style={s({
                    padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  })}>▶ Deploy</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Repos Tab */}
        {tab === 'repos' && repos && (
          <div>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px' })}>
              {[
                { label: 'Healthy', value: repos.healthy, color: '#22c55e' },
                { label: 'Degraded', value: repos.degraded, color: '#eab308' },
                { label: 'Down', value: repos.down, color: '#ef4444' },
                { label: 'Unknown', value: repos.unknown, color: '#64748b' },
              ].map(kpi => (
                <div key={kpi.label} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', textAlign: 'center' })}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{kpi.label}</div>
                </div>
              ))}
            </div>
            {(repos.repos || []).map((r: any) => (
              <div key={r.name} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{r.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Last sync: {r.last_synced ? new Date(r.last_synced).toLocaleString() : 'Never'}
                  </div>
                </div>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: HEALTH_COLORS[r.status] || '#64748b' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>New Dependency Map</h3>
            <input placeholder="Map Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' })} />
            <select value={form.map_type} onChange={e => setForm(f => ({ ...f, map_type: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px' })}>
              <option value="mixed">Mixed</option>
              <option value="repository">Repository</option>
              <option value="service">Service</option>
              <option value="infrastructure">Infrastructure</option>
            </select>
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowCreate(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={createMap} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}