/**
 * RepositoryManager — Internal Git hosting with GitHub sync
 */
import React, { useState, useEffect } from 'react';
import { useRepos } from '../providers/BackendProvider';

interface Repo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  default_branch: string;
  github_remote_url: string | null;
  github_sync_enabled: boolean;
  commit_count: number;
  branch_count: number;
  topics: string[];
  is_archived: boolean;
  created_at: string;
}

interface FileEntry {
  name: string;
  path: string;
  type: string;
  size: number | null;
}

export default function RepositoryManager() {
  const {
    list, create, get, update, delete: deleteRepo,
    getCommits, getBranches, getTree, getBlob,
    configureGitHub, pushToGitHub, pullFromGitHub,
  } = useRepos();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [tab, setTab] = useState<'files' | 'commits' | 'branches' | 'settings'>('files');
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState('');
  const [commits, setCommits] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', visibility: 'private' });
  const [githubUrl, setGithubUrl] = useState('');

  useEffect(() => { loadRepos(); }, []);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await list();
      setRepos(Array.isArray(data) ? data : data.repositories || []);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const selectRepo = async (repo: Repo) => {
    setSelectedRepo(repo);
    setCurrentPath('');
    setFileContent(null);
    setViewingFile('');
    setTab('files');
    await loadTree(repo.id, '');
    setGithubUrl(repo.github_remote_url || '');
  };

  const loadTree = async (repoId: string, path: string) => {
    try {
      const data = await getTree(repoId, path);
      setFileTree(Array.isArray(data) ? data : data.entries || []);
      setCurrentPath(path);
      setFileContent(null);
      setViewingFile('');
    } catch (e: any) {
      setFileTree([]);
    }
  };

  const viewFile = async (path: string) => {
    if (!selectedRepo) return;
    try {
      const data = await getBlob(selectedRepo.id, path);
      setFileContent(typeof data === 'string' ? data : data.content || JSON.stringify(data, null, 2));
      setViewingFile(path);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const loadCommits = async () => {
    if (!selectedRepo) return;
    try {
      const data = await getCommits(selectedRepo.id);
      setCommits(Array.isArray(data) ? data : data.commits || []);
    } catch { setCommits([]); }
  };

  const loadBranches = async () => {
    if (!selectedRepo) return;
    try {
      const data = await getBranches(selectedRepo.id);
      setBranches(Array.isArray(data) ? data : data.branches || []);
    } catch { setBranches([]); }
  };

  const handleCreate = async () => {
    try {
      await create(createForm);
      setShowCreate(false);
      setCreateForm({ name: '', description: '', visibility: 'private' });
      setMessage('Repository created');
      loadRepos();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleGitHubSync = async (action: 'configure' | 'push' | 'pull') => {
    if (!selectedRepo) return;
    try {
      if (action === 'configure') {
        await configureGitHub(selectedRepo.id, githubUrl);
        setMessage('GitHub remote configured');
      } else if (action === 'push') {
        await pushToGitHub(selectedRepo.id);
        setMessage('Pushed to GitHub');
      } else {
        await pullFromGitHub(selectedRepo.id);
        setMessage('Pulled from GitHub');
      }
      loadRepos();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedRepo || !confirm(`Delete repository "${selectedRepo.name}"?`)) return;
    try {
      await deleteRepo(selectedRepo.id);
      setSelectedRepo(null);
      setMessage('Repository deleted');
      loadRepos();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  };

  const navigateUp = () => {
    if (!selectedRepo || !currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadTree(selectedRepo.id, parts.join('/'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white overflow-hidden flex">
      {/* Repo List Sidebar */}
      <div className="w-72 border-r border-white/10 overflow-auto shrink-0">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Repositories</h3>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
            >
              + New
            </button>
          </div>

          {showCreate && (
            <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10 space-y-2">
              <input
                value={createForm.name}
                onChange={e => setCreateForm({...createForm, name: e.target.value})}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                placeholder="Repository name"
              />
              <input
                value={createForm.description}
                onChange={e => setCreateForm({...createForm, description: e.target.value})}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                placeholder="Description"
              />
              <select
                value={createForm.visibility}
                onChange={e => setCreateForm({...createForm, visibility: e.target.value})}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
              >
                <option value="private" className="bg-slate-800">Private</option>
                <option value="internal" className="bg-slate-800">Internal</option>
                <option value="public" className="bg-slate-800">Public</option>
              </select>
              <button onClick={handleCreate} className="w-full py-2 bg-purple-600 rounded text-sm">
                Create
              </button>
            </div>
          )}

          <div className="space-y-1">
            {repos.map(repo => (
              <button
                key={repo.id}
                onClick={() => selectRepo(repo)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedRepo?.id === repo.id
                    ? 'bg-purple-500/20 border border-purple-500/50'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {repo.visibility === 'private' ? '🔒' : repo.visibility === 'internal' ? '🏢' : '🌐'}
                  </span>
                  <span className="font-medium text-sm truncate">{repo.name}</span>
                </div>
                {repo.description && (
                  <p className="text-xs text-white/40 mt-1 truncate">{repo.description}</p>
                )}
                <div className="flex gap-2 mt-1 text-xs text-white/30">
                  <span>{repo.commit_count} commits</span>
                  {repo.github_sync_enabled && <span>• ↔ GitHub</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {message && (
          <div className="m-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-sm">
            {message}
            <button onClick={() => setMessage('')} className="ml-2 text-white/50">✕</button>
          </div>
        )}

        {!selectedRepo ? (
          <div className="flex items-center justify-center h-full text-white/40">
            <div className="text-center">
              <div className="text-6xl mb-4">📦</div>
              <p className="text-lg">Select a repository or create a new one</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* Repo Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedRepo.name}</h2>
                <p className="text-sm text-white/50">{selectedRepo.description || 'No description'}</p>
              </div>
              <div className="flex gap-2">
                {selectedRepo.github_sync_enabled && (
                  <>
                    <button onClick={() => handleGitHubSync('push')} className="px-3 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded text-sm">
                      ↑ Push
                    </button>
                    <button onClick={() => handleGitHubSync('pull')} className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-sm">
                      ↓ Pull
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
              {(['files', 'commits', 'branches', 'settings'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    if (t === 'commits') loadCommits();
                    if (t === 'branches') loadBranches();
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    tab === t ? 'bg-purple-600 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {t === 'files' ? '📁 Files' : t === 'commits' ? '📝 Commits' :
                   t === 'branches' ? '🌿 Branches' : '⚙️ Settings'}
                </button>
              ))}
            </div>

            {/* Files Tab */}
            {tab === 'files' && (
              <div>
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 mb-3 text-sm">
                  <button onClick={() => loadTree(selectedRepo.id, '')} className="text-purple-400 hover:text-purple-300">
                    {selectedRepo.name}
                  </button>
                  {currentPath && currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                    <React.Fragment key={i}>
                      <span className="text-white/30">/</span>
                      <button
                        onClick={() => loadTree(selectedRepo.id, arr.slice(0, i + 1).join('/'))}
                        className="text-purple-400 hover:text-purple-300"
                      >
                        {part}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* File listing */}
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  {currentPath && (
                    <button
                      onClick={navigateUp}
                      className="w-full text-left px-4 py-2 bg-white/5 hover:bg-white/10 text-sm border-b border-white/10"
                    >
                      ← ..
                    </button>
                  )}
                  {fileTree.map(entry => (
                    <button
                      key={entry.path}
                      onClick={() => {
                        if (entry.type === 'directory') {
                          loadTree(selectedRepo.id, entry.path);
                        } else {
                          viewFile(entry.path);
                        }
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm border-b border-white/10 last:border-0 flex items-center gap-3"
                    >
                      <span>{entry.type === 'directory' ? '📁' : '📄'}</span>
                      <span className="flex-1">{entry.name}</span>
                      {entry.size != null && (
                        <span className="text-white/30 text-xs">{(entry.size / 1024).toFixed(1)}KB</span>
                      )}
                    </button>
                  ))}
                  {fileTree.length === 0 && (
                    <p className="px-4 py-8 text-center text-white/40 text-sm">Empty directory</p>
                  )}
                </div>

                {/* File viewer */}
                {fileContent !== null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono text-white/60">{viewingFile}</span>
                      <button onClick={() => { setFileContent(null); setViewingFile(''); }} className="text-white/50 text-sm">
                        ✕ Close
                      </button>
                    </div>
                    <pre className="p-4 bg-black/50 rounded-lg border border-white/10 text-sm font-mono text-green-300 overflow-auto max-h-96 whitespace-pre-wrap">
                      {fileContent}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Commits Tab */}
            {tab === 'commits' && (
              <div className="space-y-2">
                {commits.length === 0 ? (
                  <p className="text-center py-8 text-white/40">No commits yet</p>
                ) : (
                  commits.map((c, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{c.message}</p>
                        <span className="text-xs font-mono text-white/40">{c.sha?.slice(0, 7)}</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-white/40">
                        <span>{c.author}</span>
                        <span>{new Date(c.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Branches Tab */}
            {tab === 'branches' && (
              <div className="space-y-2">
                {branches.map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🌿</span>
                      <span className="font-medium text-sm">{b.name}</span>
                      {b.is_default && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">default</span>
                      )}
                    </div>
                    {b.last_commit_sha && (
                      <span className="text-xs font-mono text-white/40">{b.last_commit_sha.slice(0, 7)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Settings Tab */}
            {tab === 'settings' && (
              <div className="space-y-6 max-w-lg">
                {/* GitHub Sync */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <h4 className="font-medium mb-3">GitHub Sync</h4>
                  <div className="flex gap-2">
                    <input
                      value={githubUrl}
                      onChange={e => setGithubUrl(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                      placeholder="https://github.com/org/repo.git"
                    />
                    <button
                      onClick={() => handleGitHubSync('configure')}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
                    >
                      Configure
                    </button>
                  </div>
                  {selectedRepo.github_sync_enabled && (
                    <p className="text-xs text-green-400 mt-2">✓ Sync enabled: {selectedRepo.github_remote_url}</p>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                  <h4 className="font-medium text-red-300 mb-3">Danger Zone</h4>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
                  >
                    Delete Repository
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}