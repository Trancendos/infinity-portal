/**
 * KnowledgeHub — Knowledge Base, Wiki, Learning Paths
 * Articles with markdown, categories, version history, AI insights
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

interface Article {
  id: string; title: string; slug: string; summary: string | null;
  status: string; version: number; category_id: string | null;
  author_id: string; view_count: number; helpful_count: number;
  tags: string[]; created_at: string; updated_at: string;
}

export default function KnowledgeHub() {
  const [tab, setTab] = useState<'articles' | 'learning' | 'insights' | 'stats'>('articles');
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [paths, setPaths] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content_markdown: '', summary: '', status: 'draft' });
  const token = localStorage.getItem('token') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchArticles = useCallback(async () => {
    const p = new URLSearchParams({ limit: '50' });
    if (search) p.set('search', search);
    try {
      const r = await fetch(`${API}/api/v1/kb/articles?${p}`, { headers });
      if (r.ok) { const d = await r.json(); setArticles(d.items || []); setTotal(d.total || 0); }
    } catch {}
  }, [search]);

  const fetchArticle = useCallback(async (slug: string) => {
    try {
      const r = await fetch(`${API}/api/v1/kb/articles/${slug}`, { headers });
      if (r.ok) setSelectedArticle(await r.json());
    } catch {}
  }, []);

  const fetchPaths = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/kb/learning-paths`, { headers });
      if (r.ok) setPaths(await r.json());
    } catch {}
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/kb/ai/insights`, { headers });
      if (r.ok) setInsights(await r.json());
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/kb/stats`, { headers });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);
  useEffect(() => { if (tab === 'learning') fetchPaths(); }, [tab, fetchPaths]);
  useEffect(() => { if (tab === 'insights') fetchInsights(); }, [tab, fetchInsights]);
  useEffect(() => { if (tab === 'stats') fetchStats(); }, [tab, fetchStats]);

  const createArticle = async () => {
    if (!form.title.trim()) return;
    try {
      await fetch(`${API}/api/v1/kb/articles`, {
        method: 'POST', headers, body: JSON.stringify(form),
      });
      setShowCreate(false); setForm({ title: '', content_markdown: '', summary: '', status: 'draft' });
      fetchArticles();
    } catch {}
  };

  const markHelpful = async (id: string) => {
    try {
      await fetch(`${API}/api/v1/kb/articles/${id}/helpful`, { method: 'POST', headers });
      if (selectedArticle?.id === id) fetchArticle(selectedArticle.slug);
    } catch {}
  };

  const s = (css: React.CSSProperties) => css;

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' })}>
      <div style={s({ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 8px', flexShrink: 0 })}>
        {(['articles', 'learning', 'insights', 'stats'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedArticle(null); }} style={s({
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t ? '#818cf8' : '#64748b', fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid #818cf8' : '2px solid transparent', fontSize: '13px',
          })}>{t === 'articles' ? '📖 Articles' : t === 'learning' ? '🎓 Learning' : t === 'insights' ? '🤖 AI Insights' : '📊 Stats'}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)} style={s({
          margin: '6px 0', padding: '6px 14px', background: '#818cf8', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
        })}>+ New Article</button>
      </div>

      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>
        {/* Articles Tab */}
        {tab === 'articles' && !selectedArticle && (
          <div>
            <input placeholder="Search knowledge base..." value={search} onChange={e => setSearch(e.target.value)}
              style={s({ width: '100%', padding: '10px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' })} />
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{total} articles</div>
            {articles.map(a => (
              <div key={a.id} onClick={() => fetchArticle(a.slug)} style={s({
                background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px', cursor: 'pointer',
                borderLeft: `3px solid ${a.status === 'published' ? '#22c55e' : a.status === 'draft' ? '#eab308' : '#64748b'}`,
              })}>
                <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{a.title}</div>
                {a.summary && <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>{a.summary}</div>}
                <div style={s({ display: 'flex', gap: '10px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' })}>
                  <span>v{a.version}</span>
                  <span>👁 {a.view_count}</span>
                  <span>👍 {a.helpful_count}</span>
                  <span>{a.status}</span>
                  <span>{new Date(a.updated_at).toLocaleDateString()}</span>
                </div>
                {a.tags.length > 0 && (
                  <div style={s({ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' })}>
                    {a.tags.map(t => (
                      <span key={t} style={s({ padding: '1px 6px', borderRadius: '4px', background: '#334155', fontSize: '10px', color: '#94a3b8' })}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Article Detail */}
        {tab === 'articles' && selectedArticle && (
          <div>
            <button onClick={() => setSelectedArticle(null)} style={s({ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '13px', marginBottom: '12px' })}>← Back to articles</button>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>{selectedArticle.title}</h2>
            <div style={s({ display: 'flex', gap: '10px', fontSize: '12px', color: '#94a3b8', marginBottom: '16px', flexWrap: 'wrap' })}>
              <span>v{selectedArticle.version}</span>
              <span>👁 {selectedArticle.view_count} views</span>
              <span>👍 {selectedArticle.helpful_count} helpful</span>
              <span>{selectedArticle.status}</span>
            </div>
            <div style={s({ background: '#1e293b', borderRadius: '8px', padding: '16px', marginBottom: '12px', fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' })}>
              {selectedArticle.content_markdown || 'No content yet.'}
            </div>
            <button onClick={() => markHelpful(selectedArticle.id)} style={s({
              padding: '8px 16px', background: '#1e293b', border: '1px solid #334155',
              borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px',
            })}>👍 Helpful ({selectedArticle.helpful_count})</button>
          </div>
        )}

        {/* Learning Tab */}
        {tab === 'learning' && (
          <div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px' }}>Learning Paths</h3>
            {paths.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎓</div>
                <div>No learning paths yet</div>
              </div>
            ) : paths.map((p: any) => (
              <div key={p.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px' })}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{p.name}</div>
                {p.description && <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{p.description}</div>}
                <div style={s({ display: 'flex', gap: '10px', fontSize: '11px', color: '#64748b', marginTop: '8px' })}>
                  <span>📖 {p.article_count} articles</span>
                  {p.estimated_duration_mins && <span>⏱ {p.estimated_duration_mins} min</span>}
                  {p.difficulty && <span>📊 {p.difficulty}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Insights Tab */}
        {tab === 'insights' && (
          <div>
            <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px' }}>AI-Extracted Knowledge</h3>
            {insights.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🤖</div>
                <div>No AI insights yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Insights are extracted from incidents, changes, and documents</div>
              </div>
            ) : insights.map((i: any) => (
              <div key={i.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px', marginBottom: '8px', borderLeft: '3px solid #a855f7' })}>
                <div style={{ fontSize: '14px', marginBottom: '6px' }}>{i.knowledge}</div>
                <div style={s({ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b' })}>
                  <span>Source: {i.source_type}</span>
                  <span>Confidence: {i.confidence}%</span>
                  <span>{new Date(i.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' })}>
            {[
              { label: 'Total Articles', value: stats.total_articles, color: '#818cf8' },
              { label: 'Published', value: stats.published_articles, color: '#22c55e' },
              { label: 'Total Views', value: stats.total_views, color: '#3b82f6' },
              { label: 'Helpful Votes', value: stats.total_helpful, color: '#eab308' },
              { label: 'Learning Paths', value: stats.learning_paths, color: '#a855f7' },
            ].map(kpi => (
              <div key={kpi.label} style={s({ background: '#1e293b', borderRadius: '8px', padding: '14px' })}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Article Modal */}
      {showCreate && (
        <div style={s({ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' })}>
          <div style={s({ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '500px' })}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>New Article</h3>
            <input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <input placeholder="Summary" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '14px', boxSizing: 'border-box' })} />
            <textarea placeholder="Content (Markdown)" value={form.content_markdown} onChange={e => setForm(f => ({ ...f, content_markdown: e.target.value }))} rows={8}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '10px', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' })} />
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              style={s({ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', marginBottom: '14px', fontSize: '14px' })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end' })}>
              <button onClick={() => setShowCreate(false)} style={s({ padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer' })}>Cancel</button>
              <button onClick={createArticle} style={s({ padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 })}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}