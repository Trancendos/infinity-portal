import React, { useState, useEffect } from 'react';

interface Connector {
  id: string; name: string; slug: string; description?: string;
  icon_url?: string; category: string; base_url: string;
  auth_type: string; status: string; capabilities: string[];
  request_count: number; error_count: number; is_built_in: boolean;
  webhook_count: number; last_health_check?: string; created_at: string;
}

interface Template { slug: string; name: string; icon_url?: string; category: string; base_url: string; auth_type: string; capabilities: string[]; }

const STATUS_COLORS: Record<string, string> = { active: 'bg-green-500', inactive: 'bg-gray-500', error: 'bg-red-500', pending_auth: 'bg-yellow-500', rate_limited: 'bg-orange-500' };
const CATEGORY_ICONS: Record<string, string> = { comms: '💬', devops: '🛠️', payments: '💳', ai: '🤖', storage: '📦', general: '🔗', crm: '👥' };

export default function IntegrationHub() {
  const [tab, setTab] = useState<'connectors' | 'templates'>('connectors');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Connector | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [cr, tr] = await Promise.all([
        fetch('/api/v1/integrations/connectors', { headers: h }),
        fetch('/api/v1/integrations/templates', { headers: h }),
      ]);
      if (cr.ok) setConnectors(await cr.json());
      if (tr.ok) setTemplates(await tr.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function installTemplate(slug: string) {
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/v1/integrations/connectors/from-template/${slug}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.ok) loadData();
  }

  async function checkHealth(id: string) {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/integrations/connectors/${id}/health`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    loadData();
  }

  async function deleteConnector(id: string) {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/integrations/connectors/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSelected(null); loadData();
  }

  const installed = new Set(connectors.map(c => c.slug));

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">🔗 Integration Hub</h2>
          <span className="text-xs text-white/40">{connectors.length} connectors</span>
        </div>
        <div className="flex gap-2">
          {(['connectors', 'templates'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded text-xs font-medium transition ${tab === t ? 'bg-purple-600' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}>
              {t === 'connectors' ? `🔌 Active (${connectors.length})` : `📦 Templates (${templates.length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
        ) : tab === 'connectors' ? (
          connectors.length === 0 ? (
            <div className="text-center py-16 text-white/40"><p className="text-5xl mb-3">🔌</p><p>No connectors yet. Browse templates to get started.</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {connectors.map(c => (
                <div key={c.id} onClick={() => setSelected(c)} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-purple-500/50 cursor-pointer transition">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{CATEGORY_ICONS[c.category] || '🔗'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><span className="font-medium">{c.name}</span><span className={`w-2 h-2 rounded-full ${STATUS_COLORS[c.status] || 'bg-gray-500'}`} /></div>
                      <span className="text-xs text-white/40">{c.slug} · {c.category}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); checkHealth(c.id); }} className="px-2 py-1 bg-white/5 rounded text-xs hover:bg-white/10">🏥</button>
                      <button onClick={e => { e.stopPropagation(); deleteConnector(c.id); }} className="px-2 py-1 bg-white/5 rounded text-xs hover:bg-red-500/20 text-red-400">✕</button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-white/30">
                    <span>📊 {c.request_count} requests</span><span>⚠️ {c.error_count} errors</span>
                    {c.capabilities.length > 0 && <span>🔧 {c.capabilities.length} capabilities</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.slug} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{CATEGORY_ICONS[t.category] || '🔗'}</span>
                  <div><div className="font-medium">{t.name}</div><span className="text-xs text-white/40">{t.category}</span></div>
                </div>
                <div className="text-xs text-white/40 mb-3">{t.capabilities.join(', ')}</div>
                <button onClick={() => installTemplate(t.slug)} disabled={installed.has(t.slug)}
                  className={`w-full py-1.5 rounded text-xs font-medium transition ${installed.has(t.slug) ? 'bg-green-600/20 text-green-400' : 'bg-purple-600 hover:bg-purple-500'}`}>
                  {installed.has(t.slug) ? '✓ Installed' : '+ Install'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
