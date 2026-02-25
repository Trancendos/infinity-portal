import React, { useState, useEffect } from 'react';

interface Listing {
  id: string; module_id: string; name: string; version: string; description: string;
  author: string; icon_url: string; category: string; permissions: string[];
  keywords: string[]; is_sandboxed: boolean; is_containerised: boolean;
  container_image?: string; downloads: number; rating: string; review_count: number;
  is_featured: boolean; is_verified: boolean; status: string; is_installed: boolean;
}

export default function AppStore() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('popular');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadListings(); }, [category, sort, search]);

  async function loadCategories() {
    const token = localStorage.getItem('token');
    const r = await fetch('/api/v1/appstore/categories', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setCategories([{ slug: '', name: 'All', icon: '🏪' }, ...(await r.json())]);
  }

  async function loadListings() {
    setLoading(true);
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({ sort, per_page: '24' });
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    const r = await fetch(`/api/v1/appstore/listings?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const d = await r.json(); setListings(d.listings || []); }
    setLoading(false);
  }

  async function install(moduleId: string) {
    setInstalling(moduleId);
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/v1/appstore/install/${moduleId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.ok) loadListings();
    setInstalling(null);
  }

  async function uninstall(moduleId: string) {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/appstore/uninstall/${moduleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadListings();
  }

  const stars = (r: string) => '★'.repeat(Math.round(parseFloat(r))) + '☆'.repeat(5 - Math.round(parseFloat(r)));

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">🏪 App Store</h2>
          <select value={sort} onChange={e => setSort(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs">
            <option value="popular">Popular</option><option value="newest">Newest</option>
            <option value="rating">Top Rated</option><option value="name">A-Z</option>
          </select>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search modules..."
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm mb-3 focus:border-purple-500 outline-none" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map(c => (
            <button key={c.slug} onClick={() => setCategory(c.slug)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${category === c.slug ? 'bg-purple-600' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-white/40"><p className="text-5xl mb-3">📦</p><p>No modules found</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {listings.map(l => (
              <div key={l.id} onClick={() => setSelected(l)} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-purple-500/50 cursor-pointer transition">
                <div className="flex items-start gap-3 mb-2">
                  <img src={l.icon_url} alt="" className="w-10 h-10 rounded-lg bg-white/10" onError={e => (e.target as any).src = 'https://cdn.simpleicons.org/windowsterminal'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">{l.name}</span>
                      {l.is_verified && <span title="Verified">✅</span>}
                      {l.is_featured && <span title="Featured">⭐</span>}
                      {l.is_containerised && <span title="Containerised">🐳</span>}
                    </div>
                    <span className="text-xs text-white/40">{l.author} · v{l.version}</span>
                  </div>
                </div>
                <p className="text-xs text-white/50 mb-3 line-clamp-2">{l.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <span className="text-yellow-400">{stars(l.rating)}</span>
                    <span>⬇ {l.downloads}</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); l.is_installed ? uninstall(l.module_id) : install(l.module_id); }}
                    disabled={installing === l.module_id}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${l.is_installed ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-purple-600 hover:bg-purple-500'}`}>
                    {installing === l.module_id ? '...' : l.is_installed ? 'Uninstall' : 'Install'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
