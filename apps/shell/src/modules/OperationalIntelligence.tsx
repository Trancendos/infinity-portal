// modules/OperationalIntelligence.tsx — Real-time System Status Widget
// Displays cluster health, agent status, and key metrics.
// Integrates with the Agent Manager API and backend health endpoint.

import React, { useEffect, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────

interface SystemHealth {
  status: string;
  version: string;
  uptime: number;
  database: string;
  timestamp: string;
}

interface AgentMetrics {
  total_agents: number;
  status_breakdown: Record<string, number>;
  tier_breakdown: Record<string, number>;
  total_tasks_completed: number;
  total_errors: number;
  active_tasks: number;
  pending_commands: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency?: number;
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
    borderRadius: '16px',
    padding: '24px',
    color: '#e0e0e0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    minWidth: '380px',
    maxWidth: '480px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#888',
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 2s infinite',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#888',
    marginBottom: '8px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  metricCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '10px',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
  },
  metricLabel: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  },
  serviceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    marginBottom: '4px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  serviceName: {
    fontSize: '13px',
    fontWeight: 500,
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
  },
  agentBar: {
    display: 'flex',
    gap: '4px',
    marginTop: '8px',
  },
  agentSegment: {
    height: '6px',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  footer: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#666',
  },
};

const statusColors: Record<string, string> = {
  healthy: '#22c55e',
  ready: '#22c55e',
  degraded: '#f59e0b',
  processing: '#3b82f6',
  down: '#ef4444',
  error: '#ef4444',
  stopped: '#6b7280',
  unknown: '#6b7280',
  registered: '#8b5cf6',
};

const getStatusStyle = (status: string): React.CSSProperties => ({
  ...styles.statusBadge,
  background: `${statusColors[status] || statusColors.unknown}20`,
  color: statusColors[status] || statusColors.unknown,
});

// ── Component ──────────────────────────────────────────────

const OperationalIntelligence: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch system health
      const healthRes = await fetch('/health').catch(() => null);
      if (healthRes?.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
      }

      // Fetch agent metrics
      const agentRes = await fetch('/api/v1/agents/metrics/summary').catch(() => null);
      if (agentRes?.ok) {
        const agentData = await agentRes.json();
        setAgentMetrics(agentData);
      }

      // Build service status from available endpoints
      const serviceChecks: ServiceStatus[] = [];
      const endpoints = [
        { name: 'Backend API', url: '/health' },
        { name: 'Agent Manager', url: '/api/v1/agents/metrics/summary' },
        { name: 'AI Engine', url: '/api/v1/ai/health' },
        { name: 'File Storage', url: '/api/v1/files/health' },
      ];

      for (const ep of endpoints) {
        const start = performance.now();
        try {
          const res = await fetch(ep.url, { signal: AbortSignal.timeout(5000) });
          const latency = Math.round(performance.now() - start);
          serviceChecks.push({
            name: ep.name,
            status: res.ok ? 'healthy' : 'degraded',
            latency,
          });
        } catch {
          serviceChecks.push({ name: ep.name, status: 'unknown' });
        }
      }

      setServices(serviceChecks);
      setLastUpdate(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      setError('Failed to fetch metrics');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate agent status bar segments
  const agentBarSegments = agentMetrics?.status_breakdown
    ? Object.entries(agentMetrics.status_breakdown).map(([status, count]) => ({
        status,
        count,
        width: `${(count / Math.max(agentMetrics.total_agents, 1)) * 100}%`,
        color: statusColors[status] || statusColors.unknown,
      }))
    : [];

  const formatUptime = (seconds: number): string => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>∞ Operational Intelligence</h3>
        <div style={styles.liveIndicator}>
          <div style={styles.liveDot} />
          <span>LIVE</span>
        </div>
      </div>

      {error && (
        <div style={{ color: '#f59e0b', fontSize: '12px', marginBottom: '12px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Key Metrics */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>System Metrics</div>
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricValue}>
              {agentMetrics?.total_agents ?? '—'}
            </div>
            <div style={styles.metricLabel}>Registered Agents</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricValue}>
              {agentMetrics?.active_tasks ?? '—'}
            </div>
            <div style={styles.metricLabel}>Active Tasks</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricValue}>
              {agentMetrics?.total_tasks_completed ?? '—'}
            </div>
            <div style={styles.metricLabel}>Tasks Completed</div>
          </div>
          <div style={styles.metricCard}>
            <div style={{ ...styles.metricValue, color: health ? '#22c55e' : '#888' }}>
              {health ? formatUptime(health.uptime) : '—'}
            </div>
            <div style={styles.metricLabel}>Uptime</div>
          </div>
        </div>
      </div>

      {/* Agent Status Bar */}
      {agentBarSegments.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Agent Health Distribution</div>
          <div style={styles.agentBar}>
            {agentBarSegments.map((seg) => (
              <div
                key={seg.status}
                style={{
                  ...styles.agentSegment,
                  width: seg.width,
                  background: seg.color,
                  minWidth: '4px',
                }}
                title={`${seg.status}: ${seg.count}`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            {agentBarSegments.map((seg) => (
              <div key={seg.status} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#888' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: seg.color }} />
                {seg.status}: {seg.count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Status */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Services</div>
        {services.map((svc) => (
          <div key={svc.name} style={styles.serviceRow}>
            <span style={styles.serviceName}>{svc.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {svc.latency !== undefined && (
                <span style={{ fontSize: '11px', color: '#666' }}>{svc.latency}ms</span>
              )}
              <span style={getStatusStyle(svc.status)}>{svc.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>v{health?.version ?? '3.0.0'}</span>
        <span>Updated: {lastUpdate || '—'}</span>
      </div>
    </div>
  );
};

export default OperationalIntelligence;