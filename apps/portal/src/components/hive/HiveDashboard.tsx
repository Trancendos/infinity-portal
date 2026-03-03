/**
 * HIVE Dashboard
 * Bio-Inspired Swarm Data Router — Live topology visualisation
 */

import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

interface HiveNode {
  nodeId: string;
  role: 'QUEEN' | 'WORKER' | 'SCOUT' | 'GUARD' | 'DRONE' | 'NURSE' | 'FORAGER';
  status: 'active' | 'idle' | 'busy' | 'offline';
  region: string;
  capacity: number;
  currentLoad: number;
  specialisation: string[];
}

interface MessageFlow {
  id: string;
  sourceType: string;
  destinationType: string;
  classification: string;
  status: string;
  latencyMs: number;
  timestamp: string;
}

interface RoutingMetrics {
  totalMessages: number;
  deliveredMessages: number;
  blockedMessages: number;
  avgLatencyMs: number;
  successRate: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const BEE_ROLE_CONFIG: Record<string, { icon: string; colour: string; description: string }> = {
  QUEEN:   { icon: '👑', colour: '#f59e0b', description: 'Orchestration & Policy' },
  WORKER:  { icon: '🐝', colour: '#eab308', description: 'Message Routing' },
  SCOUT:   { icon: '🔍', colour: '#06b6d4', description: 'Path Discovery' },
  GUARD:   { icon: '🛡️', colour: '#ef4444', description: 'Security Enforcement' },
  DRONE:   { icon: '🚁', colour: '#8b5cf6', description: 'Cleanup & Maintenance' },
  NURSE:   { icon: '💊', colour: '#22c55e', description: 'Health Monitoring' },
  FORAGER: { icon: '🌿', colour: '#84cc16', description: 'Data Collection' },
};

const CLASSIFICATION_CONFIG: Record<string, { colour: string; label: string; icon: string }> = {
  PUBLIC:       { colour: '#22c55e', label: 'Public',       icon: '🌐' },
  INTERNAL:     { colour: '#3b82f6', label: 'Internal',     icon: '🏢' },
  CONFIDENTIAL: { colour: '#f59e0b', label: 'Confidential', icon: '🔒' },
  CLASSIFIED:   { colour: '#f97316', label: 'Classified',   icon: '🔐' },
  VOID:         { colour: '#8b5cf6', label: 'Void',         icon: '🌑' },
};

// ============================================================
// NODE CARD
// ============================================================

const NodeCard: React.FC<{ node: HiveNode }> = ({ node }) => {
  const config = BEE_ROLE_CONFIG[node.role];
  const loadPercent = Math.round((node.currentLoad / node.capacity) * 100);
  const loadColour = loadPercent > 80 ? '#ef4444' : loadPercent > 60 ? '#f97316' : '#22c55e';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      border: `1px solid ${config.colour}44`,
      borderRadius: 14, padding: 16,
      transition: 'all 0.2s',
      cursor: 'pointer',
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = config.colour;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${config.colour}22`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = config.colour + '44';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: config.colour + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          {config.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{node.role}</div>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{node.nodeId}</div>
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: node.status === 'active' ? '#22c55e'
            : node.status === 'busy' ? '#f59e0b'
            : node.status === 'idle' ? '#3b82f6'
            : '#ef4444',
        }} />
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>{config.description}</div>

      {/* Load bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>Load</span>
          <span style={{ fontSize: 10, color: loadColour, fontWeight: 600 }}>{loadPercent}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: loadColour,
            width: `${loadPercent}%`, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Region & specialisation */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, padding: '2px 6px', borderRadius: 4,
          background: '#334155', color: '#94a3b8',
        }}>📍 {node.region}</span>
        {node.specialisation.slice(0, 2).map((s) => (
          <span key={s} style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 4,
            background: config.colour + '22', color: config.colour,
          }}>{s}</span>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// DATA CLASSIFICATION MATRIX
// ============================================================

const ClassificationMatrix: React.FC = () => {
  const userTypes = ['SUPER_ADMIN', 'ORG_ADMIN', 'POWER_USER', 'STANDARD_USER', 'BOT', 'GUEST'];
  const classifications = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'];

  const accessMatrix: Record<string, string[]> = {
    SUPER_ADMIN:   ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'],
    ORG_ADMIN:     ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED'],
    POWER_USER:    ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
    STANDARD_USER: ['PUBLIC', 'INTERNAL'],
    BOT:           ['PUBLIC', 'INTERNAL'],
    GUEST:         ['PUBLIC'],
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      border: '1px solid #334155', borderRadius: 16, padding: 20,
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
        🔐 Data Separation Matrix
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>
                User Type
              </th>
              {classifications.map((cls) => (
                <th key={cls} style={{ padding: '8px 12px', textAlign: 'center', color: CLASSIFICATION_CONFIG[cls].colour, fontWeight: 600 }}>
                  {CLASSIFICATION_CONFIG[cls].icon} {cls}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userTypes.map((userType) => (
              <tr key={userType} style={{ borderTop: '1px solid #1e293b' }}>
                <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>{userType}</td>
                {classifications.map((cls) => {
                  const hasAccess = accessMatrix[userType]?.includes(cls);
                  return (
                    <td key={cls} style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {hasAccess ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 6,
                          background: CLASSIFICATION_CONFIG[cls].colour + '22',
                          color: CLASSIFICATION_CONFIG[cls].colour, fontSize: 14,
                        }}>✓</span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 6,
                          background: '#1e293b', color: '#334155', fontSize: 14,
                        }}>✗</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================
// MESSAGE FLOW LOG
// ============================================================

const MessageFlowLog: React.FC<{ messages: MessageFlow[] }> = ({ messages }) => (
  <div style={{
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: '1px solid #334155', borderRadius: 16, padding: 20,
    maxHeight: 360, overflowY: 'auto',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
        📡 Message Flow Log
      </h3>
      <span style={{ fontSize: 11, color: '#64748b' }}>{messages.length} messages</span>
    </div>
    {messages.map((msg) => {
      const cls = CLASSIFICATION_CONFIG[msg.classification] ?? CLASSIFICATION_CONFIG.PUBLIC;
      return (
        <div key={msg.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: 11,
        }}>
          <span style={{ color: cls.colour, flexShrink: 0 }}>{cls.icon}</span>
          <span style={{ color: '#94a3b8', flex: 1, minWidth: 0 }}>
            <span style={{ color: '#6366f1' }}>{msg.sourceType}</span>
            <span style={{ color: '#64748b' }}> → </span>
            <span style={{ color: '#8b5cf6' }}>{msg.destinationType}</span>
          </span>
          <span style={{
            padding: '1px 6px', borderRadius: 4, fontSize: 10,
            background: msg.status === 'delivered' ? '#22c55e22' : '#ef444422',
            color: msg.status === 'delivered' ? '#22c55e' : '#ef4444',
          }}>{msg.status}</span>
          <span style={{ color: '#64748b', flexShrink: 0 }}>{msg.latencyMs}ms</span>
          <span style={{ color: '#475569', flexShrink: 0 }}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
      );
    })}
  </div>
);

// ============================================================
// TOPOLOGY CANVAS (SVG-based)
// ============================================================

const TopologyCanvas: React.FC<{ nodes: HiveNode[] }> = ({ nodes }) => {
  const canvasRef = useRef<SVGSVGElement>(null);
  const width = 600;
  const height = 300;

  // Position nodes in a bee-hive pattern
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const queen = nodes.find((n) => n.role === 'QUEEN');
  const workers = nodes.filter((n) => n.role === 'WORKER');
  const guards = nodes.filter((n) => n.role === 'GUARD');
  const scouts = nodes.filter((n) => n.role === 'SCOUT');
  const others = nodes.filter((n) => !['QUEEN', 'WORKER', 'GUARD', 'SCOUT'].includes(n.role));

  if (queen) nodePositions[queen.nodeId] = { x: width / 2, y: height / 2 };

  workers.forEach((n, i) => {
    const angle = (i / workers.length) * 2 * Math.PI - Math.PI / 2;
    nodePositions[n.nodeId] = {
      x: width / 2 + Math.cos(angle) * 100,
      y: height / 2 + Math.sin(angle) * 80,
    };
  });

  guards.forEach((n, i) => {
    const angle = (i / guards.length) * 2 * Math.PI;
    nodePositions[n.nodeId] = {
      x: width / 2 + Math.cos(angle) * 180,
      y: height / 2 + Math.sin(angle) * 120,
    };
  });

  scouts.forEach((n, i) => {
    const angle = (i / scouts.length) * 2 * Math.PI + Math.PI / 4;
    nodePositions[n.nodeId] = {
      x: width / 2 + Math.cos(angle) * 240,
      y: height / 2 + Math.sin(angle) * 130,
    };
  });

  others.forEach((n, i) => {
    nodePositions[n.nodeId] = { x: 40 + i * 60, y: height - 30 };
  });

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      border: '1px solid #334155', borderRadius: 16, padding: 20,
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
        🐝 Colony Topology
      </h3>
      <svg ref={canvasRef} width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxHeight: 280 }}>
        {/* Background hexagon grid */}
        <defs>
          <pattern id="hex-grid" x="0" y="0" width="40" height="46" patternUnits="userSpaceOnUse">
            <polygon points="20,2 38,12 38,34 20,44 2,34 2,12"
              fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#hex-grid)" opacity="0.5" />

        {/* Connections: queen to workers */}
        {queen && workers.map((worker) => {
          const qp = nodePositions[queen.nodeId];
          const wp = nodePositions[worker.nodeId];
          if (!qp || !wp) return null;
          return (
            <line key={worker.nodeId}
              x1={qp.x} y1={qp.y} x2={wp.x} y2={wp.y}
              stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.3"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Connections: workers to guards */}
        {workers.map((worker, wi) => {
          const guard = guards[wi % guards.length];
          if (!guard) return null;
          const wp = nodePositions[worker.nodeId];
          const gp = nodePositions[guard.nodeId];
          if (!wp || !gp) return null;
          return (
            <line key={`${worker.nodeId}-${guard.nodeId}`}
              x1={wp.x} y1={wp.y} x2={gp.x} y2={gp.y}
              stroke="#ef4444" strokeWidth="1" strokeOpacity="0.2"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions[node.nodeId];
          if (!pos) return null;
          const config = BEE_ROLE_CONFIG[node.role];
          const isQueen = node.role === 'QUEEN';
          const r = isQueen ? 22 : 14;

          return (
            <g key={node.nodeId}>
              {/* Glow */}
              <circle cx={pos.x} cy={pos.y} r={r + 6}
                fill={config.colour} opacity="0.08" />
              {/* Node circle */}
              <circle cx={pos.x} cy={pos.y} r={r}
                fill="#0f172a" stroke={config.colour} strokeWidth={isQueen ? 2.5 : 1.5} />
              {/* Icon */}
              <text x={pos.x} y={pos.y + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={isQueen ? 16 : 11}>
                {config.icon}
              </text>
              {/* Label */}
              <text x={pos.x} y={pos.y + r + 12}
                textAnchor="middle" fill="#64748b" fontSize="8">
                {node.nodeId}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ============================================================
// MAIN DASHBOARD
// ============================================================

const HiveDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'topology' | 'routing' | 'channels' | 'matrix'>('overview');

  const mockNodes: HiveNode[] = [
    { nodeId: 'queen-001', role: 'QUEEN', status: 'active', region: 'eu-west-1', capacity: 10000, currentLoad: 2340, specialisation: ['orchestration', 'policy'] },
    { nodeId: 'worker-001', role: 'WORKER', status: 'busy', region: 'eu-west-1', capacity: 2000, currentLoad: 1650, specialisation: ['general'] },
    { nodeId: 'worker-002', role: 'WORKER', status: 'active', region: 'eu-west-1', capacity: 2000, currentLoad: 890, specialisation: ['general'] },
    { nodeId: 'worker-003', role: 'WORKER', status: 'active', region: 'us-east-1', capacity: 2000, currentLoad: 1200, specialisation: ['general'] },
    { nodeId: 'worker-004', role: 'WORKER', status: 'idle', region: 'ap-southeast-1', capacity: 2000, currentLoad: 120, specialisation: ['general'] },
    { nodeId: 'worker-005', role: 'WORKER', status: 'active', region: 'eu-central-1', capacity: 2000, currentLoad: 980, specialisation: ['general'] },
    { nodeId: 'guard-001', role: 'GUARD', status: 'active', region: 'eu-west-1', capacity: 5000, currentLoad: 1800, specialisation: ['security', 'classification'] },
    { nodeId: 'guard-002', role: 'GUARD', status: 'active', region: 'us-east-1', capacity: 5000, currentLoad: 2100, specialisation: ['security'] },
    { nodeId: 'guard-003', role: 'GUARD', status: 'active', region: 'ap-southeast-1', capacity: 5000, currentLoad: 900, specialisation: ['classification'] },
    { nodeId: 'scout-001', role: 'SCOUT', status: 'active', region: 'eu-west-1', capacity: 1000, currentLoad: 340, specialisation: ['discovery', 'routing'] },
    { nodeId: 'scout-002', role: 'SCOUT', status: 'active', region: 'us-east-1', capacity: 1000, currentLoad: 280, specialisation: ['discovery'] },
    { nodeId: 'nurse-001', role: 'NURSE', status: 'active', region: 'eu-west-1', capacity: 500, currentLoad: 45, specialisation: ['health', 'monitoring'] },
    { nodeId: 'drone-001', role: 'DRONE', status: 'idle', region: 'eu-west-1', capacity: 500, currentLoad: 12, specialisation: ['cleanup'] },
    { nodeId: 'forager-001', role: 'FORAGER', status: 'active', region: 'eu-west-1', capacity: 1000, currentLoad: 560, specialisation: ['data_collection'] },
  ];

  const mockMessages: MessageFlow[] = [
    { id: 'MSG-001', sourceType: 'STANDARD_USER', destinationType: 'api-gateway', classification: 'INTERNAL', status: 'delivered', latencyMs: 8, timestamp: new Date(Date.now() - 5000).toISOString() },
    { id: 'MSG-002', sourceType: 'BOT', destinationType: 'database', classification: 'CONFIDENTIAL', status: 'delivered', latencyMs: 12, timestamp: new Date(Date.now() - 10000).toISOString() },
    { id: 'MSG-003', sourceType: 'GUEST', destinationType: 'classified-service', classification: 'CLASSIFIED', status: 'blocked', latencyMs: 2, timestamp: new Date(Date.now() - 15000).toISOString() },
    { id: 'MSG-004', sourceType: 'SUPER_ADMIN', destinationType: 'void-service', classification: 'VOID', status: 'delivered', latencyMs: 18, timestamp: new Date(Date.now() - 20000).toISOString() },
    { id: 'MSG-005', sourceType: 'AGENT', destinationType: 'hive-router', classification: 'INTERNAL', status: 'delivered', latencyMs: 6, timestamp: new Date(Date.now() - 25000).toISOString() },
  ];

  const routingMetrics: RoutingMetrics = {
    totalMessages: 48291,
    deliveredMessages: 48204,
    blockedMessages: 87,
    avgLatencyMs: 9.4,
    successRate: 0.9982,
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '🐝' },
    { id: 'topology', label: 'Topology', icon: '🗺️' },
    { id: 'routing', label: 'Routing', icon: '📡' },
    { id: 'matrix', label: 'Access Matrix', icon: '🔐' },
  ] as const;

  const totalLoad = mockNodes.reduce((s, n) => s + n.currentLoad, 0);
  const totalCapacity = mockNodes.reduce((s, n) => s + n.capacity, 0);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#f1f5f9',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1e293b', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 40 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #eab308, #ca8a04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🐝</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>The HIVE</div>
              <div style={{ fontSize: 10, color: '#eab308', letterSpacing: '0.1em' }}>SWARM DATA ROUTER</div>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: activeTab === tab.id ? '#eab308' : 'transparent',
                color: activeTab === tab.id ? '#0f172a' : '#94a3b8',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
            {mockNodes.filter((n) => n.status === 'active').length}/{mockNodes.length} nodes active
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
              {[
                { label: 'Total Nodes', value: mockNodes.length, icon: '🐝', colour: '#eab308', sub: `${mockNodes.filter((n) => n.status === 'active').length} active` },
                { label: 'Messages (24h)', value: routingMetrics.totalMessages.toLocaleString(), icon: '📡', colour: '#6366f1', sub: `${(routingMetrics.successRate * 100).toFixed(2)}% success` },
                { label: 'Blocked', value: routingMetrics.blockedMessages, icon: '🛡️', colour: '#ef4444', sub: 'Guard enforced' },
                { label: 'Avg Latency', value: `${routingMetrics.avgLatencyMs}ms`, icon: '⚡', colour: '#22c55e', sub: 'Sub-10ms routing' },
                { label: 'Colony Load', value: `${Math.round((totalLoad / totalCapacity) * 100)}%`, icon: '📊', colour: '#f59e0b', sub: `${totalLoad.toLocaleString()} / ${totalCapacity.toLocaleString()}` },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                  border: '1px solid #334155', borderRadius: 16, padding: 18,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: stat.colour + '22', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>{stat.icon}</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{stat.label}</div>
                    <div style={{ fontSize: 10, color: stat.colour, marginTop: 1 }}>{stat.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bee colony grid */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              border: '1px solid #334155', borderRadius: 16, padding: 20,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>
                🐝 Bee Colony
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {mockNodes.map((node) => <NodeCard key={node.nodeId} node={node} />)}
              </div>
            </div>

            <MessageFlowLog messages={mockMessages} />
          </div>
        )}

        {activeTab === 'topology' && <TopologyCanvas nodes={mockNodes} />}
        {activeTab === 'routing' && <MessageFlowLog messages={mockMessages} />}
        {activeTab === 'matrix' && <ClassificationMatrix />}
      </div>
    </div>
  );
};

export default HiveDashboard;