/**
 * FederationDashboard — Ecosystem integration & service mesh
 */
import React, { useState, useEffect } from 'react';
import { useFederation } from '../providers/BackendProvider';

interface EcosystemService {
  name: string;
  type: string;
  description: string;
  capabilities: string[];
  status: string;
}

interface RegisteredService {
  id: string;
  name: string;
  service_type: string;
  endpoint_url: string;
  status: string;
  capabilities: string[];
  last_health_check: string | null;
  metadata: any;
}

const TYPE_ICONS: Record<string, string> = {
  agent: '🤖',
  space: '🏛️',
  external: '🔗',
  ml: '🧠',
};

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  offline: 'bg-red-500',
  unknown: 'bg-gray-500',
  available: 'bg-blue-500',
};

export default function FederationDashboard() {
  const { getEcosystem, listServices, registerService, healthCheck } = useFederation();
  const [ecosystem, setEcosystem] = useState<Record<string, EcosystemService>>({});
  const [services, setServices] = useState<RegisteredService[]>([]);
  const [tab, setTab] = useState<'ecosystem' | 'connected' | 'register'>('ecosystem');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');

  const [regForm, setRegForm] = useState({
    name: '', service_type: 'agent', endpoint_url: '', capabilities: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ecoData, svcData] = await Promise.allSettled([
        getEcosystem(),
        listServices(),
      ]);
      if (ecoData.status === 'fulfilled') setEcosystem(ecoData.value.services || ecoData.value || {});
      if (svcData.status === 'fulfilled') setServices(Array.isArray(svcData.value) ? svcData.value : []);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    try {
      await registerService({
        ...regForm,
        capabilities: regForm.capabilities.split(',').map(s => s.trim()).filter(Boolean),
      });
      setMessage('Service registered');
      setRegForm({ name: '', service_type: 'agent', endpoint_url: '', capabilities: '' });
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleHealthCheck = async (serviceId: string) => {
    try {
      const result = await healthCheck(serviceId);
      setMessage(`Health: ${result.status || 'checked'}`);
      loadData();
    } catch (e: any) {
      setMessage(`Health check failed: ${e.message}`);
    }
  };

  const ecoEntries = Object.entries(ecosystem);
  const filteredEntries = filter === 'all'
    ? ecoEntries
    : ecoEntries.filter(([, svc]) => svc.type === filter);

  const types = [...new Set(ecoEntries.map(([, s]) => s.type))];

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
          <div>
            <h2 className="text-2xl font-bold">🌐 Federation Hub</h2>
            <p className="text-sm text-white/50 mt-1">
              {ecoEntries.length} ecosystem services • {services.length} connected
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm">
            {message}
            <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          {(['ecosystem', 'connected', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {t === 'ecosystem' ? '🏛️ Ecosystem Map' : t === 'connected' ? '🔗 Connected' : '➕ Register'}
            </button>
          ))}
        </div>

        {/* Ecosystem Map */}
        {tab === 'ecosystem' && (
          <div>
            {/* Type filter */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-purple-600' : 'bg-white/10'}`}
              >
                All ({ecoEntries.length})
              </button>
              {types.map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1 rounded text-sm ${filter === t ? 'bg-purple-600' : 'bg-white/10'}`}
                >
                  {TYPE_ICONS[t] || '📦'} {t} ({ecoEntries.filter(([, s]) => s.type === t).length})
                </button>
              ))}
            </div>

            {/* Service Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map(([name, svc]) => (
                <div key={name} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{TYPE_ICONS[svc.type] || '📦'}</span>
                    <div>
                      <p className="font-medium text-sm">{name}</p>
                      <p className="text-xs text-white/40">{svc.type}</p>
                    </div>
                    <div className={`ml-auto w-2 h-2 rounded-full ${STATUS_COLORS[svc.status] || STATUS_COLORS.unknown}`} />
                  </div>
                  <p className="text-xs text-white/60 mb-3">{svc.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {svc.capabilities.slice(0, 4).map(cap => (
                      <span key={cap} className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/50">
                        {cap}
                      </span>
                    ))}
                    {svc.capabilities.length > 4 && (
                      <span className="px-2 py-0.5 text-xs text-white/30">
                        +{svc.capabilities.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Services */}
        {tab === 'connected' && (
          <div className="space-y-3">
            {services.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔗</div>
                <p className="text-lg text-white/70">No services connected</p>
                <p className="text-sm text-white/40 mt-2">Register a service to connect it to the federation</p>
              </div>
            ) : (
              services.map(svc => (
                <div key={svc.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{TYPE_ICONS[svc.service_type] || '📦'}</span>
                      <div>
                        <p className="font-medium">{svc.name}</p>
                        <p className="text-xs text-white/40">{svc.endpoint_url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[svc.status] || STATUS_COLORS.unknown}`} />
                      <span className="text-xs text-white/50">{svc.status}</span>
                      <button
                        onClick={() => handleHealthCheck(svc.id)}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs"
                      >
                        Check
                      </button>
                    </div>
                  </div>
                  {svc.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {svc.capabilities.map(cap => (
                        <span key={cap} className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/50">
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Register Service */}
        {tab === 'register' && (
          <div className="max-w-lg space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Service Name</label>
              <input
                value={regForm.name}
                onChange={e => setRegForm({...regForm, name: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="e.g. norman-ai"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Type</label>
              <select
                value={regForm.service_type}
                onChange={e => setRegForm({...regForm, service_type: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
              >
                <option value="agent" className="bg-slate-800">🤖 Agent</option>
                <option value="space" className="bg-slate-800">🏛️ Space</option>
                <option value="external" className="bg-slate-800">🔗 External</option>
                <option value="ml" className="bg-slate-800">🧠 ML Service</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Endpoint URL</label>
              <input
                value={regForm.endpoint_url}
                onChange={e => setRegForm({...regForm, endpoint_url: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="https://service.example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Capabilities (comma-separated)</label>
              <input
                value={regForm.capabilities}
                onChange={e => setRegForm({...regForm, capabilities: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                placeholder="e.g. security:scan, threat:detect"
              />
            </div>
            <button
              onClick={handleRegister}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
            >
              Register Service
            </button>
          </div>
        )}
      </div>
    </div>
  );
}