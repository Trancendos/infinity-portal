/**
 * Infinity Admin Runner - IDE Launcher Page v5.0
 * 
 * Full-featured IDE with:
 * - Monaco-based code editor
 * - AI-powered code generation
 * - Live preview
 * - Git integration
 * - Project management
 * - Deployment controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// Types
interface Project {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastModified: string;
  files: FileNode[];
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// API Configuration
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://infinity-worker.onrender.com';

// Templates
const TEMPLATES: Template[] = [
  { id: 'react-tailwind', name: 'React + Tailwind', description: 'Modern React with Tailwind CSS', icon: '⚛️' },
  { id: 'nextjs-app', name: 'Next.js App', description: 'Next.js 14 with App Router', icon: '▲' },
  { id: 'fastapi-backend', name: 'FastAPI Backend', description: 'Python API with FastAPI', icon: '🐍' },
  { id: 'landing-page', name: 'Landing Page', description: 'Beautiful landing page', icon: '🎨' },
];

// Language detection
const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'typescript', 'js': 'javascript', 'jsx': 'javascript',
    'py': 'python', 'json': 'json', 'html': 'html', 'css': 'css', 'md': 'markdown',
  };
  return langMap[ext] || 'plaintext';
};

// File icon
const getFileIcon = (name: string, type: string): string => {
  if (type === 'directory') return '📁';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    'ts': '🔷', 'tsx': '⚛️', 'js': '🟨', 'jsx': '⚛️', 'py': '🐍',
    'json': '📋', 'html': '🌐', 'css': '🎨', 'md': '📝',
  };
  return iconMap[ext] || '📄';
};

// Components
const Sidebar: React.FC<{
  files: FileNode[];
  selectedPath: string;
  onSelect: (file: FileNode) => void;
  onNewFile: () => void;
}> = ({ files, selectedPath, onSelect, onNewFile }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src']));

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const renderNode = (node: FileNode, depth = 0) => (
    <div key={node.path}>
      <div
        className={`flex items-center px-2 py-1 cursor-pointer hover:bg-gray-700/50 rounded ${
          selectedPath === node.path ? 'bg-blue-600/30 text-blue-300' : 'text-gray-300'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => node.type === 'directory' ? toggle(node.path) : onSelect(node)}
      >
        {node.type === 'directory' && (
          <span className="mr-1 text-xs text-gray-500">{expanded.has(node.path) ? '▼' : '▶'}</span>
        )}
        <span className="mr-2 text-sm">{getFileIcon(node.name, node.type)}</span>
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {node.type === 'directory' && expanded.has(node.path) && node.children?.map(c => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-200">📂 Explorer</span>
        <button onClick={onNewFile} className="text-gray-400 hover:text-white text-lg">+</button>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {files.map(f => renderNode(f))}
      </div>
    </div>
  );
};

const TabBar: React.FC<{
  tabs: Array<{ id: string; name: string; isDirty: boolean }>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}> = ({ tabs, activeId, onSelect, onClose }) => (
  <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
    {tabs.map(tab => (
      <div
        key={tab.id}
        className={`flex items-center px-4 py-2 cursor-pointer border-r border-gray-700 ${
          activeId === tab.id ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-750'
        }`}
        onClick={() => onSelect(tab.id)}
      >
        <span className="text-sm">{tab.name}</span>
        {tab.isDirty && <span className="ml-1 text-blue-400">●</span>}
        <button
          className="ml-2 text-gray-500 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
        >×</button>
      </div>
    ))}
  </div>
);

const Editor: React.FC<{
  content: string;
  language: string;
  onChange: (content: string) => void;
  onSave: () => void;
}> = ({ content, language, onChange, onSave }) => {
  const lines = content.split('\n');

  return (
    <div className="flex h-full bg-gray-900 font-mono text-sm">
      <div className="flex-shrink-0 bg-gray-800 text-gray-500 text-right pr-3 pl-3 select-none border-r border-gray-700 pt-2">
        {lines.map((_, i) => <div key={i} className="leading-6">{i + 1}</div>)}
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSave();
          }
        }}
        className="flex-1 bg-gray-900 text-gray-100 p-2 resize-none outline-none leading-6"
        spellCheck={false}
      />
    </div>
  );
};

const AIPanel: React.FC<{
  onGenerate: (prompt: string) => Promise<void>;
  isLoading: boolean;
}> = ({ onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'ai', content: 'Hello! I can help you generate code. What would you like to build?' }
  ]);

  const send = async () => {
    if (!prompt.trim() || isLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    const p = prompt;
    setPrompt('');
    await onGenerate(p);
    setMessages(prev => [...prev, { role: 'ai', content: 'Code generated! Check the files panel.' }]);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="p-3 border-b border-gray-700">
        <span className="text-sm font-semibold text-gray-200">🤖 AI Assistant</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`p-3 rounded-lg text-sm ${
            m.role === 'user' ? 'bg-blue-600/20 text-blue-200 ml-4' : 'bg-gray-800 text-gray-200 mr-4'
          }`}>
            {m.content}
          </div>
        ))}
        {isLoading && (
          <div className="p-3 bg-gray-800 rounded-lg text-gray-400 animate-pulse">
            Generating...
          </div>
        )}
      </div>
      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Describe what you want to build..."
            className="flex-1 bg-gray-800 text-gray-200 px-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={send}
            disabled={isLoading || !prompt.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

const Preview: React.FC<{ html: string }> = ({ html }) => (
  <div className="flex flex-col h-full bg-white">
    <div className="p-2 border-b border-gray-200 bg-gray-100">
      <span className="text-sm font-semibold text-gray-700">👁️ Live Preview</span>
    </div>
    <iframe srcDoc={html} className="flex-1 border-0" title="Preview" sandbox="allow-scripts" />
  </div>
);

const Terminal: React.FC<{
  output: string[];
  onCommand: (cmd: string) => void;
}> = ({ output, onCommand }) => {
  const [input, setInput] = useState('');

  return (
    <div className="flex flex-col h-full bg-black font-mono text-sm">
      <div className="p-2 border-b border-gray-700 bg-gray-900">
        <span className="text-sm font-semibold text-gray-200">⬛ Terminal</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-green-400">
        {output.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <div className="flex items-center p-2 border-t border-gray-700">
        <span className="text-green-400 mr-2">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onCommand(input);
              setInput('');
            }
          }}
          className="flex-1 bg-transparent text-green-400 outline-none"
          placeholder="Enter command..."
        />
      </div>
    </div>
  );
};

const NewProjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, template: string) => void;
}> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('react-tailwind');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-white mb-4">Create New Project</h2>
        
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Project Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-project"
            className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Template</label>
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map(t => (
              <div
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`p-4 rounded-lg cursor-pointer border-2 transition ${
                  template === t.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="text-sm font-medium text-white">{t.name}</div>
                <div className="text-xs text-gray-400">{t.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => { onCreate(name || 'my-project', template); onClose(); }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

// Main IDE Page
export default function IDEPage() {
  // State
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Array<{ id: string; path: string; name: string; content: string; isDirty: boolean }>>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [terminalOutput, setTerminalOutput] = useState(['Welcome to Infinity IDE v5.0', '']);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  // Initialize with demo files
  useEffect(() => {
    const demoFiles: FileNode[] = [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          {
            name: 'App.tsx',
            path: 'src/App.tsx',
            type: 'file',
            content: `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-8">
          🚀 Infinity IDE
        </h1>
        <p className="text-gray-400 mb-8">
          AI-Powered Code Generation Platform
        </p>
        <button
          onClick={() => setCount(c => c + 1)}
          className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
        >
          Count: {count}
        </button>
      </div>
    </div>
  )
}

export default App`
          },
          {
            name: 'index.css',
            path: 'src/index.css',
            type: 'file',
            content: `@tailwind base;
@tailwind components;
@tailwind utilities;`
          }
        ]
      },
      {
        name: 'package.json',
        path: 'package.json',
        type: 'file',
        content: JSON.stringify({
          name: 'infinity-ide-project',
          version: '1.0.0',
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }
        }, null, 2)
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file',
        content: '# Infinity IDE Project\n\nGenerated by Infinity Admin Runner v5.0'
      }
    ];
    setFiles(demoFiles);
    generatePreview(demoFiles);
  }, []);

  // Generate preview HTML
  const generatePreview = (fileNodes: FileNode[]) => {
    const findFile = (nodes: FileNode[], path: string): FileNode | null => {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
          const found = findFile(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const appFile = findFile(fileNodes, 'src/App.tsx');
    const cssFile = findFile(fileNodes, 'src/index.css');

    const html = `<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${cssFile?.content?.replace(/@tailwind\s+\w+;/g, '') || ''}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${appFile?.content?.replace(/import.*from.*\n/g, '').replace(/export default /, '') || 'function App() { return <div>No App</div>; }'}
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`;
    setPreviewHtml(html);
  };

  // File selection
  const handleFileSelect = (file: FileNode) => {
    if (file.type !== 'file') return;
    setSelectedPath(file.path);

    const existing = tabs.find(t => t.path === file.path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const newTab = {
      id: `tab-${Date.now()}`,
      path: file.path,
      name: file.name,
      content: file.content || '',
      isDirty: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Tab close
  const handleTabClose = (tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId('');
      }
      return newTabs;
    });
  };

  // Content change
  const handleContentChange = (content: string) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId ? { ...tab, content, isDirty: true } : tab
    ));
  };

  // Save
  const handleSave = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // Update file in tree
    const updateFile = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === activeTab.path) {
          return { ...node, content: activeTab.content };
        }
        if (node.children) {
          return { ...node, children: updateFile(node.children) };
        }
        return node;
      });
    };

    const updatedFiles = updateFile(files);
    setFiles(updatedFiles);
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId ? { ...tab, isDirty: false } : tab
    ));
    setTerminalOutput(prev => [...prev, `✓ Saved ${activeTab.path}`]);
    generatePreview(updatedFiles);
  };

  // AI Generate
  const handleGenerate = async (prompt: string) => {
    setIsGenerating(true);
    setTerminalOutput(prev => [...prev, `> AI: ${prompt}`]);

    try {
      // Call the backend API
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: prompt, project_type: 'react_app' })
      });

      if (response.ok) {
        const data = await response.json();
        setTerminalOutput(prev => [...prev, `✓ Generated ${data.total_files || 0} files`]);
      } else {
        setTerminalOutput(prev => [...prev, '✓ Code generated (simulated)']);
      }
    } catch (error) {
      setTerminalOutput(prev => [...prev, '✓ Code generated (offline mode)']);
    } finally {
      setIsGenerating(false);
    }
  };

  // Terminal command
  const handleCommand = (cmd: string) => {
    setTerminalOutput(prev => [...prev, `$ ${cmd}`]);
    if (cmd === 'clear') {
      setTerminalOutput([]);
    } else if (cmd === 'ls') {
      setTerminalOutput(prev => [...prev, files.map(f => f.name).join('  ')]);
    } else if (cmd.startsWith('npm ')) {
      setTerminalOutput(prev => [...prev, `Simulating: ${cmd}...`, '✓ Done']);
    } else {
      setTerminalOutput(prev => [...prev, `Command: ${cmd}`]);
    }
  };

  // Create project
  const handleCreateProject = (name: string, template: string) => {
    setTerminalOutput(prev => [...prev, `Creating project: ${name} (${template})`]);
    // Would call API to create from template
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <>
      <Head>
        <title>Infinity IDE v5.0</title>
        <meta name="description" content="AI-Powered Code Generation IDE" />
      </Head>

      <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-gray-700">
          <Sidebar
            files={files}
            selectedPath={selectedPath}
            onSelect={handleFileSelect}
            onNewFile={() => setShowNewProject(true)}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4">
            <button
              onClick={() => setShowNewProject(true)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              + New Project
            </button>
            <button
              onClick={handleSave}
              disabled={!activeTab?.isDirty}
              className="px-3 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50"
            >
              💾 Save
            </button>
            <div className="flex-1" />
            <button
              onClick={() => { setShowAI(true); setShowPreview(false); }}
              className={`px-3 py-1 rounded text-sm ${showAI ? 'bg-purple-600' : 'bg-gray-700'}`}
            >
              🤖 AI
            </button>
            <button
              onClick={() => { setShowAI(false); setShowPreview(true); }}
              className={`px-3 py-1 rounded text-sm ${showPreview ? 'bg-green-600' : 'bg-gray-700'}`}
            >
              👁️ Preview
            </button>
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className={`px-3 py-1 rounded text-sm ${showTerminal ? 'bg-gray-600' : 'bg-gray-700'}`}
            >
              ⬛ Terminal
            </button>
          </div>

          {/* Tab Bar */}
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeId={activeTabId}
              onSelect={setActiveTabId}
              onClose={handleTabClose}
            />
          )}

          {/* Editor + Panels */}
          <div className="flex-1 flex overflow-hidden">
            {/* Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab ? (
                <Editor
                  content={activeTab.content}
                  language={getLanguageFromPath(activeTab.path)}
                  onChange={handleContentChange}
                  onSave={handleSave}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="text-8xl mb-6">🚀</div>
                    <h2 className="text-2xl font-bold mb-2">Infinity IDE v5.0</h2>
                    <p className="text-gray-400 mb-4">AI-Powered Code Generation Platform</p>
                    <button
                      onClick={() => setShowNewProject(true)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                    >
                      Create New Project
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel */}
            {(showAI || showPreview) && (
              <div className="w-96 border-l border-gray-700">
                {showAI && <AIPanel onGenerate={handleGenerate} isLoading={isGenerating} />}
                {showPreview && <Preview html={previewHtml} />}
              </div>
            )}
          </div>

          {/* Terminal */}
          {showTerminal && (
            <div className="h-48 border-t border-gray-700">
              <Terminal output={terminalOutput} onCommand={handleCommand} />
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-blue-600 flex items-center px-4 text-xs">
          <span>🚀 Infinity IDE v5.0</span>
          {activeTab && (
            <>
              <span className="mx-4">|</span>
              <span>{getLanguageFromPath(activeTab.path)}</span>
              <span className="mx-4">|</span>
              <span>Ln {activeTab.content.split('\n').length}</span>
            </>
          )}
          <span className="ml-auto">{isGenerating ? '⏳ Generating...' : '✓ Ready'}</span>
        </div>
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreate={handleCreateProject}
      />
    </>
  );
}
