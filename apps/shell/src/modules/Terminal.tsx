/**
 * Terminal — WebSocket-based terminal emulator
 * Provides a command-line interface within the OS shell
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface TermLine {
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE = `♾️  Infinity OS Terminal v3.0.0
Type 'help' for available commands.
──────────────────────────────────────`;

const HELP_TEXT = `Available commands:
  help              Show this help message
  clear             Clear terminal
  whoami            Show current user info
  env               Show environment info
  systems           List registered AI systems
  compliance        Show compliance dashboard
  hitl              Show pending HITL tasks
  audit [limit]     Show recent audit logs
  files [path]      List files in directory
  boards            List kanban boards
  repos             List repositories
  builds            List recent builds
  services          List federated services
  health            Check API health
  curl <url>        Make HTTP request (via backend)
  echo <text>       Echo text
  date              Show current date/time
  uptime            Show session uptime`;

export default function Terminal() {
  const [lines, setLines] = useState<TermLine[]>([
    { type: 'system', content: WELCOME_MESSAGE, timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cwd, setCwd] = useState('~');
  const [sessionStart] = useState(new Date());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const token = localStorage.getItem('infinity_access_token');
  const apiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const user = JSON.parse(localStorage.getItem('infinity_user') || '{}');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const addLine = useCallback((type: TermLine['type'], content: string) => {
    setLines(prev => [...prev, { type, content, timestamp: new Date() }]);
  }, []);

  const apiGet = async (path: string) => {
    try {
      const res = await fetch(`${apiUrl}${path}`, { headers });
      if (res.ok) return await res.json();
      return { error: `HTTP ${res.status}` };
    } catch (e) {
      return { error: 'Network error' };
    }
  };

  const executeCommand = async (cmd: string) => {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        addLine('output', HELP_TEXT);
        break;

      case 'clear':
        setLines([]);
        break;

      case 'whoami':
        addLine('output', `User: ${user.display_name || 'Unknown'}\nEmail: ${user.email || 'N/A'}\nRole: ${user.role || 'N/A'}\nOrg: ${user.organisation_id || 'N/A'}`);
        break;

      case 'env':
        addLine('output', `API: ${apiUrl}\nEnvironment: ${import.meta.env.MODE}\nVersion: 3.0.0\nPlatform: Infinity OS`);
        break;

      case 'health': {
        const data = await apiGet('/health');
        addLine('output', JSON.stringify(data, null, 2));
        break;
      }

      case 'systems': {
        const data = await apiGet('/api/v1/compliance/systems');
        if (data.error) { addLine('error', data.error); break; }
        const systems = data.systems || [];
        if (systems.length === 0) { addLine('output', 'No AI systems registered.'); break; }
        const table = systems.map((s: any) => `  ${s.name.padEnd(30)} ${s.risk_level.padEnd(15)} ${s.compliance_status}`).join('\n');
        addLine('output', `AI Systems (${systems.length}):\n${table}`);
        break;
      }

      case 'compliance': {
        const data = await apiGet('/api/v1/compliance/dashboard');
        if (data.error) { addLine('error', data.error); break; }
        addLine('output', `Compliance Dashboard:\n  Total Systems: ${data.total_systems}\n  Pending HITL: ${data.pending_hitl_tasks}\n  Audit Events (24h): ${data.audit_events_24h}\n  Systems with DPIA: ${data.systems_with_dpia}\n  Risk Breakdown: ${JSON.stringify(data.risk_breakdown)}`);
        break;
      }

      case 'hitl': {
        const data = await apiGet('/api/v1/ai/pending-reviews');
        if (data.error) { addLine('error', data.error); break; }
        const tasks = Array.isArray(data) ? data : [];
        if (tasks.length === 0) { addLine('output', 'No pending HITL tasks. ✅'); break; }
        const table = tasks.map((t: any) => `  [${t.risk_level}] ${t.system_name} — ${t.task_type} (${t.status})`).join('\n');
        addLine('output', `Pending Reviews (${tasks.length}):\n${table}`);
        break;
      }

      case 'audit': {
        const limit = parseInt(args[0]) || 10;
        const data = await apiGet(`/api/v1/compliance/audit-logs?limit=${limit}`);
        if (data.error) { addLine('error', data.error); break; }
        const logs = data.logs || [];
        if (logs.length === 0) { addLine('output', 'No audit logs found.'); break; }
        const table = logs.map((l: any) => `  ${l.timestamp?.slice(0, 19) || 'N/A'} ${(l.event_type || '').padEnd(25)} ${l.risk_level || '-'}`).join('\n');
        addLine('output', `Audit Logs (${logs.length}):\n${table}`);
        break;
      }

      case 'files': {
        const path = args[0] || '/';
        const data = await apiGet(`/api/v1/files?path=${encodeURIComponent(path)}`);
        if (data.error) { addLine('error', data.error); break; }
        const files = Array.isArray(data) ? data : data.files || [];
        if (files.length === 0) { addLine('output', `Empty directory: ${path}`); break; }
        const table = files.map((f: any) => `  ${f.type === 'directory' ? '📁' : '📄'} ${f.name.padEnd(30)} ${f.type.padEnd(10)}`).join('\n');
        addLine('output', `${path} (${files.length} items):\n${table}`);
        break;
      }

      case 'boards': {
        const data = await apiGet('/api/v1/kanban/boards');
        if (data.error) { addLine('error', data.error); break; }
        const boards = Array.isArray(data) ? data : [];
        if (boards.length === 0) { addLine('output', 'No kanban boards.'); break; }
        const table = boards.map((b: any) => `  📋 ${b.name.padEnd(30)} ${b.columns?.length || 0} columns`).join('\n');
        addLine('output', `Boards (${boards.length}):\n${table}`);
        break;
      }

      case 'repos': {
        const data = await apiGet('/api/v1/repos');
        if (data.error) { addLine('error', data.error); break; }
        const repos = Array.isArray(data) ? data : data.repositories || [];
        if (repos.length === 0) { addLine('output', 'No repositories.'); break; }
        const table = repos.map((r: any) => `  📦 ${r.name.padEnd(30)} ${r.visibility || 'private'}`).join('\n');
        addLine('output', `Repositories (${repos.length}):\n${table}`);
        break;
      }

      case 'builds': {
        const data = await apiGet('/api/v1/builds');
        if (data.error) { addLine('error', data.error); break; }
        const builds = Array.isArray(data) ? data : data.builds || [];
        if (builds.length === 0) { addLine('output', 'No builds.'); break; }
        const table = builds.map((b: any) => `  🔨 ${b.target.padEnd(15)} ${b.status.padEnd(12)} ${b.created_at?.slice(0, 19) || ''}`).join('\n');
        addLine('output', `Builds (${builds.length}):\n${table}`);
        break;
      }

      case 'services': {
        const data = await apiGet('/api/v1/federation/services');
        if (data.error) { addLine('error', data.error); break; }
        const services = Array.isArray(data) ? data : data.services || [];
        if (services.length === 0) { addLine('output', 'No federated services.'); break; }
        const table = services.map((s: any) => `  🌐 ${s.name.padEnd(25)} ${s.service_type.padEnd(12)} ${s.status}`).join('\n');
        addLine('output', `Services (${services.length}):\n${table}`);
        break;
      }

      case 'echo':
        addLine('output', args.join(' '));
        break;

      case 'date':
        addLine('output', new Date().toString());
        break;

      case 'uptime': {
        const ms = Date.now() - sessionStart.getTime();
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        addLine('output', `Session uptime: ${mins}m ${secs}s`);
        break;
      }

      case '':
        break;

      default:
        addLine('error', `Command not found: ${command}. Type 'help' for available commands.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && input !== '') return;

    const cmd = input.trim();
    if (cmd) {
      addLine('input', `${user.display_name || '$'}@infinity-os:${cwd}$ ${cmd}`);
      setHistory(prev => [cmd, ...prev].slice(0, 100));
      setHistoryIndex(-1);
      await executeCommand(cmd);
    }
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      if (history[newIndex]) setInput(history[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex >= 0 ? history[newIndex] : '');
    }
  };

  const getLineColor = (type: TermLine['type']) => {
    switch (type) {
      case 'input': return 'text-green-400';
      case 'output': return 'text-white/80';
      case 'error': return 'text-red-400';
      case 'system': return 'text-purple-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 font-mono text-sm" onClick={() => inputRef.current?.focus()}>
      {/* Output */}
      <div className="flex-1 overflow-auto p-4 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className={getLineColor(line.type)}>
            <pre className="whitespace-pre-wrap">{line.content}</pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-2 border-t border-white/10 bg-slate-900/50">
        <span className="text-green-400 text-xs shrink-0">{user.display_name || '$'}@infinity-os:{cwd}$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none text-white caret-green-400"
          autoFocus
          spellCheck={false}
        />
      </form>
    </div>
  );
}