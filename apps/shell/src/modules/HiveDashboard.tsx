/**
 * HIVE Dashboard — Agent Swarm Intelligence & Orchestration
 * Connected to: hive worker, BackendProvider, agent-sdk
 * Manages: 27 AI agents, swarm tasks, consensus, Canon compliance
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackend } from '../providers/BackendProvider';

interface AgentNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  status: 'active' | 'idle' | 'busy' | 'error' | 'offline' | 'hitl-pending';
  logicLevel: 0 | 1 | 2 | 3 | 4 | 5;
  currentTask: string | null;
  tasksCompleted: number;
  tasksToday: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  lastHeartbeat: string;
  canonCompliant: boolean;
  specialisation: string;
  pod: string;
}

interface SwarmTask {
  id: string;
  title: string;
  type: 'security' | 'finance' | 'orchestration' | 'scheduling' | 'analysis' | 'defense';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'hitl-gate' | 'cancelled';
  assignedAgents: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  progress: number;
  createdAt: string;
  completedAt: string | null;
  logicLevel: number;
  canonCheck: 'passed' | 'pending' | 'failed';
  correlationId: string;
}

interface SwarmEvent {
  id: string;
  type: string;
  source: string;
  target: string | null;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

interface HiveStats {
  totalAgents: number;
  activeAgents: number;
  tasksRunning: number;
  tasksQueued: number;
  tasksCompletedToday: number;
  hitlPending: number;
  swarmConsensus: number;
  canonViolations: number;
}

type TabId = 'overview' | 'agents' | 'tasks' | 'events' | 'canon';

const TIER_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#22c55e' };
const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', idle: '#64748b', busy: '#f59e0b', error: '#ef4444',
  offline: '#374151', 'hitl-pending': '#a855f7',
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
};

const ALL_AGENTS: AgentNode[] = [
  // Tier 1 — Core Intelligence
  { id: 'norman-ai', name: 'Norman-AI', tier: 1, status: 'active', logicLevel: 3, currentTask: 'Threat scan: external perimeter', tasksCompleted: 4821, tasksToday: 47, errorRate: 0.2, cpuUsage: 34, memoryUsage: 512, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Security & Threat Detection', pod: 'security-pod-01' },
  { id: 'guardian-ai', name: 'Guardian-AI', tier: 1, status: 'active', logicLevel: 4, currentTask: 'Perimeter enforcement', tasksCompleted: 3201, tasksToday: 31, errorRate: 0.1, cpuUsage: 28, memoryUsage: 384, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Defense & Containment', pod: 'security-pod-01' },
  { id: 'mercury-ai', name: 'Mercury-AI', tier: 1, status: 'busy', logicLevel: 2, currentTask: 'Financial reconciliation Q4', tasksCompleted: 2891, tasksToday: 23, errorRate: 0.3, cpuUsage: 67, memoryUsage: 768, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Finance & Transactions', pod: 'finance-pod-01' },
  { id: 'chronos-ai', name: 'Chronos-AI', tier: 1, status: 'active', logicLevel: 2, currentTask: 'Schedule optimisation', tasksCompleted: 5123, tasksToday: 89, errorRate: 0.1, cpuUsage: 22, memoryUsage: 256, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Scheduling & Time Management', pod: 'ops-pod-01' },
  { id: 'cornelius-ai', name: 'Cornelius-AI', tier: 1, status: 'active', logicLevel: 3, currentTask: 'Orchestrating swarm task #ST-4821', tasksCompleted: 6234, tasksToday: 112, errorRate: 0.2, cpuUsage: 45, memoryUsage: 640, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Orchestration & Coordination', pod: 'orchestration-pod-01' },
  // Tier 2 — Specialist Agents
  { id: 'atlas-ai', name: 'Atlas-AI', tier: 2, status: 'idle', logicLevel: 2, currentTask: null, tasksCompleted: 1234, tasksToday: 8, errorRate: 0.4, cpuUsage: 5, memoryUsage: 128, lastHeartbeat: new Date(Date.now() - 30000).toISOString(), canonCompliant: true, specialisation: 'Infrastructure Mapping', pod: 'infra-pod-01' },
  { id: 'oracle-ai', name: 'Oracle-AI', tier: 2, status: 'busy', logicLevel: 3, currentTask: 'Predictive analysis: system load', tasksCompleted: 2341, tasksToday: 34, errorRate: 0.2, cpuUsage: 78, memoryUsage: 1024, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Predictive Analytics', pod: 'analytics-pod-01' },
  { id: 'hermes-ai', name: 'Hermes-AI', tier: 2, status: 'active', logicLevel: 2, currentTask: 'Message routing optimisation', tasksCompleted: 8921, tasksToday: 234, errorRate: 0.1, cpuUsage: 31, memoryUsage: 256, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Communication & Routing', pod: 'comms-pod-01' },
  { id: 'aegis-ai', name: 'Aegis-AI', tier: 2, status: 'hitl-pending', logicLevel: 4, currentTask: 'Awaiting HITL approval: firewall rule change', tasksCompleted: 891, tasksToday: 5, errorRate: 0.5, cpuUsage: 12, memoryUsage: 192, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Compliance & Audit', pod: 'security-pod-02' },
  { id: 'nexus-ai', name: 'Nexus-AI', tier: 2, status: 'active', logicLevel: 2, currentTask: 'API gateway health check', tasksCompleted: 3421, tasksToday: 67, errorRate: 0.2, cpuUsage: 19, memoryUsage: 320, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'API & Integration', pod: 'gateway-pod-01' },
  // Tier 3 — Support Agents
  { id: 'scout-ai', name: 'Scout-AI', tier: 3, status: 'active', logicLevel: 1, currentTask: 'Log aggregation', tasksCompleted: 12341, tasksToday: 456, errorRate: 0.1, cpuUsage: 8, memoryUsage: 64, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Data Collection', pod: 'data-pod-01' },
  { id: 'forge-ai', name: 'Forge-AI', tier: 3, status: 'busy', logicLevel: 1, currentTask: 'Build pipeline: infinity-portal v2.4.1', tasksCompleted: 4521, tasksToday: 12, errorRate: 0.3, cpuUsage: 89, memoryUsage: 2048, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'CI/CD & Build', pod: 'build-pod-01' },
  { id: 'sentinel-ai', name: 'Sentinel-AI', tier: 3, status: 'active', logicLevel: 1, currentTask: 'Health monitoring sweep', tasksCompleted: 23421, tasksToday: 891, errorRate: 0.05, cpuUsage: 6, memoryUsage: 96, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Health Monitoring', pod: 'ops-pod-02' },
  { id: 'echo-ai', name: 'Echo-AI', tier: 3, status: 'error', logicLevel: 1, currentTask: null, tasksCompleted: 891, tasksToday: 0, errorRate: 12.4, cpuUsage: 0, memoryUsage: 0, lastHeartbeat: new Date(Date.now() - 300000).toISOString(), canonCompliant: false, specialisation: 'Event Streaming', pod: 'data-pod-02' },
  { id: 'cipher-ai', name: 'Cipher-AI', tier: 3, status: 'active', logicLevel: 2, currentTask: 'Encrypting data batch #DB-2341', tasksCompleted: 6721, tasksToday: 123, errorRate: 0.1, cpuUsage: 45, memoryUsage: 512, lastHeartbeat: new Date().toISOString(), canonCompliant: true, specialisation: 'Encryption & Data Security', pod: 'security-pod-03' },
];

export default function HiveDashboard() {
  const { apiCall } = useBackend();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [agents, setAgents] = useState<AgentNode[]>(ALL_AGENTS);
  const [tasks, setTasks] = useState<SwarmTask[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [stats, setStats] = useState<HiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null);
  const eventRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/v1/agents').catch(() => null);

      if (res?.agents) {
        // Map backend agents to our format
        const mapped = res.agents.map((a: any) => ({
          id: a.id, name: a.name, tier: a.tier || 2, status: a.status || 'idle',
          logicLevel: a.logic_level || 1, currentTask: a.current_task || null,
          tasksCompleted: a.tasks_completed || 0, tasksToday: a.tasks_today || 0,
          errorRate: a.error_rate || 0, cpuUsage: a.cpu_usage || 0,
          memoryUsage: a.memory_usage || 0, lastHeartbeat: a.last_heartbeat || new Date().toISOString(),
          canonCompliant: a.canon_compliant !== false, specialisation: a.specialisation || 'General',
          pod: a.pod || 'default-pod',
        }));
        setAgents(mapped);
      }

      // Demo tasks
      setTasks([
        { id: 'ST-4821', title: 'Orchestrate swarm security audit', type: 'security', status: 'running', assignedAgents: ['cornelius-ai', 'norman-ai', 'guardian-ai'], priority: 'high', progress: 67, createdAt: new Date(Date.now() - 1800000).toISOString(), completedAt: null, logicLevel: 3, canonCheck: 'passed', correlationId: 'corr-001' },
        { id: 'ST-4820', title: 'Financial reconciliation Q4 2024', type: 'finance', status: 'running', assignedAgents: ['mercury-ai'], priority: 'critical', progress: 45, createdAt: new Date(Date.now() - 3600000).toISOString(), completedAt: null, logicLevel: 2, canonCheck: 'passed', correlationId: 'corr-002' },
        { id: 'ST-4819', title: 'Firewall rule update — DMZ segment', type: 'defense', status: 'hitl-gate', assignedAgents: ['aegis-ai', 'guardian-ai'], priority: 'high', progress: 80, createdAt: new Date(Date.now() - 7200000).toISOString(), completedAt: null, logicLevel: 4, canonCheck: 'pending', correlationId: 'corr-003' },
        { id: 'ST-4818', title: 'Predictive load analysis — next 24h', type: 'analysis', status: 'running', assignedAgents: ['oracle-ai'], priority: 'medium', progress: 23, createdAt: new Date(Date.now() - 900000).toISOString(), completedAt: null, logicLevel: 3, canonCheck: 'passed', correlationId: 'corr-004' },
        { id: 'ST-4817', title: 'Build infinity-portal v2.4.1', type: 'orchestration', status: 'running', assignedAgents: ['forge-ai', 'cornelius-ai'], priority: 'medium', progress: 78, createdAt: new Date(Date.now() - 5400000).toISOString(), completedAt: null, logicLevel: 1, canonCheck: 'passed', correlationId: 'corr-005' },
        { id: 'ST-4816', title: 'Schedule optimisation — weekly sprint', type: 'scheduling', status: 'completed', assignedAgents: ['chronos-ai'], priority: 'low', progress: 100, createdAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 82800000).toISOString(), logicLevel: 2, canonCheck: 'passed', correlationId: 'corr-006' },
        { id: 'ST-4815', title: 'Echo-AI recovery attempt', type: 'orchestration', status: 'failed', assignedAgents: ['cornelius-ai', 'sentinel-ai'], priority: 'high', progress: 30, createdAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 3000000).toISOString(), logicLevel: 2, canonCheck: 'failed', correlationId: 'corr-007' },
      ]);

      // Demo events
      setEvents([
        { id: 'ev-001', type: 'agent.task_started', source: 'cornelius-ai', target: 'norman-ai', message: 'Delegated security audit task ST-4821', timestamp: new Date(Date.now() - 60000).toISOString(), severity: 'info' },
        { id: 'ev-002', type: 'security.threat_detected', source: 'norman-ai', target: 'guardian-ai', message: 'Suspicious port scan detected from 185.220.101.x', timestamp: new Date(Date.now() - 120000).toISOString(), severity: 'warning' },
        { id: 'ev-003', type: 'hitl.gate_triggered', source: 'aegis-ai', target: null, message: 'HITL gate triggered for L4 operation: firewall rule change', timestamp: new Date(Date.now() - 300000).toISOString(), severity: 'warning' },
        { id: 'ev-004', type: 'agent.error', source: 'echo-ai', target: 'cornelius-ai', message: 'Echo-AI pod crash: OOMKilled — recovery failed', timestamp: new Date(Date.now() - 360000).toISOString(), severity: 'error' },
        { id: 'ev-005', type: 'canon.check_passed', source: 'hive', target: 'mercury-ai', message: 'Canon compliance check passed for financial task ST-4820', timestamp: new Date(Date.now() - 600000).toISOString(), severity: 'info' },
        { id: 'ev-006', type: 'swarm.consensus_reached', source: 'hive', target: null, message: 'Swarm consensus reached for security audit approach (3/3 agents)', timestamp: new Date(Date.now() - 900000).toISOString(), severity: 'info' },
        { id: 'ev-007', type: 'agent.heartbeat_missed', source: 'sentinel-ai', target: 'echo-ai', message: 'Echo-AI missed 3 consecutive heartbeats', timestamp: new Date(Date.now() - 1200000).toISOString(), severity: 'error' },
      ]);

      const activeAgents = ALL_AGENTS.filter(a => a.status === 'active' || a.status === 'busy');
      setStats({
        totalAgents: ALL_AGENTS.length,
        activeAgents: activeAgents.length,
        tasksRunning: 5,
        tasksQueued: 2,
        tasksCompletedToday: 234,
        hitlPending: 1,
        swarmConsensus: 94,
        canonViolations: 1,
      });

    } catch (err) {
      console.error('HIVE: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-scroll events
  useEffect(() => {
    if (eventRef.current) eventRef.current.scrollTop = 0;
  }, [events]);

  const filteredAgents = agents.filter(a => {
    if (filterTier && a.tier !== filterTier) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Swarm Overview', icon: '🐝' },
    { id: 'agents', label: 'Agents', icon: '🤖' },
    { id: 'tasks', label: 'Tasks', icon: '📋' },
    { id: 'events', label: 'Event Bus', icon: '⚡' },
    { id: 'canon', label: 'AI Canon', icon: '📜' },
  ];

  const SEVERITY_COLORS: Record<string, string> = { info: '#64748b', warning: '#f59e0b', error: '#ef4444', critical: '#dc2626' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, #1a0a2e 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🐝</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>HIVE</h2>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Agent Swarm Intelligence • {agents.length} Agents • Canon-Compliant</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {stats?.hitlPending ? (
              <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', fontSize: 11, color: '#c084fc', animation: 'pulse 2s infinite' }}>
                ⚠️ {stats.hitlPending} HITL PENDING
              </div>
            ) : null}
            <div style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 11, color: '#22c55e' }}>
              ● SWARM ACTIVE
            </div>
            <button onClick={fetchData} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: activeTab === tab.id ? 'rgba(245,158,11,0.15)' : 'transparent', color: activeTab === tab.id ? '#fbbf24' : '#64748b', borderBottom: activeTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent' }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 12 }}>🐝</div><p style={{ color: '#64748b' }}>Initialising HIVE...</p></div>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && stats && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Active Agents', value: `${stats.activeAgents}/${stats.totalAgents}`, icon: '🤖', color: '#22c55e' },
                    { label: 'Tasks Running', value: stats.tasksRunning, icon: '⚡', color: '#f59e0b' },
                    { label: 'Swarm Consensus', value: `${stats.swarmConsensus}%`, icon: '🤝', color: '#6366f1' },
                    { label: 'HITL Pending', value: stats.hitlPending, icon: '👁️', color: stats.hitlPending > 0 ? '#a855f7' : '#22c55e' },
                  ].map(card => (
                    <div key={card.label} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{card.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{card.label}</div>
                    </div>
                  ))}
                </div>

                {/* Agent Grid — Tier Overview */}
                {[1, 2, 3].map(tier => (
                  <div key={tier} style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: TIER_COLORS[tier], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Tier {tier} — {tier === 1 ? 'Core Intelligence' : tier === 2 ? 'Specialist Agents' : 'Support Agents'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {agents.filter(a => a.tier === tier).map(agent => (
                        <div key={agent.id} onClick={() => setSelectedAgent(agent)} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${STATUS_COLORS[agent.status]}33`, cursor: 'pointer', transition: 'all 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[agent.status] }} />
                            <span style={{ fontSize: 9, color: '#475569' }}>L{agent.logicLevel}</span>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>{agent.name}</div>
                          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 6 }}>{agent.status.toUpperCase()}</div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: 2 }}>
                            <div style={{ width: `${agent.cpuUsage}%`, height: '100%', borderRadius: 2, background: agent.cpuUsage > 80 ? '#ef4444' : '#f59e0b' }} />
                          </div>
                          <div style={{ fontSize: 9, color: '#475569' }}>CPU {agent.cpuUsage}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AGENTS TAB */}
            {activeTab === 'agents' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Filter:</span>
                  {[null, 1, 2, 3].map(tier => (
                    <button key={String(tier)} onClick={() => setFilterTier(tier)} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${filterTier === tier ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`, background: filterTier === tier ? 'rgba(245,158,11,0.15)' : 'transparent', color: filterTier === tier ? '#fbbf24' : '#64748b', cursor: 'pointer', fontSize: 11 }}>
                      {tier === null ? 'All Tiers' : `Tier ${tier}`}
                    </button>
                  ))}
                  {['active', 'busy', 'idle', 'error', 'hitl-pending'].map(status => (
                    <button key={status} onClick={() => setFilterStatus(filterStatus === status ? null : status)} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${filterStatus === status ? STATUS_COLORS[status] : 'rgba(255,255,255,0.1)'}`, background: filterStatus === status ? `${STATUS_COLORS[status]}22` : 'transparent', color: filterStatus === status ? STATUS_COLORS[status] : '#64748b', cursor: 'pointer', fontSize: 11, textTransform: 'capitalize' }}>
                      {status}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredAgents.map(agent => (
                    <div key={agent.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${STATUS_COLORS[agent.status]}33`, cursor: 'pointer' }} onClick={() => setSelectedAgent(agent)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[agent.status], flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{agent.name}</span>
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${TIER_COLORS[agent.tier]}22`, color: TIER_COLORS[agent.tier] }}>T{agent.tier}</span>
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>L{agent.logicLevel}</span>
                            {!agent.canonCompliant && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>⚠ CANON VIOLATION</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{agent.specialisation} • Pod: {agent.pod}</div>
                          {agent.currentTask && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>▶ {agent.currentTask}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: agent.cpuUsage > 80 ? '#ef4444' : '#94a3b8' }}>{agent.cpuUsage}%</div>
                            <div>CPU</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{agent.memoryUsage}MB</div>
                            <div>MEM</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{agent.tasksToday}</div>
                            <div>Today</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: agent.errorRate > 5 ? '#ef4444' : '#94a3b8' }}>{agent.errorRate}%</div>
                            <div>Err</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TASKS TAB */}
            {activeTab === 'tasks' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{tasks.filter(t => t.status === 'running').length} running • {tasks.filter(t => t.status === 'hitl-gate').length} awaiting HITL</p>
                  <button style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#0f172a', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ New Task</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasks.map(task => (
                    <div key={task.id} style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${task.status === 'hitl-gate' ? 'rgba(168,85,247,0.4)' : task.status === 'failed' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569' }}>{task.id}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{task.title}</span>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${PRIORITY_COLORS[task.priority]}22`, color: PRIORITY_COLORS[task.priority], fontWeight: 700, textTransform: 'uppercase' }}>{task.priority}</span>
                          {task.status === 'hitl-gate' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(168,85,247,0.2)', color: '#c084fc', fontWeight: 700 }}>⚠ HITL GATE</span>}
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b' }}>L{task.logicLevel}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {task.assignedAgents.map(agentId => (
                          <span key={agentId} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>{agentId}</span>
                        ))}
                      </div>
                      {task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled' && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Progress</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{task.progress}%</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ width: `${task.progress}%`, height: '100%', borderRadius: 2, background: task.status === 'hitl-gate' ? '#a855f7' : '#f59e0b', transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      )}
                      {task.status === 'hitl-gate' && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <button style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#22c55e', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Approve</button>
                          <button style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✗ Reject</button>
                          <button style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>View Details</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EVENTS TAB */}
            {activeTab === 'events' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Live event bus — AgentEvent&lt;T&gt; stream</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', alignSelf: 'center', animation: 'pulse 1.5s infinite' }} />
                    <span style={{ fontSize: 12, color: '#22c55e' }}>LIVE</span>
                  </div>
                </div>
                <div ref={eventRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {events.map(event => (
                    <div key={event.id} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${SEVERITY_COLORS[event.severity]}33`, borderLeft: `3px solid ${SEVERITY_COLORS[event.severity]}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: SEVERITY_COLORS[event.severity], fontWeight: 600 }}>{event.type}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: `${SEVERITY_COLORS[event.severity]}22`, color: SEVERITY_COLORS[event.severity], textTransform: 'uppercase' }}>{event.severity}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{event.message}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>
                        Source: <span style={{ color: '#64748b' }}>{event.source}</span>
                        {event.target && <> → Target: <span style={{ color: '#64748b' }}>{event.target}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CANON TAB */}
            {activeTab === 'canon' && (
              <div>
                <div style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(239,68,68,0.08))', border: '1px solid rgba(245,158,11,0.2)', marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#fbbf24' }}>📜 AI Canon — Governance Framework</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>All 27 agents operate under the Infinity AI Canon. Violations trigger automatic HITL escalation and agent suspension.</p>
                </div>

                {/* Magna Carta */}
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>MAGNA CARTA — CORE PRINCIPLES</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { title: 'Human Primacy', desc: 'Humans retain ultimate authority. No agent may override human decisions.', icon: '👑', status: 'enforced' },
                      { title: 'Transparency', desc: 'All agent actions are logged, auditable, and explainable.', icon: '🔍', status: 'enforced' },
                      { title: 'Safety First', desc: 'Agents must halt and escalate when safety is uncertain.', icon: '🛡️', status: 'enforced' },
                      { title: 'Privacy (Crypto-Shredding)', desc: 'Data deletion via key destruction. No data retained beyond lifecycle.', icon: '🔐', status: 'enforced' },
                      { title: 'Economic Responsibility', desc: 'Agents must not incur costs beyond authorised budgets.', icon: '💰', status: 'enforced' },
                    ].map(principle => (
                      <div key={principle.title} style={{ padding: 14, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{principle.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{principle.title}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700 }}>ENFORCED</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{principle.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Logic Levels */}
                <div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>LOGIC LEVELS — AUTONOMY FRAMEWORK</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { level: 0, name: 'Observe Only', desc: 'Read-only monitoring. No actions permitted.', hitl: false, color: '#22c55e' },
                      { level: 1, name: 'Suggest', desc: 'Recommendations only. Human executes.', hitl: false, color: '#22c55e' },
                      { level: 2, name: 'Automate', desc: 'Routine tasks with full audit trail.', hitl: false, color: '#f59e0b' },
                      { level: 3, name: 'Orchestrate', desc: 'Multi-agent coordination. Logged and reversible.', hitl: false, color: '#f59e0b' },
                      { level: 4, name: 'Autonomous', desc: 'High-impact decisions. HITL gate required.', hitl: true, color: '#ef4444' },
                      { level: 5, name: 'Critical', desc: 'System-wide changes. Dual human approval required.', hitl: true, color: '#dc2626' },
                    ].map(ll => (
                      <div key={ll.level} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${ll.color}22` }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: `${ll.color}22`, border: `1px solid ${ll.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: ll.color, flexShrink: 0 }}>L{ll.level}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{ll.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{ll.desc}</div>
                        </div>
                        {ll.hitl && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 700 }}>HITL REQUIRED</span>}
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {agents.filter(a => a.logicLevel === ll.level).length} agents
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setSelectedAgent(null)}>
          <div style={{ width: 480, padding: 24, borderRadius: 12, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[selectedAgent.status] }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{selectedAgent.name}</h3>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: `${TIER_COLORS[selectedAgent.tier]}22`, color: TIER_COLORS[selectedAgent.tier] }}>Tier {selectedAgent.tier}</span>
              </div>
              <button onClick={() => setSelectedAgent(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Status', value: selectedAgent.status.toUpperCase() },
                { label: 'Logic Level', value: `L${selectedAgent.logicLevel}` },
                { label: 'Specialisation', value: selectedAgent.specialisation },
                { label: 'Pod', value: selectedAgent.pod },
                { label: 'Tasks Today', value: selectedAgent.tasksToday },
                { label: 'Total Tasks', value: selectedAgent.tasksCompleted.toLocaleString() },
                { label: 'Error Rate', value: `${selectedAgent.errorRate}%` },
                { label: 'Canon Compliant', value: selectedAgent.canonCompliant ? '✓ Yes' : '✗ No' },
                { label: 'CPU Usage', value: `${selectedAgent.cpuUsage}%` },
                { label: 'Memory', value: `${selectedAgent.memoryUsage}MB` },
              ].map(item => (
                <div key={item.label} style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {selectedAgent.currentTask && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>CURRENT TASK</div>
                <div style={{ fontSize: 12, color: '#fbbf24' }}>▶ {selectedAgent.currentTask}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}