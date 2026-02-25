/**
 * FileManager — Virtual filesystem browser
 * Connects to /api/v1/files backend router
 */
import React, { useState, useEffect, useCallback } from 'react';

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: string;
  size_bytes: number;
  version: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface FileVersion {
  id: string;
  version_number: number;
  size_bytes: number;
  created_at: string;
  created_by: string;
}

type ViewMode = 'grid' | 'list';

export default function FileManager() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'directory'>('file');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = localStorage.getItem('infinity_access_token');
  const apiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/files?path=${encodeURIComponent(currentPath)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : data.files || []);
      }
    } catch (e) {
      setError('Failed to load files');
    }
    setLoading(false);
  }, [currentPath]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const openFile = async (file: FileNode) => {
    setSelectedFile(file);
    if (file.type === 'directory') {
      setCurrentPath(file.path);
      setSelectedFile(null);
    } else {
      try {
        const res = await fetch(`${apiUrl}/api/v1/files/${file.id}/content`, { headers });
        if (res.ok) {
          const data = await res.json();
          setFileContent(data.content || '');
        }
        const vRes = await fetch(`${apiUrl}/api/v1/files/${file.id}/versions`, { headers });
        if (vRes.ok) {
          const vData = await vRes.json();
          setVersions(vData.versions || []);
        }
      } catch (e) {
        setError('Failed to load file');
      }
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/files/${selectedFile.id}/content`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: fileContent }),
      });
      if (res.ok) {
        setEditing(false);
        fetchFiles();
      }
    } catch (e) {
      setError('Failed to save file');
    }
  };

  const createItem = async () => {
    if (!newItemName.trim()) return;
    const path = currentPath === '/' ? `/${newItemName}` : `${currentPath}/${newItemName}`;
    try {
      const res = await fetch(`${apiUrl}/api/v1/files`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newItemName, path, type: newItemType }),
      });
      if (res.ok) {
        setShowNewDialog(false);
        setNewItemName('');
        fetchFiles();
      }
    } catch (e) {
      setError('Failed to create item');
    }
  };

  const deleteFile = async (file: FileNode) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await fetch(`${apiUrl}/api/v1/files/${file.id}`, { method: 'DELETE', headers });
      fetchFiles();
      if (selectedFile?.id === file.id) setSelectedFile(null);
    } catch (e) {
      setError('Failed to delete');
    }
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath('/' + parts.join('/'));
    setSelectedFile(null);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const getIcon = (type: string, name: string) => {
    if (type === 'directory') return '📁';
    if (name.endsWith('.md')) return '📝';
    if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js')) return '⚡';
    if (name.endsWith('.py')) return '🐍';
    if (name.endsWith('.json')) return '📋';
    if (name.endsWith('.css')) return '🎨';
    if (name.endsWith('.html')) return '🌐';
    if (name.match(/\.(png|jpg|gif|svg|webp)$/)) return '🖼️';
    return '📄';
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full bg-slate-900 text-white">
      {/* Sidebar / File List */}
      <div className={`${selectedFile && selectedFile.type !== 'directory' ? 'w-1/3 border-r border-white/10' : 'w-full'} flex flex-col`}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-slate-800/50">
          <button onClick={navigateUp} disabled={currentPath === '/'} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 text-sm">
            ⬆️ Up
          </button>
          <div className="flex items-center gap-1 text-sm text-white/50 flex-1 min-w-0">
            <span className="cursor-pointer hover:text-white" onClick={() => { setCurrentPath('/'); setSelectedFile(null); }}>🏠</span>
            {breadcrumbs.map((part, i) => (
              <React.Fragment key={i}>
                <span className="text-white/30">/</span>
                <span className="cursor-pointer hover:text-white truncate" onClick={() => {
                  setCurrentPath('/' + breadcrumbs.slice(0, i + 1).join('/'));
                  setSelectedFile(null);
                }}>{part}</span>
              </React.Fragment>
            ))}
          </div>
          <button onClick={() => setShowNewDialog(true)} className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-sm">+ New</button>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-sm">
            {viewMode === 'grid' ? '☰' : '⊞'}
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-white/10">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center text-white/30 py-12">
              <div className="text-4xl mb-2">📂</div>
              <p>Empty directory</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-2">
              {files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                <div
                  key={file.id}
                  className={`p-3 rounded-lg cursor-pointer text-center hover:bg-white/5 transition ${selectedFile?.id === file.id ? 'bg-purple-500/20 ring-1 ring-purple-500' : ''}`}
                  onClick={() => openFile(file)}
                  onContextMenu={(e) => { e.preventDefault(); deleteFile(file); }}
                >
                  <div className="text-3xl mb-1">{getIcon(file.type, file.name)}</div>
                  <div className="text-xs truncate">{file.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(file => (
                <div
                  key={file.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer hover:bg-white/5 ${selectedFile?.id === file.id ? 'bg-purple-500/20' : ''}`}
                  onClick={() => openFile(file)}
                >
                  <span>{getIcon(file.type, file.name)}</span>
                  <span className="flex-1 text-sm truncate">{file.name}</span>
                  <span className="text-xs text-white/30">{formatSize(file.size_bytes)}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteFile(file); }} className="text-xs text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File Preview / Editor */}
      {selectedFile && selectedFile.type !== 'directory' && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-white/10 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span>{getIcon(selectedFile.type, selectedFile.name)}</span>
              <span className="font-medium text-sm">{selectedFile.name}</span>
              <span className="text-xs text-white/30">v{selectedFile.version}</span>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button onClick={saveFile} className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-sm">💾 Save</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-sm">Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-sm">✏️ Edit</button>
              )}
              <button onClick={() => { setSelectedFile(null); setEditing(false); }} className="px-2 py-1 rounded hover:bg-white/10 text-sm">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {editing ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-full bg-slate-950 text-green-400 font-mono text-sm p-4 rounded border border-white/10 focus:outline-none focus:border-purple-500 resize-none"
              />
            ) : (
              <pre className="text-sm font-mono text-white/80 whitespace-pre-wrap">{fileContent || '(empty file)'}</pre>
            )}
          </div>
          {/* Version History */}
          {versions.length > 0 && (
            <div className="border-t border-white/10 p-3 max-h-32 overflow-y-auto">
              <div className="text-xs text-white/40 mb-1">Version History</div>
              {versions.map(v => (
                <div key={v.id} className="flex items-center gap-2 text-xs text-white/50 py-0.5">
                  <span className="text-purple-400">v{v.version_number}</span>
                  <span>{formatSize(v.size_bytes)}</span>
                  <span>{new Date(v.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Item Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewDialog(false)}>
          <div className="bg-slate-800 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Create New</h3>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setNewItemType('file')} className={`flex-1 py-2 rounded text-sm ${newItemType === 'file' ? 'bg-purple-600' : 'bg-white/10'}`}>📄 File</button>
              <button onClick={() => setNewItemType('directory')} className={`flex-1 py-2 rounded text-sm ${newItemType === 'directory' ? 'bg-purple-600' : 'bg-white/10'}`}>📁 Folder</button>
            </div>
            <input
              type="text"
              placeholder="Name..."
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createItem()}
              className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm mb-4 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewDialog(false)} className="px-4 py-2 rounded bg-white/10 text-sm">Cancel</button>
              <button onClick={createItem} className="px-4 py-2 rounded bg-purple-600 text-sm">Create</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg" onClick={() => setError('')}>
          {error} ✕
        </div>
      )}
    </div>
  );
}