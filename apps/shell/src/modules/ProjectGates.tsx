/**
 * ProjectGates — PRINCE2 Gate Process Manager
 * Pipeline view with gate stages, approval workflow, checklist verification
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface Gate { id: string; gate_number: number; gate_name: string; status: string; description?: string;
  criteria?: { id: string; description: string; is_mandatory: boolean; is_met: boolean }[];
  reviews?: { id: string; reviewer_id: string; decision: string; comments: string; reviewed_at: string }[];
  deliverables?: { id: string; name: string; type: string; status: string }[];
}
interface Project { id: string; key: string; name: string; status: string; current_gate: number;
  owner_id: string; target_date: string | null; gates: { number: number; status: string }[];
  tags: string[]; created_at: string;
}

const GATE_COLORS: Record<string, string> = {
  pending: '#64748b', in_review: '#eab308', approved: '#22c55e', rejected: '#ef4444', skipped: '#94a3b8',
};
const GATE_ICONS: Record<string, string> = {
  pending: '⏳', in_review: '👁', approved: '✅', rejected: '❌', skipped: '⏭',
};

export default function ProjectGates() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchProjects = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/gates/projects`, { headers });
      if (r.ok) { const d = await r.json(); setProjects(d.items || []); }
    } catch {}
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API}/api/v1/gates/projects/${id}`, { headers });
      if (r.ok) setDetail(await r.json());
    } catch {}
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { if (selected) fetchDetail(selected); }, [selected, fetchDetail]);

  const createProject = async () => {
    if (!newName.trim()) return;
    try {
      await fetch(`${API}/api/v1/gates/projects`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      setShowCreate(false); setNewName(''); setNewDesc('');
      fetchProjects();
    } catch {}
  };

  const verifyCriteria = async (projectId: string, gateNum: number, criteriaId: string) => {
    try {
      await fetch(`${API}/api/v1/gates/projects/${projectId}/gates/${gateNum}/criteria/${criteriaId}/verify`, {
        method: 'POST', headers,
      });
      fetchDetail(projectId);
    } catch {}
  };

  const submitGate = async (projectId: string, gateNum: number) => {
    try {
      const r = await fetch(`${API}/api/v1/gates/projects/${projectId}/gates/${gateNum}/submit`, {
        method: 'POST', headers,
      });
      if (!r.ok) { const e = await r.json(); alert(e.detail || 'Cannot submit'); return; }
      fetchDetail(projectId);
    } catch {}
  };

  const reviewGate = async (projectId: string, gateNum: number, decision: string) => {
    try {
      await fetch(`${API}/api/v1/gates/projects/${projectId}/gates/${gateNum}/review`, {
        method: 'POST', headers,
        body: JSON.stringify({ decision, comments: `${decision} via dashboard` }),
      });
      fetchDetail(projectId); fetchProjects();
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      {/* Header */}
      <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 })}>
        <h2 style={{ margin: 0, fontSize: '16px' }}>🏛 PRINCE2 Gate Manager</h2>
        <button onClick={() => setShowCreate(true)} style={s({ padding: '6px 14px', background: '#818cf8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ New Project</button>
      </div>

      <div style={s({ flex: 1, display: 'flex', overflow: 'hidden' })}>
        {/* Project List */}
        <div style={s({ width: selected ? '280px' : '100%', borderRight: selected ? '1px solid #1e293b' : 'none', overflow: 'auto', padding: '10px', flexShrink: 0 })}>
          {projects.map(p => (
            <div key={p.id} onClick={() => setSelected(p.id)} style={s({
              background: selected === p.id ? '#1e293b' : 'transparent', borderRadius: '8px',
              padding: '12px', marginBottom: '6px', cursor: 'pointer', border: '1px solid',
              borderColor: selected === p.id ? '#818cf8' : '#1e293b',
            })}>
              <div style={s({ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' })}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{p.key}</span>
                <span style={{ fontSize: '11px', color: p.status === 'active' ? '#22c55e' : '#94a3b8' }}>{p.status}</span>
              </div>
              <div style={{ fontSize: '14px', marginBottom: '8px' }}>{p.name}</div>
              {/* Gate Pipeline Mini */}
              <div style={s({ display: 'flex', gap: '3px' })}>
                {(p.gates || []).map(g => (
                  <div key={g.number} style={s({
                    flex: 1, height: '4px', borderRadius: '2px',
                    background: GATE_COLORS[g.status] || '#334155',
                  })} title={`G${g.number}: ${g.status}`} />
                ))}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🏛</div>
              <div>No projects yet</div>
            </div>
          )}
        </div>

        {/* Project Detail */}
        {selected && detail && (
          <div style={s({ flex: 1, overflow: 'auto', padding: '14px' })}>
            <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' })}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{detail.name}</h3>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{detail.key} · Gate {detail.current_gate}/6</div>
              </div>
              <button onClick={() => setSelected(null)} style={s({ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' })}>✕</button>
            </div>

            {/* Gate Pipeline */}
            {(detail.gates || []).map((gate: any) => (
              <div key={gate.id} style={s({
                background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '10px',
                borderLeft: `3px solid ${GATE_COLORS[gate.status] || '#334155'}`,
              })}>
                <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' })}>
                  <div style={s({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                    <span style={{ fontSize: '16px' }}>{GATE_ICONS[gate.status] || '⏳'}</span>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>G{gate.gate_number}: {gate.gate_name}</span>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                    background: (GATE_COLORS[gate.status] || '#334155') + '22',
                    color: GATE_COLORS[gate.status] || '#94a3b8' }}>{gate.status}</span>
                </div>

                {gate.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>{gate.description}</div>}

                {/* Criteria Checklist */}
                {gate.criteria && gate.criteria.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>CRITERIA</div>
                    {gate.criteria.map((c: any) => (
                      <div key={c.id} style={s({ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px' })}>
                        <button onClick={() => !c.is_met && verifyCriteria(detail.id, gate.gate_number, c.id)}
                          style={s({ width: '20px', height: '20px', borderRadius: '4px', border: '1px solid',
                            borderColor: c.is_met ? '#22c55e' : '#334155', background: c.is_met ? '#22c55e22' : 'transparent',
                            cursor: c.is_met ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#22c55e', fontSize: '12px' })}>{c.is_met ? '✓' : ''}</button>
                        <span style={{ color: c.is_met ? '#94a3b8' : '#e2e8f0', textDecoration: c.is_met ? 'line-through' : 'none' }}>
                          {c.description} {c.is_mandatory && <span style={{ color: '#ef4444', fontSize: '10px' }}>*</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {gate.status === 'pending' && (
                  <button onClick={() => submitGate(detail.id, gate.gate_number)} style={s({
                    padding: '6px 14px', background: '#eab308', color: '#000', border: 'none',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  })}>Submit for Review</button>
                )}
                {gate.status === 'in_review' && (
                  <div style={s({ display: 'flex', gap: '8px' })}>
                    <button onClick={() => reviewGate(detail.id, gate.gate_number, 'approve')} style={s({
                      padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    })}>✓ Approve</button>
                    <button onClick={() => reviewGate(detail.id, gate.gate_number, 'reject')} style={s({
                      padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    })}>✗ Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>New Project</h3>
            <input placeholder="Project Name" value={newName} onChange={e => setNewName(e.target.value)}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <textarea placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' })} />
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>7 PRINCE2 gates (G0–G6) will be auto-created with default criteria.</div>
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowCreate(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={createProject} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}