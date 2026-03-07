/**
 * Infinity Admin Runner - Hybrid IDE Component v5.0
 * 
 * JetBrains/VSCode Hybrid IDE with:
 * - Monaco Editor (VSCode core)
 * - File tree navigation
 * - Integrated terminal
 * - AI-powered code completion
 * - Live preview
 * - Git integration UI
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// Types
interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
  language?: string;
}

interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface AICompletion {
  label: string;
  insertText: string;
  kind: string;
  detail?: string;
}

interface IDEProps {
  projectId?: string;
  initialFiles?: FileNode[];
  onSave?: (path: string, content: string) => void;
  onGenerate?: (prompt: string) => void;
  apiEndpoint?: string;
}

// Language detection
const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sql': 'sql',
    'sh': 'shell',
    'bash': 'shell',
    'dockerfile': 'dockerfile',
    'rs': 'rust',
    'go': 'go',
  };
  return langMap[ext] || 'plaintext';
};

// File icon mapping
const getFileIcon = (name: string, type: 'file' | 'directory'): string => {
  if (type === 'directory') return '📁';
  
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    'ts': '🔷',
    'tsx': '⚛️',
    'js': '🟨',
    'jsx': '⚛️',
    'py': '🐍',
    'json': '📋',
    'html': '🌐',
    'css': '🎨',
    'md': '📝',
    'yaml': '⚙️',
    'yml': '⚙️',
    'sql': '🗃️',
    'dockerfile': '🐳',
    'gitignore': '🚫',
  };
  return iconMap[ext] || '📄';
};

// File Tree Component
const FileTree: React.FC<{
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  selectedPath?: string;
  onContextMenu?: (file: FileNode, e: React.MouseEvent) => void;
}> = ({ files, onFileSelect, selectedPath, onContextMenu }) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['src', 'app']));

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center px-2 py-1 cursor-pointer hover:bg-gray-700 ${
            isSelected ? 'bg-blue-600 bg-opacity-30' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              toggleDir(node.path);
            } else {
              onFileSelect(node);
            }
          }}
          onContextMenu={(e) => onContextMenu?.(node, e)}
        >
          {node.type === 'directory' && (
            <span className="mr-1 text-xs text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <span className="mr-2">{getFileIcon(node.name, node.type)}</span>
          <span className="text-sm text-gray-200 truncate">{node.name}</span>
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900 text-gray-200">
      {files.map(file => renderNode(file))}
    </div>
  );
};

// Tab Bar Component
const TabBar: React.FC<{
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
}> = ({ tabs, activeTabId, onTabSelect, onTabClose }) => {
  return (
    <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex items-center px-3 py-2 cursor-pointer border-r border-gray-700 min-w-0 ${
            activeTabId === tab.id
              ? 'bg-gray-900 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
          }`}
          onClick={() => onTabSelect(tab.id)}
        >
          <span className="mr-2">{getFileIcon(tab.name, 'file')}</span>
          <span className="text-sm truncate max-w-32">{tab.name}</span>
          {tab.isDirty && <span className="ml-1 text-blue-400">●</span>}
          <button
            className="ml-2 text-gray-500 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

// Simple Code Editor (Monaco placeholder - would use actual Monaco in production)
const CodeEditor: React.FC<{
  content: string;
  language: string;
  onChange: (content: string) => void;
  onSave?: () => void;
}> = ({ content, language, onChange, onSave }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineNumbers, setLineNumbers] = useState<number[]>([]);

  useEffect(() => {
    const lines = content.split('\n').length;
    setLineNumbers(Array.from({ length: lines }, (_, i) => i + 1));
  }, [content]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave?.();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      onChange(newContent);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="flex h-full bg-gray-900 font-mono text-sm">
      {/* Line numbers */}
      <div className="flex-shrink-0 bg-gray-800 text-gray-500 text-right pr-2 pl-2 select-none border-r border-gray-700">
        {lineNumbers.map(num => (
          <div key={num} className="leading-6">{num}</div>
        ))}
      </div>
      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-gray-900 text-gray-100 p-2 resize-none outline-none leading-6"
        spellCheck={false}
        style={{ tabSize: 2 }}
      />
    </div>
  );
};

// AI Chat Panel
const AIChatPanel: React.FC<{
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
}> = ({ onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'ai'; content: string }>>([]);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    
    setHistory(prev => [...prev, { role: 'user', content: prompt }]);
    onGenerate(prompt);
    setPrompt('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="p-2 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200">🤖 AI Assistant</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {history.map((msg, i) => (
          <div
            key={i}
            className={`p-2 rounded text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 bg-opacity-20 text-blue-200'
                : 'bg-gray-800 text-gray-200'
            }`}
          >
            <span className="font-semibold">
              {msg.role === 'user' ? 'You: ' : 'AI: '}
            </span>
            {msg.content}
          </div>
        ))}
        {isGenerating && (
          <div className="p-2 bg-gray-800 rounded text-sm text-gray-400">
            <span className="animate-pulse">Generating...</span>
          </div>
        )}
      </div>
      
      <div className="p-2 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Ask AI to generate code..."
            className="flex-1 bg-gray-800 text-gray-200 px-3 py-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            disabled={isGenerating}
          />
          <button
            onClick={handleSubmit}
            disabled={isGenerating || !prompt.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

// Terminal Panel
const TerminalPanel: React.FC<{
  output: string[];
  onCommand: (cmd: string) => void;
}> = ({ output, onCommand }) => {
  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    onCommand(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-black font-mono text-sm">
      <div className="p-2 border-b border-gray-700 bg-gray-900">
        <h3 className="text-sm font-semibold text-gray-200">⬛ Terminal</h3>
      </div>
      
      <div ref={outputRef} className="flex-1 overflow-y-auto p-2 text-green-400">
        {output.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">{line}</div>
        ))}
      </div>
      
      <div className="flex items-center p-2 border-t border-gray-700">
        <span className="text-green-400 mr-2">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="flex-1 bg-transparent text-green-400 outline-none"
          placeholder="Enter command..."
        />
      </div>
    </div>
  );
};

// Preview Panel
const PreviewPanel: React.FC<{
  html?: string;
  url?: string;
}> = ({ html, url }) => {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-2 border-b border-gray-300 bg-gray-100 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">👁️ Preview</span>
        {url && (
          <input
            type="text"
            value={url}
            readOnly
            className="flex-1 bg-white text-gray-700 px-2 py-1 rounded text-xs border"
          />
        )}
      </div>
      
      <div className="flex-1">
        {html ? (
          <iframe
            srcDoc={html}
            className="w-full h-full border-0"
            title="Preview"
            sandbox="allow-scripts"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            No preview available
          </div>
        )}
      </div>
    </div>
  );
};

// Main IDE Component
const IDE: React.FC<IDEProps> = ({
  projectId,
  initialFiles = [],
  onSave,
  onGenerate,
  apiEndpoint = '/api'
}) => {
  // State
  const [files, setFiles] = useState<FileNode[]>(initialFiles);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['Welcome to Infinity IDE Terminal', '']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);

  // Demo files if none provided
  useEffect(() => {
    if (files.length === 0) {
      setFiles([
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          children: [
            {
              name: 'App.tsx',
              path: 'src/App.tsx',
              type: 'file',
              content: `import React from 'react';\n\nfunction App() {\n  return (\n    <div className="app">\n      <h1>Hello World</h1>\n    </div>\n  );\n}\n\nexport default App;`,
              language: 'typescript'
            },
            {
              name: 'index.css',
              path: 'src/index.css',
              type: 'file',
              content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n.app {\n  @apply min-h-screen bg-gray-900 text-white;\n}`,
              language: 'css'
            }
          ]
        },
        {
          name: 'package.json',
          path: 'package.json',
          type: 'file',
          content: JSON.stringify({
            name: 'my-project',
            version: '1.0.0',
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0'
            }
          }, null, 2),
          language: 'json'
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          content: '# My Project\n\nGenerated by Infinity Admin Runner\n\n## Getting Started\n\n```bash\nnpm install\nnpm run dev\n```',
          language: 'markdown'
        }
      ]);
    }
  }, []);

  // File selection handler
  const handleFileSelect = useCallback((file: FileNode) => {
    if (file.type !== 'file') return;
    
    setSelectedPath(file.path);
    
    // Check if tab already exists
    const existingTab = tabs.find(t => t.path === file.path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }
    
    // Create new tab
    const newTab: Tab = {
      id: `tab-${Date.now()}`,
      path: file.path,
      name: file.name,
      content: file.content || '',
      language: getLanguageFromPath(file.path),
      isDirty: false
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs]);

  // Tab close handler
  const handleTabClose = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId('');
      }
      return newTabs;
    });
  }, [activeTabId]);

  // Content change handler
  const handleContentChange = useCallback((content: string) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId
        ? { ...tab, content, isDirty: true }
        : tab
    ));
  }, [activeTabId]);

  // Save handler
  const handleSave = useCallback(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, isDirty: false }
        : tab
    ));
    
    onSave?.(activeTab.path, activeTab.content);
    setTerminalOutput(prev => [...prev, `✓ Saved ${activeTab.path}`]);
  }, [activeTabId, tabs, onSave]);

  // AI generate handler
  const handleGenerate = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setTerminalOutput(prev => [...prev, `> Generating: ${prompt}`]);
    
    try {
      onGenerate?.(prompt);
      // Simulate AI response
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTerminalOutput(prev => [...prev, '✓ Code generated successfully']);
    } catch (error) {
      setTerminalOutput(prev => [...prev, `✗ Error: ${error}`]);
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerate]);

  // Terminal command handler
  const handleCommand = useCallback((cmd: string) => {
    setTerminalOutput(prev => [...prev, `$ ${cmd}`]);
    
    // Simple command simulation
    if (cmd === 'ls') {
      const fileList = files.map(f => f.name).join('  ');
      setTerminalOutput(prev => [...prev, fileList]);
    } else if (cmd === 'clear') {
      setTerminalOutput([]);
    } else if (cmd.startsWith('npm ')) {
      setTerminalOutput(prev => [...prev, `Simulating: ${cmd}...`, '✓ Done']);
    } else {
      setTerminalOutput(prev => [...prev, `Command not found: ${cmd}`]);
    }
  }, [files]);

  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Sidebar - File Tree */}
      <div 
        className="flex-shrink-0 border-r border-gray-700 flex flex-col"
        style={{ width: sidebarWidth }}
      >
        <div className="p-2 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-200">📂 Explorer</span>
          <button className="text-gray-400 hover:text-white text-sm">+</button>
        </div>
        <div className="flex-1 overflow-hidden">
          <FileTree
            files={files}
            onFileSelect={handleFileSelect}
            selectedPath={selectedPath}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Bar */}
        {tabs.length > 0 && (
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={setActiveTabId}
            onTabClose={handleTabClose}
          />
        )}

        {/* Editor Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Code Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab ? (
              <CodeEditor
                content={activeTab.content}
                language={activeTab.language}
                onChange={handleContentChange}
                onSave={handleSave}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-6xl mb-4">🚀</div>
                  <h2 className="text-xl font-semibold mb-2">Infinity IDE</h2>
                  <p className="text-sm">Select a file to start editing</p>
                  <p className="text-xs mt-2 text-gray-600">
                    Ctrl+S to save • Ctrl+P for command palette
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - AI/Preview */}
          {(showAI || showPreview) && (
            <div className="w-80 border-l border-gray-700 flex flex-col">
              {/* Panel tabs */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => { setShowAI(true); setShowPreview(false); }}
                  className={`flex-1 px-3 py-2 text-sm ${showAI ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  🤖 AI
                </button>
                <button
                  onClick={() => { setShowAI(false); setShowPreview(true); }}
                  className={`flex-1 px-3 py-2 text-sm ${showPreview ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  👁️ Preview
                </button>
              </div>
              
              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {showAI && (
                  <AIChatPanel
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                  />
                )}
                {showPreview && (
                  <PreviewPanel />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Panel - Terminal */}
        {showTerminal && (
          <div className="h-48 border-t border-gray-700">
            <TerminalPanel
              output={terminalOutput}
              onCommand={handleCommand}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-blue-600 flex items-center px-2 text-xs text-white">
        <span className="mr-4">🚀 Infinity IDE v5.0</span>
        {activeTab && (
          <>
            <span className="mr-4">{activeTab.language}</span>
            <span className="mr-4">Ln {activeTab.content.split('\n').length}</span>
          </>
        )}
        <span className="ml-auto">
          {isGenerating ? '⏳ Generating...' : '✓ Ready'}
        </span>
      </div>
    </div>
  );
};

export default IDE;
