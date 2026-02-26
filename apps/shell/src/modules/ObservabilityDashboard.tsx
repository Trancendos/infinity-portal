/**
 * Infinity OS — Observability Dashboard
 * Real-time logs, metrics, anomaly detection, system health
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, AlertTriangle, BarChart2, CheckCircle, Clock,
  Filter, RefreshCw, Search, TrendingUp, TrendingDown,
  Zap, Database, Shield, Cpu, Globe, Eye, Terminal,
} from 'lucide-react';
import { useBackend } from '../providers/BackendProvider';

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  service: string;
  correlation_id?: string;
  duration_ms?: number;
  metadata?: Record<string, any>;
}

interface MetricSummary {
  name: string;
  current: number;
  unit: string;
  description: string;
  trend?: 'up' | 'down' | 'stable';
}

interface Anomaly {
  id: string;
  metric_name: string;
  anomaly_type: string;
  severity: string;
  detected_at: string;
  value: number;
  expected_value: number;
  deviation_pct: number;
  description: string;
  resolved: boolean;
}

const levelColors: Record<string, string> = {
  trace: 'text-gray-400',
  debug: 'text-blue-400',
  info: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  critical: 'text-red-500 font-bold',
  fatal: 'text-red-600 font-bold',
};

const levelBg: Record<string, string> = {
  trace: 'bg-gray-500/10',
  debug: 'bg-blue-500/10',
  info: 'bg-green-500/10',
  warning: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  critical: 'bg-red-500/20',
  fatal: 'bg-red-600/30',
};

const severityColors: Record<string, string> = {
  low: 'text-blue-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

const categoryIcons: Record<string, React.ReactNode> = {
  request: <Globe className="w-3 h-3" />,
  response: <Globe className="w-3 h-3" />,
  database: <Database className="w-3 h-3" />,
  auth: <Shield className="w-3 h-3" />,
  ai: <Zap className="w-3 h-3" />,
  security: <Shield className="w-3 h-3" />,
  performance: <Activity className="w-3 h-3" />,
  system: <Cpu className="w-3 h-3" />,
  audit: <Eye className="w-3 h-3" />,
};

// Mock data
const MOCK_LOGS: LogEntry[] = [
  { id: '1', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'info', category: 'request', message: 'GET /api/v1/ai/generate — 200 OK', service: 'infinity-os', duration_ms: 234 },
  { id: '2', timestamp: new Date(Date.now() - 12000).toISOString(), level: 'warning', category: 'auth', message: 'Failed login attempt for user unknown@example.com', service: 'infinity-os' },
  { id: '3', timestamp: new Date(Date.now() - 25000).toISOString(), level: 'info', category: 'ai', message: 'AI request to groq/llama-3.3-70b-versatile — 847 tokens', service: 'infinity-os', duration_ms: 1240 },
  { id: '4', timestamp: new Date(Date.now() - 45000).toISOString(), level: 'error', category: 'database', message: 'Connection pool exhausted — retrying in 5s', service: 'infinity-os' },
  { id: '5', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info', category: 'compliance', message: 'Compliance [EU_AI_ACT] AI-001: passing', service: 'infinity-os' },
  { id: '6', timestamp: new Date(Date.now() - 90000).toISOString(), level: 'debug', category: 'system', message: 'Health check passed — all services nominal', service: 'infinity-os' },
  { id: '7', timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', category: 'audit', message: 'Audit: role_change on user:abc123', service: 'infinity-os' },
  { id: '8', timestamp: new Date(Date.now() - 180000).toISOString(), level: 'critical', category: 'security', message: 'Security event: brute_force_detected — IP 192.168.1.100 blocked', service: 'infinity-os' },
];

const MOCK_METRICS: MetricSummary[] = [
  { name: 'API Requests/hr', current: 1247, unit: 'req', description: 'Total API requests in last hour', trend: 'up' },
  { name: 'Avg Response Time', current: 187, unit: 'ms', description: 'Average API response time', trend: 'stable' },
  { name: 'Error Rate', current: 0.8, unit: '%', description: 'API error rate', trend: 'down' },
  { name: 'Active Users', current: 23, unit: 'users', description: 'Users active in last 5 min', trend: 'up' },
  { name: 'AI Requests/hr', current: 89, unit: 'req', description: 'AI generation requests', trend: 'up' },
  { name: 'HITL Pending', current: 3, unit: 'tasks', description: 'Tasks awaiting human review', trend: 'stable' },
  { name: 'Compliance Score', current: 72, unit: '%', description: 'Overall compliance posture', trend: 'up' },
  { name: 'Critical CVEs', current: 0, unit: 'CVEs', description: 'Unpatched critical vulnerabilities', trend: 'stable' },
];

const MOCK_ANOMALIES: Anomaly[] = [
  {
    id: '1', metric_name: 'api.errors.total', anomaly_type: 'spike', severity: 'high',
    detected_at: new Date(Date.now() - 300000).toISOString(),
    value: 47, expected_value: 8, deviation_pct: 487.5,
    description: 'api.errors.total spike: 47.00 vs expected 8.00 (z=4.2)',
    resolved: false,
  },
  {
    id: '2', metric_name: 'security.auth.failures', anomaly_type: 'spike', severity: 'critical',
    detected_at: new Date(Date.now() - 600000).toISOString(),
    value: 23, expected_value: 2, deviation_pct: 1050,
    description: 'security.auth.failures spike: 23 vs expected 2 — possible brute force',
    resolved: false,
  },
];

export default function ObservabilityDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'metrics' | 'anomalies'>('overview');
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  const [metrics] = useState<MetricSummary[]>(MOCK_METRICS);
  const [anomalies, setAnomalies] = useState<Anomaly[]>(MOCK_ANOMALIES);
  const [logFilter, setLogFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setLastRefresh(new Date());
    // In production: fetch from /api/v1/observability/logs and /metrics/dashboard
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, refresh]);

  const filteredLogs = logs.filter(log => {
    const matchSearch = !logFilter ||
      log.message.toLowerCase().includes(logFilter.toLowerCase()) ||
      log.category.toLowerCase().includes(logFilter.toLowerCase());
    const matchLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchSearch && matchLevel;
  });

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const resolveAnomaly = (id: string) => {
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const activeAnomalies = anomalies.filter(a => !a.resolved);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Observability</h1>
            <p className="text-xs text-gray-400">
              Logs · Metrics · Anomalies · Last refresh: {formatRelative(lastRefresh.toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeAnomalies.length > 0 && (
            <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {activeAnomalies.length} anomalies
            </span>
          )}
          <button
            onClick={() => setAutoRefresh(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              autoRefresh ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Live' : 'Auto'}
          </button>
          <button onClick={refresh} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 bg-gray-800 px-6">
        {(['overview', 'logs', 'metrics', 'anomalies'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-green-400 text-green-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
            {tab === 'anomalies' && activeAnomalies.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/30 text-red-300 text-xs rounded-full">
                {activeAnomalies.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrics.map(m => (
                <div key={m.name} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {m.current}{m.unit === '%' || m.unit === 'ms' ? m.unit : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{m.name}</div>
                    </div>
                    {m.trend && (
                      <div className={`text-xs ${m.trend === 'up' ? 'text-green-400' : m.trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                        {m.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : m.trend === 'down' ? <TrendingDown className="w-4 h-4" /> : '—'}
                      </div>
                    )}
                  </div>
                  {m.unit !== '%' && m.unit !== 'ms' && (
                    <div className="text-xs text-gray-500 mt-1">{m.unit}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Active Anomalies */}
            {activeAnomalies.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" /> Active Anomalies
                </h2>
                <div className="space-y-2">
                  {activeAnomalies.map(a => (
                    <div key={a.id} className="bg-gray-800 rounded-lg border border-red-500/30 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${severityColors[a.severity]}`}>
                              {a.severity.toUpperCase()}
                            </span>
                            <span className="text-sm text-white">{a.metric_name}</span>
                            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">{a.anomaly_type}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{a.description}</p>
                          <p className="text-xs text-gray-500 mt-1">{formatRelative(a.detected_at)}</p>
                        </div>
                        <button
                          onClick={() => resolveAnomaly(a.id)}
                          className="px-3 py-1 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded text-xs transition-colors"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Logs Preview */}
            <div>
              <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-400" /> Recent Logs
              </h2>
              <div className="bg-gray-950 rounded-lg border border-gray-700 p-4 font-mono text-xs space-y-1 max-h-48 overflow-auto">
                {logs.slice(0, 8).map(log => (
                  <div key={log.id} className="flex items-start gap-3">
                    <span className="text-gray-600 shrink-0">{formatTime(log.timestamp)}</span>
                    <span className={`shrink-0 w-16 ${levelColors[log.level]}`}>[{log.level.toUpperCase()}]</span>
                    <span className="text-gray-400 shrink-0 w-20">{log.category}</span>
                    <span className="text-gray-300 truncate">{log.message}</span>
                    {log.duration_ms && <span className="text-gray-600 shrink-0">{log.duration_ms}ms</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-green-500"
                />
              </div>
              <select
                value={levelFilter}
                onChange={e => setLevelFilter(e.target.value)}
                className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-green-500"
              >
                <option value="all">All Levels</option>
                {['trace', 'debug', 'info', 'warning', 'error', 'critical', 'fatal'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div className="bg-gray-950 rounded-lg border border-gray-700 font-mono text-xs overflow-auto max-h-[calc(100vh-300px)]">
              {filteredLogs.map((log, i) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 px-4 py-2 border-b border-gray-800 last:border-0 hover:bg-gray-900 ${levelBg[log.level]}`}
                >
                  <span className="text-gray-600 shrink-0 w-20">{formatTime(log.timestamp)}</span>
                  <span className={`shrink-0 w-16 ${levelColors[log.level]}`}>[{log.level.toUpperCase()}]</span>
                  <span className="text-gray-500 shrink-0 w-20 flex items-center gap-1">
                    {categoryIcons[log.category] || null}{log.category}
                  </span>
                  <span className="text-gray-300 flex-1">{log.message}</span>
                  {log.duration_ms && (
                    <span className="text-gray-600 shrink-0">{log.duration_ms}ms</span>
                  )}
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <div className="text-center py-8 text-gray-600">No logs match your filters</div>
              )}
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metrics.map(m => (
                <div key={m.name} className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-gray-300">{m.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded ${
                      m.trend === 'up' ? 'bg-green-500/20 text-green-400' :
                      m.trend === 'down' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'} {m.trend}
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {m.current}
                    <span className="text-lg text-gray-400 ml-1">{m.unit}</span>
                  </div>
                  {/* Simple bar visualization */}
                  <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (m.current / (m.current * 1.5)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === 'anomalies' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">
                {activeAnomalies.length} Active · {anomalies.filter(a => a.resolved).length} Resolved
              </h2>
            </div>
            {anomalies.map(a => (
              <div
                key={a.id}
                className={`bg-gray-800 rounded-lg border p-4 ${
                  a.resolved ? 'border-gray-700 opacity-60' : 'border-red-500/30'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${severityColors[a.severity]}`}>
                        {a.severity.toUpperCase()}
                      </span>
                      <span className="text-sm text-white font-mono">{a.metric_name}</span>
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{a.anomaly_type}</span>
                      {a.resolved && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Resolved
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mt-2">{a.description}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>Value: <span className="text-red-400">{a.value}</span></span>
                      <span>Expected: <span className="text-green-400">{a.expected_value}</span></span>
                      <span>Deviation: <span className="text-yellow-400">{a.deviation_pct}%</span></span>
                      <span>{formatRelative(a.detected_at)}</span>
                    </div>
                  </div>
                  {!a.resolved && (
                    <button
                      onClick={() => resolveAnomaly(a.id)}
                      className="ml-4 px-3 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded text-xs transition-colors shrink-0"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
            {anomalies.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-green-400" />
                <p>No anomalies detected</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}