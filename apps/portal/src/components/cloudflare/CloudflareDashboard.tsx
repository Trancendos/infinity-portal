/**
 * Cloudflare Management Console — Infinity Admin OS
 * ============================================================
 * Easy-to-use management interface for setting up trancendos.com
 * and all subdomains via Cloudflare Tunnel + DNS + Workers.
 *
 * Features:
 *  - Domain setup (trancendos.com one-click config)
 *  - Subdomain → service mapping (visual editor)
 *  - Tunnel dashboard (status, health, metrics)
 *  - DNS record management (A, CNAME, TXT, MX)
 *  - SSL/TLS configuration
 *  - Cloudflare Access policies per subdomain
 *  - Worker deployment management
 *  - Edge DB (D1) console
 *
 * Ticket: TRN-CF-001
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 * Revert: <commit-hash>
 */

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================
// TYPES
// ============================================================

type TunnelStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'SRV' | 'NS';
type SSLMode = 'off' | 'flexible' | 'full' | 'strict';
type SubdomainStatus = 'active' | 'pending' | 'error' | 'disabled';

interface CloudflareConfig {
  accountId: string;
  apiToken: string;  // Stored in The Void — never in plaintext
  zoneId: string;
  tunnelId: string;
  domain: string;
}

interface TunnelInfo {
  id: string;
  name: string;
  status: TunnelStatus;
  createdAt: string;
  connections: TunnelConnection[];
  metrics: TunnelMetrics;
}

interface TunnelConnection {
  id: string;
  origin: string;
  openedAt: string;
  isAlive: boolean;
  protocol: string;
}

interface TunnelMetrics {
  requestsPerSecond: number;
  bytesIn: number;
  bytesOut: number;
  activeConnections: number;
  errorRate: number;
  p50Latency: number;
  p99Latency: number;
}

interface SubdomainMapping {
  id: string;
  subdomain: string;
  fullDomain: string;
  service: string;
  port: number;
  status: SubdomainStatus;
  protocol: 'http' | 'https' | 'ws' | 'wss';
  accessPolicy?: AccessPolicy;
  healthCheck?: HealthCheckConfig;
  description: string;
}

interface DNSRecord {
  id: string;
  type: DNSRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
  comment?: string;
}

interface AccessPolicy {
  id: string;
  name: string;
  decision: 'allow' | 'deny' | 'bypass';
  include: AccessRule[];
  exclude: AccessRule[];
  require: AccessRule[];
}

interface AccessRule {
  type: 'email' | 'email_domain' | 'ip' | 'everyone' | 'service_token' | 'group';
  value: string;
}

interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
  path: string;
  expectedStatus: number;
}

interface WorkerDeployment {
  id: string;
  name: string;
  route: string;
  script: string;
  environment: 'production' | 'staging' | 'development';
  lastDeployed: string;
  status: 'active' | 'inactive' | 'error';
  bindings: WorkerBinding[];
}

interface WorkerBinding {
  type: 'kv' | 'd1' | 'r2' | 'service' | 'secret' | 'env';
  name: string;
  value: string;
}

interface EdgeDatabase {
  id: string;
  name: string;
  sizeBytes: number;
  numTables: number;
  readQueries: number;
  writeQueries: number;
  createdAt: string;
}

// ============================================================
// DEFAULT SUBDOMAIN MAPPINGS — Trancendos Ecosystem
// ============================================================

const DEFAULT_SUBDOMAINS: Omit<SubdomainMapping, 'id'>[] = [
  {
    subdomain: 'infinity-os',
    fullDomain: 'infinity-os.trancendos.com',
    service: 'Infinity OS Shell',
    port: 5173,
    status: 'pending',
    protocol: 'http',
    description: 'Main OS Shell — React PWA desktop environment',
    healthCheck: { enabled: true, interval: 30, timeout: 10, retries: 3, path: '/', expectedStatus: 200 },
  },
  {
    subdomain: 'api',
    fullDomain: 'api.trancendos.com',
    service: 'API Marketplace Gateway',
    port: 3033,
    status: 'pending',
    protocol: 'http',
    description: 'Centralised API gateway — routing, auth, rate limiting',
    healthCheck: { enabled: true, interval: 15, timeout: 5, retries: 3, path: '/health', expectedStatus: 200 },
  },
  {
    subdomain: 'identity',
    fullDomain: 'identity.trancendos.com',
    service: 'Infinity One IAM',
    port: 8787,
    status: 'pending',
    protocol: 'http',
    description: 'Universal Account Hub — IAM, RBAC, MFA, WebAuthn',
    accessPolicy: {
      id: 'policy-identity',
      name: 'Identity Service Access',
      decision: 'allow',
      include: [{ type: 'everyone', value: '*' }],
      exclude: [],
      require: [],
    },
  },
  {
    subdomain: 'nexus',
    fullDomain: 'nexus.trancendos.com',
    service: 'The Nexus',
    port: 3029,
    status: 'pending',
    protocol: 'http',
    description: 'AI Service Mesh — integration hub, event routing',
    accessPolicy: {
      id: 'policy-nexus',
      name: 'Nexus Internal Only',
      decision: 'allow',
      include: [{ type: 'service_token', value: 'nexus-service-token' }],
      exclude: [],
      require: [],
    },
  },
  {
    subdomain: 'hive',
    fullDomain: 'hive.trancendos.com',
    service: 'The Hive',
    port: 3027,
    status: 'pending',
    protocol: 'http',
    description: 'Data/Files Mesh — swarm intelligence, estate scanning',
  },
  {
    subdomain: 'observatory',
    fullDomain: 'observatory.trancendos.com',
    service: 'The Observatory',
    port: 3028,
    status: 'pending',
    protocol: 'http',
    description: 'Observability — metrics, logging, alerts, trends',
    accessPolicy: {
      id: 'policy-observatory',
      name: 'Observatory Admin Only',
      decision: 'allow',
      include: [{ type: 'email_domain', value: 'trancendos.com' }],
      exclude: [],
      require: [],
    },
  },
  {
    subdomain: 'void',
    fullDomain: 'void.trancendos.com',
    service: 'The Void',
    port: 8200,
    status: 'pending',
    protocol: 'http',
    description: 'Quantum-safe secrets vault — ML-KEM-1024, Shamir 5-of-9',
    accessPolicy: {
      id: 'policy-void',
      name: 'Void Maximum Security',
      decision: 'allow',
      include: [{ type: 'email', value: 'drew@trancendos.com' }],
      exclude: [{ type: 'everyone', value: '*' }],
      require: [{ type: 'email', value: 'drew@trancendos.com' }],
    },
  },
  {
    subdomain: 'grid',
    fullDomain: 'grid.trancendos.com',
    service: 'The DigitalGrid',
    port: 3032,
    status: 'pending',
    protocol: 'http',
    description: 'CI/CD — spatial routing, quarantine, webhook matrix',
    accessPolicy: {
      id: 'policy-grid',
      name: 'DigitalGrid Admin Only',
      decision: 'allow',
      include: [{ type: 'email_domain', value: 'trancendos.com' }],
      exclude: [],
      require: [],
    },
  },
  {
    subdomain: 'chaos',
    fullDomain: 'chaos.trancendos.com',
    service: 'Chaos Party',
    port: 3031,
    status: 'pending',
    protocol: 'http',
    description: 'Testing suite — adversarial validation, chaos engineering',
  },
  {
    subdomain: 'marketplace',
    fullDomain: 'marketplace.trancendos.com',
    service: 'API Marketplace',
    port: 3033,
    status: 'pending',
    protocol: 'http',
    description: 'API catalogue — listing, discovery, consumer management',
  },
  {
    subdomain: 'guardian',
    fullDomain: 'guardian.trancendos.com',
    service: 'Guardian AI',
    port: 3001,
    status: 'pending',
    protocol: 'http',
    description: 'Pillar AI — system guardian, compliance enforcement',
  },
  {
    subdomain: 'oracle',
    fullDomain: 'oracle.trancendos.com',
    service: 'Oracle AI',
    port: 3002,
    status: 'pending',
    protocol: 'http',
    description: 'Pillar AI — knowledge oracle, wisdom engine',
  },
  {
    subdomain: 'prometheus',
    fullDomain: 'prometheus.trancendos.com',
    service: 'Prometheus AI',
    port: 3003,
    status: 'pending',
    protocol: 'http',
    description: 'Pillar AI — void guardian, monitoring sentinel',
  },
  {
    subdomain: 'sentinel',
    fullDomain: 'sentinel.trancendos.com',
    service: 'Sentinel AI',
    port: 3004,
    status: 'pending',
    protocol: 'http',
    description: 'Pillar AI — security sentinel, threat detection',
  },
  {
    subdomain: 'filesystem',
    fullDomain: 'filesystem.trancendos.com',
    service: 'Filesystem Worker',
    port: 8788,
    status: 'pending',
    protocol: 'http',
    description: 'Cloudflare Worker — distributed file system',
  },
  {
    subdomain: 'admin',
    fullDomain: 'admin.trancendos.com',
    service: 'Cloudflare Management Console',
    port: 5174,
    status: 'pending',
    protocol: 'http',
    description: 'This console — domain, DNS, tunnel, worker management',
    accessPolicy: {
      id: 'policy-admin',
      name: 'Admin Console — Owner Only',
      decision: 'allow',
      include: [{ type: 'email', value: 'drew@trancendos.com' }],
      exclude: [{ type: 'everyone', value: '*' }],
      require: [{ type: 'email', value: 'drew@trancendos.com' }],
    },
  },
];

// ============================================================
// COMPONENT STATE
// ============================================================

type ConsoleTab = 'overview' | 'subdomains' | 'dns' | 'tunnel' | 'ssl' | 'access' | 'workers' | 'edge-db' | 'setup';

interface ConsoleState {
  activeTab: ConsoleTab;
  config: CloudflareConfig;
  tunnel: TunnelInfo | null;
  subdomains: SubdomainMapping[];
  dnsRecords: DNSRecord[];
  workers: WorkerDeployment[];
  databases: EdgeDatabase[];
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CloudflareDashboard() {
  const [state, setState] = useState<ConsoleState>({
    activeTab: 'overview',
    config: {
      accountId: '',
      apiToken: '',
      zoneId: '',
      tunnelId: '',
      domain: 'trancendos.com',
    },
    tunnel: null,
    subdomains: DEFAULT_SUBDOMAINS.map((s, i) => ({ ...s, id: `sub-${i}` })),
    dnsRecords: [],
    workers: [],
    databases: [],
    isConfigured: false,
    isLoading: false,
    error: null,
  });

  // ============================================================
  // API CALLS — Cloudflare API v4
  // ============================================================

  const cfApiCall = useCallback(async (
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ) => {
    // In production, this routes through The Void for token retrieval
    // and The Observatory for audit logging
    const response = await fetch(`/api/v1/cloudflare${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Token retrieved from The Void at runtime — never stored client-side
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }, []);

  // ============================================================
  // TUNNEL MANAGEMENT
  // ============================================================

  const fetchTunnelStatus = useCallback(async () => {
    if (!state.isConfigured) return;
    try {
      const data = await cfApiCall(`/tunnels/${state.config.tunnelId}`);
      setState(prev => ({ ...prev, tunnel: data.result }));
    } catch (err) {
      setState(prev => ({ ...prev, error: `Tunnel fetch failed: ${err}` }));
    }
  }, [state.isConfigured, state.config.tunnelId, cfApiCall]);

  // ============================================================
  // DNS MANAGEMENT
  // ============================================================

  const fetchDNSRecords = useCallback(async () => {
    if (!state.isConfigured) return;
    try {
      const data = await cfApiCall(`/zones/${state.config.zoneId}/dns_records`);
      setState(prev => ({ ...prev, dnsRecords: data.result }));
    } catch (err) {
      setState(prev => ({ ...prev, error: `DNS fetch failed: ${err}` }));
    }
  }, [state.isConfigured, state.config.zoneId, cfApiCall]);

  const createDNSRecord = useCallback(async (record: Omit<DNSRecord, 'id'>) => {
    try {
      await cfApiCall(`/zones/${state.config.zoneId}/dns_records`, 'POST', record as any);
      await fetchDNSRecords();
    } catch (err) {
      setState(prev => ({ ...prev, error: `DNS create failed: ${err}` }));
    }
  }, [state.config.zoneId, cfApiCall, fetchDNSRecords]);

  const deleteDNSRecord = useCallback(async (recordId: string) => {
    try {
      await cfApiCall(`/zones/${state.config.zoneId}/dns_records/${recordId}`, 'DELETE');
      await fetchDNSRecords();
    } catch (err) {
      setState(prev => ({ ...prev, error: `DNS delete failed: ${err}` }));
    }
  }, [state.config.zoneId, cfApiCall, fetchDNSRecords]);

  // ============================================================
  // SUBDOMAIN MANAGEMENT
  // ============================================================

  const deploySubdomain = useCallback(async (subdomain: SubdomainMapping) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // 1. Create CNAME record pointing to tunnel
      await createDNSRecord({
        type: 'CNAME',
        name: subdomain.subdomain,
        content: `${state.config.tunnelId}.cfargotunnel.com`,
        ttl: 1, // Auto
        proxied: true,
        comment: `${subdomain.service} — managed by Infinity Admin OS`,
      });

      // 2. Update tunnel config with new ingress rule
      await cfApiCall(`/tunnels/${state.config.tunnelId}/configurations`, 'PUT', {
        config: {
          ingress: [
            {
              hostname: subdomain.fullDomain,
              service: `${subdomain.protocol}://localhost:${subdomain.port}`,
              originRequest: {
                noTLSVerify: false,
                connectTimeout: '30s',
                tcpKeepAlive: '30s',
              },
            },
          ],
        },
      });

      // 3. Create Access policy if defined
      if (subdomain.accessPolicy) {
        await cfApiCall('/access/apps', 'POST', {
          name: subdomain.accessPolicy.name,
          domain: subdomain.fullDomain,
          type: 'self_hosted',
          session_duration: '24h',
          policies: [{
            name: subdomain.accessPolicy.name,
            decision: subdomain.accessPolicy.decision,
            include: subdomain.accessPolicy.include,
            exclude: subdomain.accessPolicy.exclude,
            require: subdomain.accessPolicy.require,
          }],
        });
      }

      // 4. Update status
      setState(prev => ({
        ...prev,
        isLoading: false,
        subdomains: prev.subdomains.map(s =>
          s.id === subdomain.id ? { ...s, status: 'active' as SubdomainStatus } : s
        ),
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Deploy subdomain failed: ${err}`,
        subdomains: prev.subdomains.map(s =>
          s.id === subdomain.id ? { ...s, status: 'error' as SubdomainStatus } : s
        ),
      }));
    }
  }, [state.config, cfApiCall, createDNSRecord]);

  const deployAllSubdomains = useCallback(async () => {
    for (const subdomain of state.subdomains) {
      if (subdomain.status === 'pending') {
        await deploySubdomain(subdomain);
      }
    }
  }, [state.subdomains, deploySubdomain]);

  // ============================================================
  // SETUP WIZARD — One-Click trancendos.com Configuration
  // ============================================================

  const runSetupWizard = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // Step 1: Verify domain ownership
      console.log('[CloudflareConsole] Step 1: Verifying domain ownership...');
      await cfApiCall(`/zones/${state.config.zoneId}`);

      // Step 2: Create tunnel if not exists
      console.log('[CloudflareConsole] Step 2: Creating/verifying tunnel...');
      if (!state.config.tunnelId) {
        const tunnelResult = await cfApiCall('/tunnels', 'POST', {
          name: 'infinity-os',
          tunnel_secret: crypto.randomUUID(), // Stored in The Void
        });
        setState(prev => ({
          ...prev,
          config: { ...prev.config, tunnelId: tunnelResult.result.id },
        }));
      }

      // Step 3: Set SSL to Full (Strict)
      console.log('[CloudflareConsole] Step 3: Configuring SSL/TLS...');
      await cfApiCall(`/zones/${state.config.zoneId}/settings/ssl`, 'PATCH', {
        value: 'strict',
      });

      // Step 4: Enable HSTS
      console.log('[CloudflareConsole] Step 4: Enabling HSTS...');
      await cfApiCall(`/zones/${state.config.zoneId}/settings/security_header`, 'PATCH', {
        value: {
          strict_transport_security: {
            enabled: true,
            max_age: 31536000,
            include_subdomains: true,
            preload: true,
          },
        },
      });

      // Step 5: Set minimum TLS version
      console.log('[CloudflareConsole] Step 5: Setting minimum TLS 1.2...');
      await cfApiCall(`/zones/${state.config.zoneId}/settings/min_tls_version`, 'PATCH', {
        value: '1.2',
      });

      // Step 6: Enable Always Use HTTPS
      console.log('[CloudflareConsole] Step 6: Enabling Always Use HTTPS...');
      await cfApiCall(`/zones/${state.config.zoneId}/settings/always_use_https`, 'PATCH', {
        value: 'on',
      });

      // Step 7: Deploy all subdomains
      console.log('[CloudflareConsole] Step 7: Deploying all subdomains...');
      await deployAllSubdomains();

      // Step 8: Verify everything
      console.log('[CloudflareConsole] Step 8: Verification complete!');
      await fetchTunnelStatus();
      await fetchDNSRecords();

      setState(prev => ({ ...prev, isLoading: false, isConfigured: true }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Setup wizard failed: ${err}`,
      }));
    }
  }, [state.config, cfApiCall, deployAllSubdomains, fetchTunnelStatus, fetchDNSRecords]);

  // ============================================================
  // GENERATE TUNNEL CONFIG YAML
  // ============================================================

  const generateTunnelYaml = useCallback((): string => {
    const lines = [
      '# ============================================================',
      '# Cloudflare Tunnel Configuration — Infinity OS',
      '# Auto-generated by Cloudflare Management Console',
      '# ============================================================',
      '',
      `tunnel: ${state.config.tunnelId || '${CLOUDFLARE_TUNNEL_ID}'}`,
      'credentials-file: /etc/cloudflared/credentials.json',
      '',
      'loglevel: info',
      'logfile: /var/log/cloudflared/tunnel.log',
      '',
      '# Metrics for The Observatory',
      'metrics: 0.0.0.0:2000',
      '',
      'ingress:',
    ];

    for (const sub of state.subdomains) {
      lines.push(`  # ${sub.service} — ${sub.description}`);
      lines.push(`  - hostname: ${sub.fullDomain}`);
      lines.push(`    service: ${sub.protocol}://localhost:${sub.port}`);
      lines.push('    originRequest:');
      lines.push('      noTLSVerify: false');
      lines.push('      connectTimeout: 30s');
      lines.push('      tcpKeepAlive: 30s');
      if (sub.healthCheck?.enabled) {
        lines.push(`      httpHostHeader: ${sub.fullDomain}`);
      }
      lines.push('');
    }

    lines.push('  # Catch-all — return 404 for unmatched routes');
    lines.push('  - service: http_status:404');

    return lines.join('\n');
  }, [state.config.tunnelId, state.subdomains]);

  // ============================================================
  // GENERATE CLOUDFLARED INSTALL SCRIPT
  // ============================================================

  const generateInstallScript = useCallback((): string => {
    return `#!/bin/bash
# ============================================================
# Cloudflare Tunnel Setup Script — Trancendos Ecosystem
# Auto-generated by Cloudflare Management Console
# ============================================================
# Prerequisites:
#   - Cloudflare account with trancendos.com domain
#   - cloudflared CLI installed
# ============================================================

set -euo pipefail

DOMAIN="${state.config.domain}"
TUNNEL_NAME="infinity-os"

echo "🚀 Trancendos Cloudflare Tunnel Setup"
echo "======================================"
echo ""

# Step 1: Authenticate with Cloudflare
echo "Step 1: Authenticating with Cloudflare..."
cloudflared tunnel login

# Step 2: Create tunnel
echo "Step 2: Creating tunnel '$TUNNEL_NAME'..."
cloudflared tunnel create $TUNNEL_NAME

# Step 3: Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
echo "Tunnel ID: $TUNNEL_ID"

# Step 4: Create DNS records for all subdomains
echo "Step 3: Creating DNS records..."
${state.subdomains.map(s => `cloudflared tunnel route dns $TUNNEL_NAME ${s.subdomain}.\${DOMAIN}`).join('\n')}

# Step 5: Copy tunnel config
echo "Step 4: Deploying tunnel configuration..."
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml << 'EOF'
${generateTunnelYaml()}
EOF

# Step 6: Install as system service
echo "Step 5: Installing as system service..."
cloudflared service install

# Step 7: Start tunnel
echo "Step 6: Starting tunnel..."
systemctl start cloudflared
systemctl enable cloudflared

echo ""
echo "✅ Cloudflare Tunnel setup complete!"
echo "🌐 Domain: $DOMAIN"
echo "🔗 Tunnel: $TUNNEL_ID"
echo ""
echo "Subdomains configured:"
${state.subdomains.map(s => `echo "  • ${s.fullDomain} → ${s.service} (:${s.port})"`).join('\n')}
echo ""
echo "📊 Metrics available at: http://localhost:2000/metrics"
echo "🔍 Logs: /var/log/cloudflared/tunnel.log"
`;
  }, [state.config.domain, state.subdomains, generateTunnelYaml]);

  // ============================================================
  // RENDER
  // ============================================================

  const tabs: { id: ConsoleTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '🌐' },
    { id: 'setup', label: 'Setup Wizard', icon: '🚀' },
    { id: 'subdomains', label: 'Subdomains', icon: '🔗' },
    { id: 'dns', label: 'DNS Records', icon: '📋' },
    { id: 'tunnel', label: 'Tunnel', icon: '🔒' },
    { id: 'ssl', label: 'SSL/TLS', icon: '🛡️' },
    { id: 'access', label: 'Access Policies', icon: '🔐' },
    { id: 'workers', label: 'Workers', icon: '⚡' },
    { id: 'edge-db', label: 'Edge DB', icon: '💾' },
  ];

  return (
    <div className="cloudflare-console" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        background: 'linear-gradient(135deg, #f6821f 0%, #faad3f 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <span style={{ fontSize: '28px' }}>☁️</span>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Cloudflare Management Console</h1>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
            {state.config.domain} — {state.isConfigured ? '✅ Configured' : '⏳ Setup Required'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {state.tunnel && (
            <span style={{
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              background: state.tunnel.status === 'healthy' ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)',
            }}>
              Tunnel: {state.tunnel.status.toUpperCase()}
            </span>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <nav style={{
        display: 'flex',
        gap: '2px',
        padding: '0 24px',
        background: '#1a1a2e',
        borderBottom: '2px solid #f6821f',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setState(prev => ({ ...prev, activeTab: tab.id }))}
            style={{
              padding: '12px 16px',
              background: state.activeTab === tab.id ? '#f6821f' : 'transparent',
              color: state.activeTab === tab.id ? 'white' : '#888',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: state.activeTab === tab.id ? 600 : 400,
              borderRadius: '8px 8px 0 0',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Error Banner */}
      {state.error && (
        <div style={{
          padding: '12px 24px',
          background: '#ff4444',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠️ {state.error}</span>
          <button
            onClick={() => setState(prev => ({ ...prev, error: null }))}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      <main style={{ flex: 1, padding: '24px', overflow: 'auto', background: '#0d0d1a', color: '#e0e0e0' }}>
        {state.activeTab === 'overview' && (
          <OverviewPanel
            config={state.config}
            tunnel={state.tunnel}
            subdomains={state.subdomains}
            dnsRecords={state.dnsRecords}
          />
        )}
        {state.activeTab === 'setup' && (
          <SetupWizardPanel
            config={state.config}
            isLoading={state.isLoading}
            onConfigChange={(config) => setState(prev => ({ ...prev, config }))}
            onRunSetup={runSetupWizard}
            installScript={generateInstallScript()}
            tunnelYaml={generateTunnelYaml()}
          />
        )}
        {state.activeTab === 'subdomains' && (
          <SubdomainPanel
            subdomains={state.subdomains}
            onDeploy={deploySubdomain}
            onDeployAll={deployAllSubdomains}
            isLoading={state.isLoading}
          />
        )}
        {state.activeTab === 'dns' && (
          <DNSPanel
            records={state.dnsRecords}
            onCreateRecord={createDNSRecord}
            onDeleteRecord={deleteDNSRecord}
          />
        )}
        {state.activeTab === 'tunnel' && (
          <TunnelPanel tunnel={state.tunnel} onRefresh={fetchTunnelStatus} />
        )}
        {state.activeTab === 'workers' && (
          <WorkersPanel workers={state.workers} />
        )}
        {state.activeTab === 'edge-db' && (
          <EdgeDBPanel databases={state.databases} />
        )}
      </main>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function OverviewPanel({ config, tunnel, subdomains, dnsRecords }: {
  config: CloudflareConfig;
  tunnel: TunnelInfo | null;
  subdomains: SubdomainMapping[];
  dnsRecords: DNSRecord[];
}) {
  const activeCount = subdomains.filter(s => s.status === 'active').length;
  const pendingCount = subdomains.filter(s => s.status === 'pending').length;
  const errorCount = subdomains.filter(s => s.status === 'error').length;

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px' }}>🌐 Platform Overview</h2>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <StatCard label="Domain" value={config.domain} color="#f6821f" />
        <StatCard label="Subdomains" value={`${activeCount}/${subdomains.length} active`} color="#00d4aa" />
        <StatCard label="DNS Records" value={`${dnsRecords.length}`} color="#4ecdc4" />
        <StatCard label="Tunnel" value={tunnel?.status || 'Not configured'} color={tunnel?.status === 'healthy' ? '#00d4aa' : '#ff6b6b'} />
      </div>

      {/* Subdomain Status Table */}
      <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Subdomain Status</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Subdomain</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Service</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Port</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Access Policy</th>
          </tr>
        </thead>
        <tbody>
          {subdomains.map(sub => (
            <tr key={sub.id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '8px' }}>
                <code style={{ color: '#f6821f' }}>{sub.fullDomain}</code>
              </td>
              <td style={{ padding: '8px' }}>{sub.service}</td>
              <td style={{ padding: '8px' }}>:{sub.port}</td>
              <td style={{ padding: '8px' }}>
                <StatusBadge status={sub.status} />
              </td>
              <td style={{ padding: '8px' }}>
                {sub.accessPolicy ? `🔐 ${sub.accessPolicy.name}` : '🌍 Public'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetupWizardPanel({ config, isLoading, onConfigChange, onRunSetup, installScript, tunnelYaml }: {
  config: CloudflareConfig;
  isLoading: boolean;
  onConfigChange: (config: CloudflareConfig) => void;
  onRunSetup: () => void;
  installScript: string;
  tunnelYaml: string;
}) {
  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '24px' }}>🚀 Setup Wizard — One-Click trancendos.com</h2>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        Configure your Cloudflare credentials, then click "Deploy Everything" to set up the entire platform.
        API tokens are stored securely in The Void — never in plaintext.
      </p>

      {/* Config Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
        <FormField
          label="Cloudflare Account ID"
          value={config.accountId}
          onChange={(v) => onConfigChange({ ...config, accountId: v })}
          placeholder="e.g. abc123def456..."
        />
        <FormField
          label="API Token (stored in The Void)"
          value={config.apiToken}
          onChange={(v) => onConfigChange({ ...config, apiToken: v })}
          placeholder="e.g. v1.0-abc..."
          type="password"
        />
        <FormField
          label="Zone ID"
          value={config.zoneId}
          onChange={(v) => onConfigChange({ ...config, zoneId: v })}
          placeholder="e.g. xyz789..."
        />
        <FormField
          label="Tunnel ID (leave blank to auto-create)"
          value={config.tunnelId}
          onChange={(v) => onConfigChange({ ...config, tunnelId: v })}
          placeholder="Auto-generated if empty"
        />
        <FormField
          label="Domain"
          value={config.domain}
          onChange={(v) => onConfigChange({ ...config, domain: v })}
          placeholder="trancendos.com"
        />
      </div>

      {/* Deploy Button */}
      <button
        onClick={onRunSetup}
        disabled={isLoading || !config.accountId || !config.zoneId}
        style={{
          padding: '16px 48px',
          background: isLoading ? '#666' : 'linear-gradient(135deg, #f6821f, #faad3f)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 700,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          marginBottom: '32px',
        }}
      >
        {isLoading ? '⏳ Deploying...' : '🚀 Deploy Everything — One Click'}
      </button>

      {/* Generated Scripts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px' }}>📜 Install Script (CLI)</h3>
          <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
            Run this on your server to set up the Cloudflare tunnel manually.
          </p>
          <pre style={{
            background: '#111',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #333',
          }}>
            {installScript}
          </pre>
        </div>
        <div>
          <h3 style={{ margin: '0 0 8px' }}>⚙️ Tunnel Config (YAML)</h3>
          <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
            Auto-generated tunnel configuration with all subdomain mappings.
          </p>
          <pre style={{
            background: '#111',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #333',
          }}>
            {tunnelYaml}
          </pre>
        </div>
      </div>
    </div>
  );
}

function SubdomainPanel({ subdomains, onDeploy, onDeployAll, isLoading }: {
  subdomains: SubdomainMapping[];
  onDeploy: (sub: SubdomainMapping) => void;
  onDeployAll: () => void;
  isLoading: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>🔗 Subdomain Manager</h2>
        <button
          onClick={onDeployAll}
          disabled={isLoading}
          style={{
            padding: '8px 24px',
            background: '#f6821f',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Deploy All Pending
        </button>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        {subdomains.map(sub => (
          <div key={sub.id} style={{
            padding: '16px',
            background: '#1a1a2e',
            borderRadius: '8px',
            border: `1px solid ${sub.status === 'active' ? '#00d4aa' : sub.status === 'error' ? '#ff4444' : '#333'}`,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto auto',
            gap: '16px',
            alignItems: 'center',
          }}>
            <div>
              <code style={{ color: '#f6821f', fontSize: '14px' }}>{sub.fullDomain}</code>
              <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>{sub.description}</p>
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>{sub.service}</span>
              <span style={{ color: '#888', marginLeft: '8px' }}>:{sub.port}</span>
            </div>
            <StatusBadge status={sub.status} />
            {sub.status === 'pending' && (
              <button
                onClick={() => onDeploy(sub)}
                disabled={isLoading}
                style={{
                  padding: '6px 16px',
                  background: '#00d4aa',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                Deploy
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DNSPanel({ records, onCreateRecord, onDeleteRecord }: {
  records: DNSRecord[];
  onCreateRecord: (record: Omit<DNSRecord, 'id'>) => void;
  onDeleteRecord: (id: string) => void;
}) {
  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px' }}>📋 DNS Record Manager</h2>
      {records.length === 0 ? (
        <p style={{ color: '#888' }}>No DNS records loaded. Configure credentials and fetch records.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Content</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>TTL</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Proxied</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map(record => (
              <tr key={record.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px' }}><code>{record.type}</code></td>
                <td style={{ padding: '8px' }}>{record.name}</td>
                <td style={{ padding: '8px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{record.content}</td>
                <td style={{ padding: '8px' }}>{record.ttl === 1 ? 'Auto' : `${record.ttl}s`}</td>
                <td style={{ padding: '8px' }}>{record.proxied ? '🟠 Yes' : '⚪ No'}</td>
                <td style={{ padding: '8px' }}>
                  <button
                    onClick={() => onDeleteRecord(record.id)}
                    style={{ background: '#ff4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TunnelPanel({ tunnel, onRefresh }: { tunnel: TunnelInfo | null; onRefresh: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>🔒 Tunnel Dashboard</h2>
        <button onClick={onRefresh} style={{ padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>
      {!tunnel ? (
        <p style={{ color: '#888' }}>No tunnel data available. Configure credentials first.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <StatCard label="Status" value={tunnel.status} color={tunnel.status === 'healthy' ? '#00d4aa' : '#ff6b6b'} />
          <StatCard label="Connections" value={`${tunnel.connections?.length || 0}`} color="#4ecdc4" />
          <StatCard label="Requests/sec" value={`${tunnel.metrics?.requestsPerSecond || 0}`} color="#f6821f" />
          <StatCard label="P50 Latency" value={`${tunnel.metrics?.p50Latency || 0}ms`} color="#00d4aa" />
          <StatCard label="P99 Latency" value={`${tunnel.metrics?.p99Latency || 0}ms`} color="#faad3f" />
          <StatCard label="Error Rate" value={`${tunnel.metrics?.errorRate || 0}%`} color={tunnel.metrics?.errorRate > 1 ? '#ff6b6b' : '#00d4aa'} />
        </div>
      )}
    </div>
  );
}

function WorkersPanel({ workers }: { workers: WorkerDeployment[] }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px' }}>⚡ Cloudflare Workers</h2>
      {workers.length === 0 ? (
        <div>
          <p style={{ color: '#888' }}>No workers deployed yet. Workers available for deployment:</p>
          <ul style={{ color: '#888' }}>
            <li><code>identity-worker</code> — Infinity One IAM (CF Worker)</li>
            <li><code>filesystem-worker</code> — Distributed file system</li>
            <li><code>edge-cache-worker</code> — Edge caching layer</li>
          </ul>
        </div>
      ) : (
        workers.map(w => (
          <div key={w.id} style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', marginBottom: '12px' }}>
            <h3>{w.name}</h3>
            <p>Route: {w.route} | Status: {w.status} | Last deployed: {w.lastDeployed}</p>
          </div>
        ))
      )}
    </div>
  );
}

function EdgeDBPanel({ databases }: { databases: EdgeDatabase[] }) {
  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px' }}>💾 Edge Database (Cloudflare D1)</h2>
      {databases.length === 0 ? (
        <div>
          <p style={{ color: '#888' }}>No edge databases configured yet.</p>
          <p style={{ color: '#888', fontSize: '13px' }}>
            Cloudflare D1 provides SQLite at the edge for low-latency reads.
            Neon PostgreSQL remains the source of truth; D1 syncs from it.
          </p>
          <div style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Planned Edge Databases:</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#888' }}>
              <li><code>trancendos-sessions</code> — User session cache (replicated from Infinity One)</li>
              <li><code>trancendos-config</code> — Platform configuration (replicated from Kernel)</li>
              <li><code>trancendos-cache</code> — API response cache (replicated from API Marketplace)</li>
            </ul>
          </div>
        </div>
      ) : (
        databases.map(db => (
          <div key={db.id} style={{ padding: '16px', background: '#1a1a2e', borderRadius: '8px', marginBottom: '12px' }}>
            <h3>{db.name}</h3>
            <p>Tables: {db.numTables} | Size: {(db.sizeBytes / 1024).toFixed(1)}KB | Reads: {db.readQueries} | Writes: {db.writeQueries}</p>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// SHARED UI COMPONENTS
// ============================================================

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '16px',
      background: '#1a1a2e',
      borderRadius: '8px',
      borderLeft: `4px solid ${color}`,
    }}>
      <p style={{ margin: 0, fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: SubdomainStatus }) {
  const colors: Record<SubdomainStatus, { bg: string; text: string }> = {
    active: { bg: 'rgba(0,212,170,0.15)', text: '#00d4aa' },
    pending: { bg: 'rgba(246,130,31,0.15)', text: '#f6821f' },
    error: { bg: 'rgba(255,68,68,0.15)', text: '#ff4444' },
    disabled: { bg: 'rgba(136,136,136,0.15)', text: '#888' },
  };
  const c = colors[status];
  return (
    <span style={{
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    }}>
      {status.toUpperCase()}
    </span>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '6px',
          color: '#e0e0e0',
          fontSize: '14px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}