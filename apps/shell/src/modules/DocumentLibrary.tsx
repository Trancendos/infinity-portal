/**
 * DocumentLibrary — Document Management System
 * Search, cloud sync status, smart tags, duplicate detection, bulk ops
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface Doc {
  id: string; title: string; description: string | null; mime_type: string | null;
  size: number; source: string; category_id: string | null; tags: string[];
  is_extracted: boolean; created_at: string;
}

const SOURCE_ICONS: Record<string, string> = {
  local: '💾', google_drive: '🟢', onedrive: '🔵', dropbox: '📦',
};
const MIME_ICONS: Record<string, string> = {
  'application/pdf': '📄', 'image/png': '🖼', 'image/jpeg': '🖼',
  'text/plain': '📝', 'text/markdown': '📝', 'application/json': '📊',
  'text/csv': '📊', 'application/zip': '📦',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentLibrary() {
  const [tab, setTab] = useState<'browse' | 'sync' | 'duplicates' | 'stats'>('browse');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [syncConfigs, setSyncConfigs] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadMime, setUploadMime] = useState('');
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchDocs = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (search) params.set('search', search);
    if (sourceFilter) params.set('source', sourceFilter);
    if (tagFilter) params.set('tag', tagFilter);
    try {
      const r = await fetch(`${API}/api/v1/documents/?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setDocs(d.items || []); setTotal(d.total || 0); }
    } catch {}
  }, [search, sourceFilter, tagFilter]);

  const fetchTags = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/documents/tags/all`, { headers });
      if (r.ok) setAllTags(await r.json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/documents/library/stats`, { headers });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const fetchDuplicates = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/documents/duplicates?status=pending`, { headers });
      if (r.ok) setDuplicates(await r.json());
    } catch {}
  }, []);

  const fetchSyncConfigs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/documents/sync/configs`, { headers });
      if (r.ok) setSyncConfigs(await r.json());
    } catch {}
  }, []);

  useEffect(() => { fetchDocs(); fetchTags(); }, [fetchDocs, fetchTags]);
  useEffect(() => { if (tab === 'stats') fetchStats(); }, [tab, fetchStats]);
  useEffect(() => { if (tab === 'duplicates') fetchDuplicates(); }, [tab, fetchDuplicates]);
  useEffect(() => { if (tab === 'sync') fetchSyncConfigs(); }, [tab, fetchSyncConfigs]);

  const uploadDoc = async () => {
    if (!uploadTitle.trim()) return;
    try {
      await fetch(`${API}/api/v1/documents/`, {
        method: 'POST', headers,
        body: JSON.stringify({ title: uploadTitle, mime_type: uploadMime || undefined }),
      });
      setShowUpload(false); setUploadTitle(''); setUploadMime('');
      fetchDocs(); fetchTags();
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      {/* Tab Bar */}
      <div style={s({ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', flexShrink: 0 })}>
        {(['browse', 'sync', 'duplicates', 'stats'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={s({
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? '#818cf8' : '#64748b', fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', fontSize: '13px',
            textTransform: 'capitalize',
          })}>{t === 'sync' ? '☁️ Sync' : t === 'duplicates' ? '🔍 Dupes' : t === 'stats' ? '📊 Stats' : '📚 Browse'}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowUpload(true)} style={s({
          margin: '6px 0', padding: '6px 14px', background: '#818cf8', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        })}>+ Upload</button>
      </div>

      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>
        {/* Browse Tab */}
        {tab === 'browse' && (
          <div>
            <div style={s({ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' })}>
              <input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)}
                style={s({ flex: 1, minWidth: '150px', padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })} />
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                style={s({ padding: '8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' })}>
                <option value="">All Sources</option>
                <option value="local">💾 Local</option>
                <option value="google_drive">🟢 Google Drive</option>
                <option value="onedrive">🔵 OneDrive</option>
                <option value="dropbox">📦 Dropbox</option>
              </select>
            </div>

            {/* Tag Cloud */}
            {allTags.length > 0 && (
              <div style={s({ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' })}>
                {allTags.slice(0, 15).map(t => (
                  <button key={t.tag} onClick={() => setTagFilter(tagFilter === t.tag ? '' : t.tag)}
                    style={s({ padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                      borderColor: tagFilter === t.tag ? '#818cf8' : '#334155',
                      background: tagFilter === t.tag ? '#818cf822' : 'transparent',
                      color: tagFilter === t.tag ? '#818cf8' : '#94a3b8', cursor: 'pointer', fontSize: '11px',
                    })}>{t.tag} ({t.count})</button>
                ))}
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{total} documents</div>
            {docs.map(doc => (
              <div key={doc.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', marginBottom: '6px', display: 'flex', gap: '10px', alignItems: 'center' })}>
                <span style={{ fontSize: '24px' }}>{MIME_ICONS[doc.mime_type || ''] || '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                  <div style={s({ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8', marginTop: '4px', flexWrap: 'wrap' })}>
                    <span>{SOURCE_ICONS[doc.source] || '📄'} {doc.source}</span>
                    <span>{formatSize(doc.size)}</span>
                    {doc.is_extracted && <span>🔍 Extracted</span>}
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                  {doc.tags.length > 0 && (
                    <div style={s({ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' })}>
                      {doc.tags.map(t => (
                        <span key={t} style={s({ padding: '1px 6px', borderRadius: '4px', background: '#334155', fontSize: '10px', color: '#94a3b8' })}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sync Tab */}
        {tab === 'sync' && (
          <div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px' }}>Cloud Sync Configurations</h3>
            {syncConfigs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>☁️</div>
                <div>No cloud sync configured</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Connect Google Drive, OneDrive, or Dropbox via Integration Hub</div>
              </div>
            ) : syncConfigs.map(c => (
              <div key={c.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px' })}>
                <div style={s({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                  <span style={{ fontWeight: 600 }}>{SOURCE_ICONS[c.provider]} {c.provider}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                    background: c.status === 'idle' ? '#22c55e22' : c.status === 'syncing' ? '#eab30822' : '#ef444422',
                    color: c.status === 'idle' ? '#22c55e' : c.status === 'syncing' ? '#eab308' : '#ef4444' }}>{c.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                  {c.items_synced} items synced · Last: {c.last_sync ? new Date(c.last_sync).toLocaleString() : 'Never'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Duplicates Tab */}
        {tab === 'duplicates' && (
          <div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px' }}>Pending Duplicate Groups</h3>
            {duplicates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>✨</div>
                <div>No duplicates detected</div>
              </div>
            ) : duplicates.map(g => (
              <div key={g.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px' })}>
                <div style={{ fontWeight: 600 }}>{g.file_count} duplicate files</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Match: {g.match_type} · Detected: {new Date(g.detected_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <div>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' })}>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#818cf8' }}>{stats.total_documents}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Documents</div>
              </div>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>{formatSize(stats.total_size_bytes)}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Size</div>
              </div>
              <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#f97316' }}>{stats.pending_duplicates}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Pending Duplicates</div>
              </div>
            </div>
            {Object.keys(stats.by_source || {}).length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>By Source</h4>
                {Object.entries(stats.by_source).map(([src, count]) => (
                  <div key={src} style={s({ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' })}>
                    <span>{SOURCE_ICONS[src] || '📄'} {src}</span>
                    <span style={{ color: '#94a3b8' }}>{count as number}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '400px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Upload Document</h3>
            <input placeholder="Document Title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <input placeholder="MIME Type (optional)" value={uploadMime} onChange={e => setUploadMime(e.target.value)}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px', boxSizing: 'border-box' })} />
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowUpload(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={uploadDoc} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Upload</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}