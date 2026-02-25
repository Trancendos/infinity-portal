/**
 * BuildManager — Multi-platform build & package system
 */
import React, { useState, useEffect } from 'react';
import { useBuilds, useRepos } from '../providers/BackendProvider';

interface Build {
  id: string;
  repository_id: string | null;
  target: string;
  status: string;
  artifact_url: string | null;
  artifact_size: number | null;
  error_message: string | null;
  duration_seconds: number | null;
  config: any;
  created_at: string;
  completed_at: string | null;
}

const TARGET_INFO: Record<string, { icon: string; label: string; description: string }> = {
  pwa: { icon: '📱', label: 'PWA', description: 'Progressive Web App — installable on any device' },
  android_apk: { icon: '🤖', label: 'Android APK', description: 'Android application package' },
  desktop_electron: { icon: '🖥️', label: 'Desktop (Electron)', description: 'Cross-platform desktop app' },
  desktop_tauri: { icon: '⚡', label: 'Desktop (Tauri)', description: 'Lightweight native desktop app' },
  docker: { icon: '🐳', label: 'Docker', description: 'Container image for server deployment' },
  npm_package: { icon: '📦', label: 'npm Package', description: 'Node.js package for distribution' },
  pip_package: { icon: '🐍', label: 'pip Package', description: 'Python package for distribution' },
};

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-500/20 text-gray-300',
  building: 'bg-blue-500/20 text-blue-300',
  success: 'bg-green-500/20 text-green-300',
  failed: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-yellow-500/20 text-yellow-300',
};

export default function BuildManager() {
  const { trigger, list: listBuilds, get: getBuild, cancel } = useBuilds();
  const { list: listRepos } = useRepos();

  const [builds, setBuilds] = useState<Build[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null);
  const [tab, setTab] = useState<'builds' | 'new'>('builds');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  // New build form
  const [buildForm, setBuildForm] = useState({
    repository_id: '',
    target: 'pwa',
    config: {} as any,
  });

  // PWA config
  const [pwaConfig, setPwaConfig] = useState({
    app_name: 'My App',
    theme_color: '#1a1a2e',
    background_color: '#1a1a2e',
  });

  // Docker config
  const [dockerConfig, setDockerConfig] = useState({
    base_image: 'node:20-alpine',
    port: 3000,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [buildsData, reposData] = await Promise.allSettled([
        listBuilds(50),
        listRepos(),
      ]);
      if (buildsData.status === 'fulfilled') {
        setBuilds(Array.isArray(buildsData.value) ? buildsData.value : buildsData.value.builds || []);
      }
      if (reposData.status === 'fulfilled') {
        setRepos(Array.isArray(reposData.value) ? reposData.value : reposData.value.repositories || []);
      }
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleTrigger = async () => {
    try {
      let config = {};
      if (buildForm.target === 'pwa') config = pwaConfig;
      else if (buildForm.target === 'docker') config = dockerConfig;

      await trigger({
        repository_id: buildForm.repository_id || undefined,
        target: buildForm.target,
        config,
      });
      setMessage('Build triggered successfully');
      setTab('builds');
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleCancel = async (buildId: string) => {
    try {
      await cancel(buildId);
      setMessage('Build cancelled');
      loadData();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
          <h2 className="text-2xl font-bold">🔨 Build & Package</h2>
          <button
            onClick={() => setTab(tab === 'new' ? 'builds' : 'new')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
          >
            {tab === 'new' ? '← Back to Builds' : '+ New Build'}
          </button>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm">
            {message}
            <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
          </div>
        )}

        {/* New Build */}
        {tab === 'new' && (
          <div className="max-w-2xl space-y-6">
            {/* Target Selection */}
            <div>
              <label className="block text-sm text-white/70 mb-3">Build Target</label>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(TARGET_INFO).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setBuildForm({...buildForm, target: key})}
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      buildForm.target === key
                        ? 'bg-purple-500/20 border-purple-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-2xl mb-2">{info.icon}</div>
                    <p className="font-medium text-sm">{info.label}</p>
                    <p className="text-xs text-white/40 mt-1">{info.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Repository Selection */}
            <div>
              <label className="block text-sm text-white/70 mb-1">Source Repository</label>
              <select
                value={buildForm.repository_id}
                onChange={e => setBuildForm({...buildForm, repository_id: e.target.value})}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
              >
                <option value="" className="bg-slate-800">Select repository...</option>
                {repos.map(r => (
                  <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>
                ))}
              </select>
            </div>

            {/* Target-specific config */}
            {buildForm.target === 'pwa' && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3">
                <h4 className="font-medium text-sm">PWA Configuration</h4>
                <input
                  value={pwaConfig.app_name}
                  onChange={e => setPwaConfig({...pwaConfig, app_name: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                  placeholder="App name"
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-white/50">Theme Color</label>
                    <input
                      type="color"
                      value={pwaConfig.theme_color}
                      onChange={e => setPwaConfig({...pwaConfig, theme_color: e.target.value})}
                      className="w-full h-10 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-white/50">Background</label>
                    <input
                      type="color"
                      value={pwaConfig.background_color}
                      onChange={e => setPwaConfig({...pwaConfig, background_color: e.target.value})}
                      className="w-full h-10 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {buildForm.target === 'docker' && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-3">
                <h4 className="font-medium text-sm">Docker Configuration</h4>
                <input
                  value={dockerConfig.base_image}
                  onChange={e => setDockerConfig({...dockerConfig, base_image: e.target.value})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                  placeholder="Base image"
                />
                <input
                  type="number"
                  value={dockerConfig.port}
                  onChange={e => setDockerConfig({...dockerConfig, port: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                  placeholder="Port"
                />
              </div>
            )}

            <button
              onClick={handleTrigger}
              className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
            >
              🚀 Start Build
            </button>
          </div>
        )}

        {/* Build History */}
        {tab === 'builds' && (
          <div className="space-y-3">
            {builds.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔨</div>
                <p className="text-lg text-white/70">No builds yet</p>
                <p className="text-sm text-white/40 mt-2">Create your first build to get started</p>
              </div>
            ) : (
              builds.map(build => {
                const info = TARGET_INFO[build.target] || { icon: '📦', label: build.target };
                return (
                  <div
                    key={build.id}
                    className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{info.icon}</span>
                        <div>
                          <p className="font-medium">{info.label}</p>
                          <p className="text-xs text-white/40">
                            {new Date(build.created_at).toLocaleString()}
                            {build.duration_seconds && ` • ${build.duration_seconds}s`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {build.artifact_size && (
                          <span className="text-xs text-white/40">{formatSize(build.artifact_size)}</span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[build.status] || ''}`}>
                          {build.status === 'building' && '⏳ '}
                          {build.status}
                        </span>
                        {(build.status === 'queued' || build.status === 'building') && (
                          <button
                            onClick={() => handleCancel(build.id)}
                            className="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded text-xs"
                          >
                            Cancel
                          </button>
                        )}
                        {build.artifact_url && (
                          <a
                            href={build.artifact_url}
                            className="px-3 py-1 bg-green-500/20 hover:bg-green-500/40 text-green-300 rounded text-xs"
                            download
                          >
                            ↓ Download
                          </a>
                        )}
                      </div>
                    </div>
                    {build.error_message && (
                      <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-300 font-mono">
                        {build.error_message}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}