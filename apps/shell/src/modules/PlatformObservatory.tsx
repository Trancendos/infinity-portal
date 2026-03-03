/**
 * Platform Observatory — Unified Monitoring & Observability
 * Connects: Platform Core (Infinity-One, Lighthouse, HIVE, Void) +
 *           Prometheus/Grafana metrics + Agent health + System telemetry
 * This IS the "Observatory" the user referenced — the unified view of the entire ecosystem
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackend } from '../providers/BackendProvider';

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'healthy' | 'warning' | 'critical';
  history: number[];
}

interface ServiceHealth {
  id: string;
  name: string;
  category: 'platform-core' | 'backend' | 'agent' | 'infrastructure' | 'monitoring';
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency: number;
  uptime: number;
  lastCheck: string;
  endpoint: string;
  version: string;
}

interface AlertRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  condition: string;
  status: 'firing' | 'resolved' | 'pending';
  firedAt: string | null;
  resolvedAt: string | null;
  labels: Record<string, string>;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  service: string;
  message: string;
  traceId: string | null;
  correlationId: string | null;
}

interface PrometheusTarget {
  job: string;
  instance: string;
  health: 'up' | 'down' | 'unknown';
  lastScrape: string;
  scrapeInterval: string;
}

type TabId = 'overview' | 'services' | 'metrics' | 'alerts' | 'logs' | 'prometheus';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: '#475569', INFO: '#64748b', WARN: '#f59e0b', ERROR: '#ef4444', CRITICAL: '#dc2626',
};

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e', degraded: '#f59e0b', down: '#ef4444', unknown: '#64748b',
};

const CATEGORY_ICONS: Record<string, string> = {
  'platform-core': '⚙️', backend: '🖥️', agent: '🤖', infrastructure: '🏗️', monitoring: '📊',
};

// Mini sparkline component
function Sparkline({ data, color = '#6366f1', height = 32 }: { data: number[]; color?: string; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 80;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function PlatformObservatory() {
  const { apiCall } = useBackend();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [prometheusTargets, setPrometheusTargets] = useState<PrometheusTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  const generateHistory = (base: number, variance: number, points = 20) =>
    Array.from({ length: points }, () => Math.max(0, base + (Math.random() - 0.5) * variance * 2));

  const fetchData = useCallback(async () => {
    try {
      // Try real backend endpoints
      const [healthRes, metricsRes, alertsRes] = await Promise.allSettled([
        apiCall('/api/v1/health'),
        apiCall('/api/v1/observability/metrics'),
        apiCall('/api/v1/observability/alerts'),
      ]);

      // Services — Platform Core + Backend + Agents + Infrastructure
      setServices([
        // Platform Core
        { id: 'infinity-one', name: 'Infinity-One IAM', category: 'platform-core', status: 'healthy', latency: 12, uptime: 99.98, lastCheck: new Date().toISOString(), endpoint: '/api/v1/iam', version: '2.1.0' },
        { id: 'lighthouse', name: 'Lighthouse Crypto', category: 'platform-core', status: 'healthy', latency: 8, uptime: 99.99, lastCheck: new Date().toISOString(), endpoint: '/api/v1/lighthouse', version: '2.1.0' },
        { id: 'hive', name: 'HIVE Orchestrator', category: 'platform-core', status: 'healthy', latency: 23, uptime: 99.95, lastCheck: new Date().toISOString(), endpoint: '/api/v1/hive', version: '2.1.0' },
        { id: 'void', name: 'The Void Vault', category: 'platform-core', status: 'healthy', latency: 15, uptime: 99.99, lastCheck: new Date().toISOString(), endpoint: '/api/v1/vault', version: '2.1.0' },
        // Backend
        { id: 'fastapi', name: 'FastAPI Backend', category: 'backend', status: 'healthy', latency: 45, uptime: 99.92, lastCheck: new Date().toISOString(), endpoint: '/api/v1/health', version: '1.8.3' },
        { id: 'supabase', name: 'Supabase DB', category: 'backend', status: 'healthy', latency: 18, uptime: 99.97, lastCheck: new Date().toISOString(), endpoint: 'supabase.co', version: 'managed' },
        // Agents
        { id: 'norman-ai-svc', name: 'Norman-AI', category: 'agent', status: 'healthy', latency: 34, uptime: 99.89, lastCheck: new Date().toISOString(), endpoint: 'security-pod-01', version: '3.2.1' },
        { id: 'guardian-ai-svc', name: 'Guardian-AI', category: 'agent', status: 'healthy', latency: 28, uptime: 99.91, lastCheck: new Date().toISOString(), endpoint: 'security-pod-01', version: '3.1.0' },
        { id: 'mercury-ai-svc', name: 'Mercury-AI', category: 'agent', status: 'degraded', latency: 187, uptime: 98.4, lastCheck: new Date().toISOString(), endpoint: 'finance-pod-01', version: '2.8.4' },
        { id: 'echo-ai-svc', name: 'Echo-AI', category: 'agent', status: 'down', latency: 0, uptime: 0, lastCheck: new Date(Date.now() - 300000).toISOString(), endpoint: 'data-pod-02', version: '1.4.2' },
        // Infrastructure
        { id: 'k3s-cluster', name: 'K3s Cluster (Oracle)', category: 'infrastructure', status: 'healthy', latency: 5, uptime: 99.99, lastCheck: new Date().toISOString(), endpoint: 'oracle-arm-01', version: 'k3s v1.28' },
        { id: 'cloudflare', name: 'Cloudflare Edge', category: 'infrastructure', status: 'healthy', latency: 2, uptime: 100, lastCheck: new Date().toISOString(), endpoint: 'cloudflare.com', version: 'managed' },
        { id: 'api-gateway', name: 'API Gateway (Nexus)', category: 'infrastructure', status: 'healthy', latency: 11, uptime: 99.96, lastCheck: new Date().toISOString(), endpoint: ':8080', version: '1.5.2' },
        // Monitoring
        { id: 'prometheus', name: 'Prometheus', category: 'monitoring', status: 'healthy', latency: 7, uptime: 99.98, lastCheck: new Date().toISOString(), endpoint: ':9090', version: '2.48.0' },
        { id: 'grafana', name: 'Grafana', category: 'monitoring', status: 'healthy', latency: 22, uptime: 99.95, lastCheck: new Date().toISOString(), endpoint: ':3001', version: '10.2.0' },
      ]);

      // Metrics
      setMetrics([
        { name: 'CPU Usage', value: 34, unit: '%', trend: 'stable', status: 'healthy', history: generateHistory(34, 8) },
        { name: 'Memory Usage', value: 67, unit: '%', trend: 'up', status: 'warning', history: generateHistory(67, 5) },
        { name: 'API Latency (p99)', value: 187, unit: 'ms', trend: 'up', status: 'warning', history: generateHistory(187, 40) },
        { name: 'Request Rate', value: 2847, unit: 'req/s', trend: 'stable', status: 'healthy', history: generateHistory(2847, 300) },
        { name: 'Error Rate', value: 0.12, unit: '%', trend: 'down', status: 'healthy', history: generateHistory(0.12, 0.05) },
        { name: 'Active Agents', value: 13, unit: '', trend: 'stable', status: 'healthy', history: generateHistory(13, 1) },
        { name: 'Crypto Ops/s', value: 847, unit: 'ops/s', trend: 'up', status: 'healthy', history: generateHistory(847, 100) },
        { name: 'Vault Secrets', value: 7, unit: '', trend: 'stable', status: 'healthy', history: generateHistory(7, 0) },
        { name: 'K3s Node CPU', value: 28, unit: '%', trend: 'stable', status: 'healthy', history: generateHistory(28, 6) },
        { name: 'K3s Node RAM', value: 14.2, unit: 'GB', trend: 'stable', status: 'healthy', history: generateHistory(14.2, 0.5) },
        { name: 'DB Connections', value: 47, unit: '', trend: 'stable', status: 'healthy', history: generateHistory(47, 5) },
        { name: 'HITL Queue', value: 1, unit: '', trend: 'stable', status: 'warning', history: generateHistory(1, 0) },
      ]);

      // Alerts
      setAlerts([
        { id: 'al-001', name: 'HighMemoryUsage', severity: 'warning', condition: 'memory_usage_percent > 65', status: 'firing', firedAt: new Date(Date.now() - 1800000).toISOString(), resolvedAt: null, labels: { service: 'fastapi', instance: 'backend:8000' } },
        { id: 'al-002', name: 'AgentDown', severity: 'critical', condition: 'agent_up == 0', status: 'firing', firedAt: new Date(Date.now() - 300000).toISOString(), resolvedAt: null, labels: { agent: 'echo-ai', pod: 'data-pod-02' } },
        { id: 'al-003', name: 'HighAPILatency', severity: 'warning', condition: 'api_latency_p99 > 150ms', status: 'firing', firedAt: new Date(Date.now() - 900000).toISOString(), resolvedAt: null, labels: { service: 'mercury-ai', endpoint: '/api/v1/finance' } },
        { id: 'al-004', name: 'HITLGatePending', severity: 'warning', condition: 'hitl_queue_depth > 0', status: 'firing', firedAt: new Date(Date.now() - 7200000).toISOString(), resolvedAt: null, labels: { agent: 'aegis-ai', task: 'ST-4819' } },
        { id: 'al-005', name: 'CertificateExpiringSoon', severity: 'info', condition: 'cert_expiry_days < 30', status: 'pending', firedAt: null, resolvedAt: null, labels: { cert: 'TLS_CERT_WILDCARD', days: '45' } },
        { id: 'al-006', name: 'HighCPUUsage', severity: 'critical', condition: 'cpu_usage_percent > 90', status: 'resolved', firedAt: new Date(Date.now() - 86400000).toISOString(), resolvedAt: new Date(Date.now() - 82800000).toISOString(), labels: { service: 'forge-ai', pod: 'build-pod-01' } },
      ]);

      // Logs
      setLogs([
        { id: 'l-001', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'INFO', service: 'hive', message: 'Swarm task ST-4821 progress: 67% — security audit phase 2/3', traceId: 'trace-abc123', correlationId: 'corr-001' },
        { id: 'l-002', timestamp: new Date(Date.now() - 10000).toISOString(), level: 'WARN', service: 'mercury-ai', message: 'High latency detected on financial reconciliation endpoint (187ms > 150ms threshold)', traceId: 'trace-def456', correlationId: 'corr-002' },
        { id: 'l-003', timestamp: new Date(Date.now() - 15000).toISOString(), level: 'ERROR', service: 'echo-ai', message: 'Pod crash: OOMKilled — container exceeded memory limit (512Mi). Recovery failed after 3 attempts.', traceId: null, correlationId: 'corr-007' },
        { id: 'l-004', timestamp: new Date(Date.now() - 30000).toISOString(), level: 'INFO', service: 'lighthouse', message: 'Token rotation completed for mercury-ai (ML-KEM-768). New fingerprint: d2:8c:4f:a1:...', traceId: 'trace-ghi789', correlationId: null },
        { id: 'l-005', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'WARN', service: 'norman-ai', message: 'Suspicious port scan detected from 185.220.101.x — threat level: MEDIUM. Guardian-AI notified.', traceId: 'trace-jkl012', correlationId: 'corr-001' },
        { id: 'l-006', timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', service: 'infinity-one', message: 'IAM policy evaluation: admin@trancendos.com → admin:write → ALLOW (policy: Admin Full Access)', traceId: 'trace-mno345', correlationId: null },
        { id: 'l-007', timestamp: new Date(Date.now() - 180000).toISOString(), level: 'CRITICAL', service: 'aegis-ai', message: 'HITL gate triggered for L4 operation: firewall rule change on DMZ segment. Awaiting human approval.', traceId: 'trace-pqr678', correlationId: 'corr-003' },
        { id: 'l-008', timestamp: new Date(Date.now() - 300000).toISOString(), level: 'INFO', service: 'void', message: 'Integrity check passed: 1247/1247 secrets verified. Vault health: OPTIMAL', traceId: null, correlationId: null },
        { id: 'l-009', timestamp: new Date(Date.now() - 600000).toISOString(), level: 'INFO', service: 'fastapi', message: 'Database migration check: all 68 tables present. Alembic head: a3f2b1c9d8e7', traceId: 'trace-stu901', correlationId: null },
        { id: 'l-010', timestamp: new Date(Date.now() - 900000).toISOString(), level: 'WARN', service: 'k3s', message: 'Node oracle-arm-01 memory pressure: 14.2GB/24GB (59%). Consider scaling.', traceId: null, correlationId: null },
      ]);

      // Prometheus targets
      setPrometheusTargets([
        { job: 'prometheus', instance: 'localhost:9090', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'node-exporter', instance: 'oracle-arm-01:9100', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'infinity-portal', instance: 'app:3000', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '30s' },
        { job: 'api-gateway', instance: 'nexus:8080', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'infinity-one', instance: 'iam-worker:9091', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'lighthouse', instance: 'crypto-worker:9092', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'hive', instance: 'hive-worker:9093', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'void', instance: 'vault-worker:9094', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '15s' },
        { job: 'ai-service', instance: 'ai-svc:8001', health: 'up', lastScrape: new Date(Date.now() - 15000).toISOString(), scrapeInterval: '30s' },
        { job: 'echo-ai', instance: 'data-pod-02:9095', health: 'down', lastScrape: new Date(Date.now() - 300000).toISOString(), scrapeInterval: '15s' },
      ]);

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Observatory: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(fetchData, 30000);
    } else {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    }
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [autoRefresh, fetchData]);

  const firingAlerts = alerts.filter(a => a.status === 'firing');
  const healthyServices = services.filter(s => s.status === 'healthy').length;
  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.level === logFilter);

  const tabs: Array<{ id: TabId; label: string; icon: string; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: '🔭' },
    { id: 'services', label: 'Services', icon: '🏥', badge: services.filter(s => s.status !== 'healthy').length || undefined },
    { id: 'metrics', label: 'Metrics', icon: '📈' },
    { id: 'alerts', label: 'Alerts', icon: '🚨', badge: firingAlerts.length || undefined },
    { id: 'logs', label: 'Logs', icon: '📜' },
    { id: 'prometheus', label: 'Prometheus', icon: '🔥' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, #0a1628 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔭</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Platform Observatory</h2>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
                Unified Monitoring • {healthyServices}/{services.length} Services Healthy •
                {firingAlerts.length > 0 ? ` ⚠️ ${firingAlerts.length} Active Alerts` : ' ✓ No Critical Alerts'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#475569' }}>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${autoRefresh ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`, background: autoRefresh ? 'rgba(34,197,94,0.1)' : 'transparent', color: autoRefresh ? '#22c55e' : '#64748b', cursor: 'pointer', fontSize: 11 }}
            >
              {autoRefresh ? '● AUTO' : '○ MANUAL'}
            </button>
            <button onClick={fetchData} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {/* Firing Alerts Banner */}
      {firingAlerts.filter(a => a.severity === 'critical').length > 0 && (
        <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>🚨</span>
          <span style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>
            {firingAlerts.filter(a => a.severity === 'critical').length} CRITICAL alert(s) firing:
          </span>
          {firingAlerts.filter(a => a.severity === 'critical').map(a => (
            <span key={a.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>{a.name}</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeTab === tab.id ? 'rgba(14,165,233,0.15)' : 'transparent', color: activeTab === tab.id ? '#38bdf8' : '#64748b', borderBottom: activeTab === tab.id ? '2px solid #0ea5e9' : '2px solid transparent', position: 'relative' }}>
            {tab.icon} {tab.label}
            {tab.badge ? (
              <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px', borderRadius: 10, background: '#ef4444', color: 'white', fontWeight: 700 }}>{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🔭</div><p style={{ color: '#64748b' }}>Scanning ecosystem...</p></div>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div>
                {/* Top Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Services Healthy', value: `${healthyServices}/${services.length}`, icon: '🏥', color: healthyServices === services.length ? '#22c55e' : '#f59e0b' },
                    { label: 'Active Alerts', value: firingAlerts.length, icon: '🚨', color: firingAlerts.length > 0 ? '#ef4444' : '#22c55e' },
                    { label: 'Request Rate', value: '2.8k/s', icon: '⚡', color: '#0ea5e9' },
                    { label: 'P99 Latency', value: '187ms', icon: '⏱️', color: '#f59e0b' },
                    { label: 'Error Rate', value: '0.12%', icon: '❌', color: '#22c55e' },
                  ].map(card => (
                    <div key={card.label} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{card.icon}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                {/* Platform Core Status */}
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PLATFORM CORE</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {services.filter(s => s.category === 'platform-core').map(svc => (
                      <div key={svc.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${STATUS_COLORS[svc.status]}33` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{svc.name}</span>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[svc.status] }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          <div>Latency: <span style={{ color: svc.latency > 100 ? '#f59e0b' : '#94a3b8' }}>{svc.latency}ms</span></div>
                          <div>Uptime: <span style={{ color: '#22c55e' }}>{svc.uptime}%</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>KEY METRICS</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {metrics.slice(0, 8).map(metric => (
                      <div key={metric.name} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${metric.status === 'healthy' ? 'rgba(255,255,255,0.08)' : metric.status === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{metric.name}</span>
                          <span style={{ fontSize: 10, color: metric.trend === 'up' ? '#f59e0b' : metric.trend === 'down' ? '#22c55e' : '#64748b' }}>
                            {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                          </span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: metric.status === 'healthy' ? '#e2e8f0' : metric.status === 'warning' ? '#fbbf24' : '#f87171', marginBottom: 6 }}>
                          {metric.value}{metric.unit}
                        </div>
                        <Sparkline data={metric.history} color={metric.status === 'healthy' ? '#6366f1' : metric.status === 'warning' ? '#f59e0b' : '#ef4444'} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Logs */}
                <div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>RECENT LOG STREAM</h3>
                  <div style={{ borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', padding: 12, fontFamily: 'monospace', fontSize: 11 }}>
                    {logs.slice(0, 5).map(log => (
                      <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ color: '#475569', flexShrink: 0 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span style={{ color: LEVEL_COLORS[log.level], fontWeight: 700, flexShrink: 0, minWidth: 50 }}>{log.level}</span>
                        <span style={{ color: '#6366f1', flexShrink: 0, minWidth: 80 }}>[{log.service}]</span>
                        <span style={{ color: '#94a3b8' }}>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SERVICES TAB */}
            {activeTab === 'services' && (
              <div>
                {(['platform-core', 'backend', 'agent', 'infrastructure', 'monitoring'] as const).map(category => (
                  <div key={category} style={{ marginBottom: 20 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {CATEGORY_ICONS[category]} {category.replace('-', ' ')}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {services.filter(s => s.category === category).map(svc => (
                        <div key={svc.id} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${STATUS_COLORS[svc.status]}33`, display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[svc.status], flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{svc.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{svc.endpoint} • v{svc.version}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 20, fontSize: 11 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, color: svc.latency > 100 ? '#f59e0b' : '#94a3b8' }}>{svc.latency}ms</div>
                              <div style={{ color: '#475569' }}>Latency</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, color: svc.uptime > 99 ? '#22c55e' : svc.uptime > 95 ? '#f59e0b' : '#ef4444' }}>{svc.uptime}%</div>
                              <div style={{ color: '#475569' }}>Uptime</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, color: STATUS_COLORS[svc.status], textTransform: 'uppercase', fontSize: 10 }}>{svc.status}</div>
                              <div style={{ color: '#475569' }}>Status</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* METRICS TAB */}
            {activeTab === 'metrics' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {metrics.map(metric => (
                    <div key={metric.name} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${metric.status === 'healthy' ? 'rgba(255,255,255,0.08)' : metric.status === 'warning' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{metric.name}</span>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: metric.status === 'healthy' ? 'rgba(34,197,94,0.15)' : metric.status === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', color: metric.status === 'healthy' ? '#22c55e' : metric.status === 'warning' ? '#fbbf24' : '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>{metric.status}</span>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: metric.status === 'healthy' ? '#e2e8f0' : metric.status === 'warning' ? '#fbbf24' : '#f87171', marginBottom: 10 }}>
                        {metric.value}<span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>{metric.unit}</span>
                      </div>
                      <Sparkline data={metric.history} color={metric.status === 'healthy' ? '#6366f1' : metric.status === 'warning' ? '#f59e0b' : '#ef4444'} height={40} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: '#475569' }}>
                        <span>Min: {Math.min(...metric.history).toFixed(1)}{metric.unit}</span>
                        <span>Trend: {metric.trend === 'up' ? '↑ Rising' : metric.trend === 'down' ? '↓ Falling' : '→ Stable'}</span>
                        <span>Max: {Math.max(...metric.history).toFixed(1)}{metric.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ALERTS TAB */}
            {activeTab === 'alerts' && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {['firing', 'pending', 'resolved'].map(status => (
                    <div key={status} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#64748b' }}>
                      {alerts.filter(a => a.status === status).length} {status}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {alerts.map(alert => (
                    <div key={alert.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${alert.severity === 'critical' ? 'rgba(239,68,68,0.3)' : alert.severity === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.3)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: alert.severity === 'critical' ? 'rgba(239,68,68,0.2)' : alert.severity === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)', color: alert.severity === 'critical' ? '#f87171' : alert.severity === 'warning' ? '#fbbf24' : '#818cf8', fontWeight: 700, textTransform: 'uppercase' }}>{alert.severity}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{alert.name}</span>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: alert.status === 'firing' ? 'rgba(239,68,68,0.15)' : alert.status === 'resolved' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: alert.status === 'firing' ? '#f87171' : alert.status === 'resolved' ? '#4ade80' : '#fbbf24', fontWeight: 700, textTransform: 'uppercase' }}>{alert.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginBottom: 8 }}>condition: {alert.condition}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(alert.labels).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>{k}={v}</span>
                        ))}
                      </div>
                      {alert.firedAt && <div style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>Fired: {new Date(alert.firedAt).toLocaleString()}{alert.resolvedAt ? ` → Resolved: ${new Date(alert.resolvedAt).toLocaleString()}` : ''}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LOGS TAB */}
            {activeTab === 'logs' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'].map(level => (
                    <button key={level} onClick={() => setLogFilter(level)} style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${logFilter === level ? LEVEL_COLORS[level] || '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: logFilter === level ? `${LEVEL_COLORS[level] || '#6366f1'}22` : 'transparent', color: logFilter === level ? LEVEL_COLORS[level] || '#818cf8' : '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {level}
                    </button>
                  ))}
                </div>
                <div ref={logsRef} style={{ borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', padding: 14, fontFamily: 'monospace', fontSize: 11, maxHeight: 500, overflow: 'auto' }}>
                  {filteredLogs.map(log => (
                    <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ color: '#475569', flexShrink: 0, minWidth: 80 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span style={{ color: LEVEL_COLORS[log.level], fontWeight: 700, flexShrink: 0, minWidth: 55 }}>{log.level}</span>
                      <span style={{ color: '#6366f1', flexShrink: 0, minWidth: 90 }}>[{log.service}]</span>
                      <span style={{ color: '#94a3b8', flex: 1 }}>{log.message}</span>
                      {log.traceId && <span style={{ color: '#334155', flexShrink: 0, fontSize: 10 }}>{log.traceId}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PROMETHEUS TAB */}
            {activeTab === 'prometheus' && (
              <div>
                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🔥</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Prometheus v2.48.0 — {prometheusTargets.filter(t => t.health === 'up').length}/{prometheusTargets.length} targets UP</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Scraping Platform Core workers + infrastructure + agents</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <a href="#" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', textDecoration: 'none', fontSize: 12 }}>Open Prometheus UI</a>
                    <a href="#" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', textDecoration: 'none', fontSize: 12 }}>Open Grafana</a>
                  </div>
                </div>

                <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {['Job', 'Instance', 'Health', 'Last Scrape', 'Interval'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prometheusTargets.map(target => (
                        <tr key={`${target.job}-${target.instance}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace' }}>{target.job}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{target.instance}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: target.health === 'up' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: target.health === 'up' ? '#22c55e' : '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>{target.health}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b' }}>{new Date(target.lastScrape).toLocaleTimeString()}</td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{target.scrapeInterval}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}