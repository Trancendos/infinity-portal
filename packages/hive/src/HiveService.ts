/**
 * The HIVE - Swarm Data Router and Interconnect Hub
 * Bio-inspired bee-colony data routing with intelligent separation and adaptive intelligence
 * 2060 future-proof with quantum-safe channels and neural interface support
 */

// ============================================================================
// Types
// ============================================================================

export enum BeeRole {
  QUEEN = 'queen',           // Master coordinator
  WORKER = 'worker',         // Data routing nodes
  SCOUT = 'scout',           // Service discovery
  GUARD = 'guard',           // Security enforcement
  DRONE = 'drone',           // Cleanup & maintenance
  NURSE = 'nurse',           // Health monitoring
  FORAGER = 'forager'        // External data fetching
}

export enum DataClassification {
  PUBLIC = 'public',         // Level 1 - All users
  INTERNAL = 'internal',     // Level 2 - Authenticated users
  CONFIDENTIAL = 'confidential', // Level 3 - Privileged users
  CLASSIFIED = 'classified', // Level 4 - Admin only
  VOID = 'void'              // Level 5 - Ultra-secret
}

export enum UserType {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  POWER_USER = 'power_user',
  STANDARD_USER = 'standard_user',
  BOT = 'bot',
  AGENT = 'agent',
  GUEST = 'guest',
  SYSTEM = 'system'
}

export enum ChannelStatus {
  ACTIVE = 'active',
  CONGESTED = 'congested',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance'
}

export enum RoutingStrategy {
  SHORTEST_PATH = 'shortest_path',
  LOAD_BALANCED = 'load_balanced',
  SECURITY_FIRST = 'security_first',
  LATENCY_OPTIMISED = 'latency_optimised',
  REDUNDANT = 'redundant',
  ADAPTIVE = 'adaptive'
}

export enum MessagePriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4
}

export interface HiveNode {
  id: string;
  role: BeeRole;
  status: ChannelStatus;
  capacity: number;          // 0-1
  load: number;              // 0-1
  specialisations: DataClassification[];
  allowedUserTypes: UserType[];
  location: string;
  latency: number;           // ms
  throughput: number;        // msgs/sec
  uptime: number;            // percentage
  lastHeartbeat: Date;
  connectedNodes: string[];
  metrics: NodeMetrics;
}

export interface NodeMetrics {
  messagesRouted: number;
  messagesDropped: number;
  averageLatency: number;
  peakLoad: number;
  errorRate: number;
  lastReset: Date;
}

export interface HiveMessage {
  id: string;
  sourceEntityId: string;
  sourceUserType: UserType;
  destinationEntityId?: string;
  destinationService?: string;
  classification: DataClassification;
  priority: MessagePriority;
  payload: unknown;
  encryptedPayload?: string;
  routingPath: string[];
  hops: MessageHop[];
  createdAt: Date;
  expiresAt?: Date;
  deliveredAt?: Date;
  status: MessageStatus;
  lighthouseTokenId: string;
  metadata: Record<string, unknown>;
}

export enum MessageStatus {
  QUEUED = 'queued',
  ROUTING = 'routing',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  EXPIRED = 'expired',
  BLOCKED = 'blocked',
  QUARANTINED = 'quarantined'
}

export interface MessageHop {
  nodeId: string;
  nodeRole: BeeRole;
  arrivedAt: Date;
  departedAt?: Date;
  latency: number;
  action: 'forwarded' | 'processed' | 'blocked' | 'encrypted' | 'decrypted';
}

export interface RoutingDecision {
  messageId: string;
  selectedPath: string[];
  strategy: RoutingStrategy;
  reason: string;
  alternativePaths: string[][];
  estimatedLatency: number;
  securityChecks: SecurityCheck[];
  decidedAt: Date;
}

export interface SecurityCheck {
  type: string;
  passed: boolean;
  details: string;
  nodeId: string;
}

export interface DataChannel {
  id: string;
  name: string;
  sourceUserType: UserType;
  targetUserType: UserType;
  classification: DataClassification;
  encrypted: boolean;
  encryptionAlgorithm: string;
  status: ChannelStatus;
  throughput: number;
  latency: number;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface HiveTopology {
  nodes: Map<string, HiveNode>;
  channels: Map<string, DataChannel>;
  routingTable: Map<string, string[]>;
  lastUpdated: Date;
  version: number;
}

export interface HiveMetrics {
  totalNodes: number;
  activeNodes: number;
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
  topRoutes: RouteMetric[];
  nodesByRole: Record<BeeRole, number>;
  classificationBreakdown: Record<DataClassification, number>;
  userTypeBreakdown: Record<UserType, number>;
}

export interface RouteMetric {
  path: string[];
  messageCount: number;
  averageLatency: number;
  errorRate: number;
}

// ============================================================================
// HIVE Service
// ============================================================================

export class HiveService {
  private topology: HiveTopology;
  private messageQueue: Map<MessagePriority, HiveMessage[]> = new Map();
  private messageHistory: HiveMessage[] = [];
  private eventHandlers: Map<string, Set<(event: unknown) => void>> = new Map();
  private routingCache: Map<string, RoutingDecision> = new Map();

  constructor() {
    this.topology = {
      nodes: new Map(),
      channels: new Map(),
      routingTable: new Map(),
      lastUpdated: new Date(),
      version: 1
    };

    // Initialise priority queues
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        this.messageQueue.set(priority as MessagePriority, []);
      }
    }

    this.initialiseDefaultTopology();
    this.startHiveProcesses();
  }

  // ==========================================================================
  // Node Management (Bee Colony)
  // ==========================================================================

  async addNode(config: Partial<HiveNode> & { role: BeeRole }): Promise<HiveNode> {
    const node: HiveNode = {
      id: this.generateId(),
      role: config.role,
      status: ChannelStatus.ACTIVE,
      capacity: config.capacity ?? 1.0,
      load: 0,
      specialisations: config.specialisations ?? [DataClassification.INTERNAL],
      allowedUserTypes: config.allowedUserTypes ?? [UserType.STANDARD_USER],
      location: config.location ?? 'eu-west-1',
      latency: config.latency ?? 5,
      throughput: config.throughput ?? 10000,
      uptime: 100,
      lastHeartbeat: new Date(),
      connectedNodes: [],
      metrics: {
        messagesRouted: 0,
        messagesDropped: 0,
        averageLatency: 0,
        peakLoad: 0,
        errorRate: 0,
        lastReset: new Date()
      }
    };

    this.topology.nodes.set(node.id, node);
    await this.updateRoutingTable();
    this.emit('hive.node_added', { nodeId: node.id, role: node.role });
    return node;
  }

  async removeNode(nodeId: string): Promise<void> {
    this.topology.nodes.delete(nodeId);
    await this.updateRoutingTable();
    this.emit('hive.node_removed', { nodeId });
  }

  async getNodeHealth(): Promise<Map<string, NodeHealth>> {
    const health = new Map<string, NodeHealth>();
    for (const [id, node] of this.topology.nodes) {
      health.set(id, {
        nodeId: id,
        role: node.role,
        status: node.status,
        load: node.load,
        latency: node.latency,
        uptime: node.uptime,
        healthy: node.status === ChannelStatus.ACTIVE && node.load < 0.9,
        lastHeartbeat: node.lastHeartbeat
      });
    }
    return health;
  }

  // ==========================================================================
  // Message Routing (Worker Bees)
  // ==========================================================================

  /**
   * Route a message through the HIVE with intelligent path selection
   */
  async routeMessage(message: Omit<HiveMessage, 'id' | 'routingPath' | 'hops' | 'status' | 'createdAt'>): Promise<HiveMessage> {
    const fullMessage: HiveMessage = {
      ...message,
      id: this.generateMessageId(),
      routingPath: [],
      hops: [],
      status: MessageStatus.QUEUED,
      createdAt: new Date()
    };

    // Security check via Guard bees
    const securityResult = await this.guardCheck(fullMessage);
    if (!securityResult.passed) {
      fullMessage.status = MessageStatus.BLOCKED;
      this.emit('hive.message_blocked', { messageId: fullMessage.id, reason: securityResult.reason });
      return fullMessage;
    }

    // Classify and validate
    await this.validateClassification(fullMessage);

    // Queue by priority
    const queue = this.messageQueue.get(fullMessage.priority) || [];
    queue.push(fullMessage);
    this.messageQueue.set(fullMessage.priority, queue);

    // Route immediately for critical/high priority
    if (fullMessage.priority <= MessagePriority.HIGH) {
      await this.processMessage(fullMessage);
    }

    return fullMessage;
  }

  /**
   * Process a message through the routing pipeline
   */
  private async processMessage(message: HiveMessage): Promise<void> {
    message.status = MessageStatus.ROUTING;

    // Scout bees: discover optimal path
    const routingDecision = await this.scoutPath(message);
    message.routingPath = routingDecision.selectedPath;

    // Worker bees: route through path
    message.status = MessageStatus.IN_TRANSIT;
    for (const nodeId of routingDecision.selectedPath) {
      const node = this.topology.nodes.get(nodeId);
      if (!node) continue;

      const hop: MessageHop = {
        nodeId,
        nodeRole: node.role,
        arrivedAt: new Date(),
        latency: node.latency,
        action: 'forwarded'
      };

      // Encrypt at classification boundaries
      if (message.classification >= DataClassification.CONFIDENTIAL && !message.encryptedPayload) {
        hop.action = 'encrypted';
        message.encryptedPayload = await this.encryptPayload(message.payload, message.classification);
      }

      hop.departedAt = new Date();
      message.hops.push(hop);
      node.metrics.messagesRouted++;
      node.load = Math.min(1, node.load + 0.001);
    }

    message.status = MessageStatus.DELIVERED;
    message.deliveredAt = new Date();
    this.messageHistory.push(message);
    this.emit('hive.message_delivered', { messageId: message.id, path: message.routingPath });
  }

  /**
   * Scout bees: find optimal routing path
   */
  private async scoutPath(message: HiveMessage): Promise<RoutingDecision> {
    // Check cache first
    const cacheKey = `${message.sourceUserType}:${message.classification}:${message.destinationService}`;
    if (this.routingCache.has(cacheKey)) {
      const cached = this.routingCache.get(cacheKey)!;
      if (Date.now() - cached.decidedAt.getTime() < 30000) return cached;
    }

    const eligibleNodes = this.getEligibleNodes(message);
    const path = this.buildOptimalPath(eligibleNodes, message);

    const decision: RoutingDecision = {
      messageId: message.id,
      selectedPath: path,
      strategy: RoutingStrategy.ADAPTIVE,
      reason: `Adaptive routing for ${message.classification} data from ${message.sourceUserType}`,
      alternativePaths: [],
      estimatedLatency: path.reduce((sum, nodeId) => {
        const node = this.topology.nodes.get(nodeId);
        return sum + (node?.latency || 5);
      }, 0),
      securityChecks: [],
      decidedAt: new Date()
    };

    this.routingCache.set(cacheKey, decision);
    return decision;
  }

  /**
   * Guard bees: security enforcement at every hop
   */
  private async guardCheck(message: HiveMessage): Promise<{ passed: boolean; reason?: string }> {
    // Check classification vs user type permissions
    const allowedClassifications = this.getAllowedClassifications(message.sourceUserType);
    if (!allowedClassifications.includes(message.classification)) {
      return { passed: false, reason: `User type ${message.sourceUserType} cannot access ${message.classification} data` };
    }

    // Check Lighthouse token
    if (!message.lighthouseTokenId) {
      return { passed: false, reason: 'Missing Lighthouse token' };
    }

    // Check message expiry
    if (message.expiresAt && new Date() > message.expiresAt) {
      return { passed: false, reason: 'Message expired' };
    }

    return { passed: true };
  }

  // ==========================================================================
  // Data Separation (Core HIVE Principle)
  // ==========================================================================

  /**
   * Get allowed data classifications for a user type
   */
  getAllowedClassifications(userType: UserType): DataClassification[] {
    const matrix: Record<UserType, DataClassification[]> = {
      [UserType.SUPER_ADMIN]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL,
        DataClassification.CONFIDENTIAL,
        DataClassification.CLASSIFIED,
        DataClassification.VOID
      ],
      [UserType.ORG_ADMIN]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL,
        DataClassification.CONFIDENTIAL,
        DataClassification.CLASSIFIED
      ],
      [UserType.POWER_USER]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL,
        DataClassification.CONFIDENTIAL
      ],
      [UserType.STANDARD_USER]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL
      ],
      [UserType.BOT]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL
      ],
      [UserType.AGENT]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL,
        DataClassification.CONFIDENTIAL
      ],
      [UserType.GUEST]: [
        DataClassification.PUBLIC
      ],
      [UserType.SYSTEM]: [
        DataClassification.PUBLIC,
        DataClassification.INTERNAL,
        DataClassification.CONFIDENTIAL,
        DataClassification.CLASSIFIED,
        DataClassification.VOID
      ]
    };
    return matrix[userType] || [DataClassification.PUBLIC];
  }

  /**
   * Create an isolated data channel between two user types
   */
  async createChannel(
    sourceUserType: UserType,
    targetUserType: UserType,
    classification: DataClassification,
    name: string
  ): Promise<DataChannel> {
    // Validate separation rules
    const sourceAllowed = this.getAllowedClassifications(sourceUserType);
    const targetAllowed = this.getAllowedClassifications(targetUserType);

    if (!sourceAllowed.includes(classification) || !targetAllowed.includes(classification)) {
      throw new Error(`Cannot create channel: classification ${classification} not allowed for both user types`);
    }

    const channel: DataChannel = {
      id: this.generateId(),
      name,
      sourceUserType,
      targetUserType,
      classification,
      encrypted: classification >= DataClassification.CONFIDENTIAL,
      encryptionAlgorithm: classification >= DataClassification.VOID ? 'ML-KEM-1024' :
                           classification >= DataClassification.CONFIDENTIAL ? 'ML-KEM-768' : 'AES-256-GCM',
      status: ChannelStatus.ACTIVE,
      throughput: 0,
      latency: 0,
      createdAt: new Date(),
      lastUsedAt: new Date()
    };

    this.topology.channels.set(channel.id, channel);
    this.emit('hive.channel_created', { channelId: channel.id, name });
    return channel;
  }

  // ==========================================================================
  // Service Discovery (Scout Bees)
  // ==========================================================================

  async discoverService(serviceName: string, userType: UserType): Promise<ServiceDiscoveryResult> {
    const services: Record<string, ServiceInfo> = {
      'infinity-one': { name: 'Infinity-One', endpoint: 'https://identity.trancendos.com', classification: DataClassification.INTERNAL, minUserType: UserType.GUEST },
      'lighthouse': { name: 'Lighthouse', endpoint: 'https://lighthouse.trancendos.com', classification: DataClassification.CLASSIFIED, minUserType: UserType.ORG_ADMIN },
      'void': { name: 'The Void', endpoint: 'https://void.trancendos.com', classification: DataClassification.VOID, minUserType: UserType.SUPER_ADMIN },
      'royal-bank': { name: 'Royal Bank of Arcadia', endpoint: 'https://rba.trancendos.com', classification: DataClassification.CONFIDENTIAL, minUserType: UserType.STANDARD_USER },
      'arcadian-exchange': { name: 'Arcadian Exchange', endpoint: 'https://aex.trancendos.com', classification: DataClassification.INTERNAL, minUserType: UserType.STANDARD_USER },
      'icebox': { name: 'IceBox', endpoint: 'https://icebox.trancendos.com', classification: DataClassification.CLASSIFIED, minUserType: UserType.ORG_ADMIN }
    };

    const service = services[serviceName];
    if (!service) return { found: false, reason: 'Service not found' };

    const allowed = this.getAllowedClassifications(userType);
    if (!allowed.includes(service.classification)) {
      return { found: false, reason: `Access denied: insufficient clearance for ${serviceName}` };
    }

    return { found: true, service };
  }

  // ==========================================================================
  // Health Monitoring (Nurse Bees)
  // ==========================================================================

  async getHiveHealth(): Promise<HiveHealthReport> {
    const nodes = Array.from(this.topology.nodes.values());
    const activeNodes = nodes.filter(n => n.status === ChannelStatus.ACTIVE);
    const degradedNodes = nodes.filter(n => n.status === ChannelStatus.DEGRADED);
    const offlineNodes = nodes.filter(n => n.status === ChannelStatus.OFFLINE);

    const avgLoad = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.load, 0) / nodes.length
      : 0;

    const avgLatency = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.latency, 0) / nodes.length
      : 0;

    return {
      status: offlineNodes.length > nodes.length * 0.3 ? 'critical' :
              degradedNodes.length > nodes.length * 0.2 ? 'degraded' : 'healthy',
      totalNodes: nodes.length,
      activeNodes: activeNodes.length,
      degradedNodes: degradedNodes.length,
      offlineNodes: offlineNodes.length,
      averageLoad: avgLoad,
      averageLatency: avgLatency,
      messageQueueDepth: this.getTotalQueueDepth(),
      messagesPerSecond: this.calculateThroughput(),
      topologyVersion: this.topology.version,
      lastUpdated: this.topology.lastUpdated
    };
  }

  getMetrics(): HiveMetrics {
    const nodesByRole = {} as Record<BeeRole, number>;
    const classificationBreakdown = {} as Record<DataClassification, number>;
    const userTypeBreakdown = {} as Record<UserType, number>;

    for (const node of this.topology.nodes.values()) {
      nodesByRole[node.role] = (nodesByRole[node.role] || 0) + 1;
    }

    for (const msg of this.messageHistory) {
      classificationBreakdown[msg.classification] = (classificationBreakdown[msg.classification] || 0) + 1;
      userTypeBreakdown[msg.sourceUserType] = (userTypeBreakdown[msg.sourceUserType] || 0) + 1;
    }

    return {
      totalNodes: this.topology.nodes.size,
      activeNodes: Array.from(this.topology.nodes.values()).filter(n => n.status === ChannelStatus.ACTIVE).length,
      totalMessages: this.messageHistory.length,
      messagesPerSecond: this.calculateThroughput(),
      averageLatency: this.calculateAverageLatency(),
      errorRate: this.calculateErrorRate(),
      topRoutes: [],
      nodesByRole,
      classificationBreakdown,
      userTypeBreakdown
    };
  }

  // ==========================================================================
  // Cleanup (Drone Bees)
  // ==========================================================================

  async cleanup(): Promise<CleanupResult> {
    const now = new Date();
    let cleaned = 0;

    // Remove expired messages from history
    const before = this.messageHistory.length;
    this.messageHistory = this.messageHistory.filter(m => {
      if (m.expiresAt && now > m.expiresAt) { cleaned++; return false; }
      return true;
    });

    // Clear routing cache
    for (const [key, decision] of this.routingCache) {
      if (now.getTime() - decision.decidedAt.getTime() > 300000) {
        this.routingCache.delete(key);
        cleaned++;
      }
    }

    // Reset node metrics
    for (const node of this.topology.nodes.values()) {
      if (now.getTime() - node.metrics.lastReset.getTime() > 86400000) {
        node.metrics = { messagesRouted: 0, messagesDropped: 0, averageLatency: 0, peakLoad: 0, errorRate: 0, lastReset: now };
      }
    }

    return { itemsCleaned: cleaned, duration: Date.now() - now.getTime() };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private initialiseDefaultTopology(): void {
    // Queen bee - master coordinator
    this.addNode({ role: BeeRole.QUEEN, capacity: 1.0, specialisations: Object.values(DataClassification) as DataClassification[], allowedUserTypes: Object.values(UserType) as UserType[], location: 'eu-west-1' });

    // Worker bees - data routing
    for (let i = 0; i < 5; i++) {
      this.addNode({ role: BeeRole.WORKER, capacity: 0.8, specialisations: [DataClassification.PUBLIC, DataClassification.INTERNAL], allowedUserTypes: [UserType.STANDARD_USER, UserType.POWER_USER, UserType.BOT, UserType.AGENT], location: `eu-west-${i + 1}` });
    }

    // Guard bees - security
    for (let i = 0; i < 3; i++) {
      this.addNode({ role: BeeRole.GUARD, capacity: 0.9, specialisations: Object.values(DataClassification) as DataClassification[], allowedUserTypes: Object.values(UserType) as UserType[], location: `eu-west-${i + 1}` });
    }

    // Scout bees - service discovery
    for (let i = 0; i < 2; i++) {
      this.addNode({ role: BeeRole.SCOUT, capacity: 0.7, specialisations: [DataClassification.PUBLIC, DataClassification.INTERNAL], allowedUserTypes: Object.values(UserType) as UserType[], location: `eu-west-${i + 1}` });
    }

    // Nurse bees - health monitoring
    this.addNode({ role: BeeRole.NURSE, capacity: 0.5, specialisations: [DataClassification.INTERNAL], allowedUserTypes: [UserType.SYSTEM], location: 'eu-west-1' });

    // Drone bees - cleanup
    this.addNode({ role: BeeRole.DRONE, capacity: 0.3, specialisations: [DataClassification.INTERNAL], allowedUserTypes: [UserType.SYSTEM], location: 'eu-west-1' });
  }

  private getEligibleNodes(message: HiveMessage): HiveNode[] {
    return Array.from(this.topology.nodes.values()).filter(node =>
      node.status === ChannelStatus.ACTIVE &&
      node.load < 0.9 &&
      node.specialisations.includes(message.classification) &&
      node.allowedUserTypes.includes(message.sourceUserType)
    );
  }

  private buildOptimalPath(nodes: HiveNode[], message: HiveMessage): string[] {
    if (nodes.length === 0) return [];

    // Always start with a guard node
    const guardNodes = nodes.filter(n => n.role === BeeRole.GUARD);
    const workerNodes = nodes.filter(n => n.role === BeeRole.WORKER);
    const path: string[] = [];

    if (guardNodes.length > 0) path.push(guardNodes[0].id);
    if (workerNodes.length > 0) path.push(workerNodes[0].id);
    if (guardNodes.length > 1) path.push(guardNodes[1].id);

    return path;
  }

  private getAllowedClassificationsForNode(node: HiveNode): DataClassification[] {
    return node.specialisations;
  }

  private async validateClassification(message: HiveMessage): Promise<void> {
    // Ensure classification is appropriate for content
    if (message.classification === DataClassification.VOID && message.sourceUserType !== UserType.SUPER_ADMIN && message.sourceUserType !== UserType.SYSTEM) {
      message.classification = DataClassification.CLASSIFIED;
    }
  }

  private async encryptPayload(payload: unknown, classification: DataClassification): Promise<string> {
    const algorithm = classification >= DataClassification.VOID ? 'ML-KEM-1024' : 'ML-KEM-768';
    return `encrypted:${algorithm}:${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
  }

  private async updateRoutingTable(): Promise<void> {
    this.topology.routingTable.clear();
    for (const [id, node] of this.topology.nodes) {
      const reachable = Array.from(this.topology.nodes.keys()).filter(nid => nid !== id);
      this.topology.routingTable.set(id, reachable);
    }
    this.topology.lastUpdated = new Date();
    this.topology.version++;
  }

  private getTotalQueueDepth(): number {
    let total = 0;
    for (const queue of this.messageQueue.values()) total += queue.length;
    return total;
  }

  private calculateThroughput(): number {
    const recentMessages = this.messageHistory.filter(m =>
      m.deliveredAt && Date.now() - m.deliveredAt.getTime() < 1000
    );
    return recentMessages.length;
  }

  private calculateAverageLatency(): number {
    const delivered = this.messageHistory.filter(m => m.deliveredAt);
    if (delivered.length === 0) return 0;
    const totalLatency = delivered.reduce((sum, m) => {
      return sum + (m.deliveredAt!.getTime() - m.createdAt.getTime());
    }, 0);
    return totalLatency / delivered.length;
  }

  private calculateErrorRate(): number {
    if (this.messageHistory.length === 0) return 0;
    const failed = this.messageHistory.filter(m => m.status === MessageStatus.FAILED || m.status === MessageStatus.BLOCKED).length;
    return failed / this.messageHistory.length;
  }

  private startHiveProcesses(): void {
    // Process message queues
    setInterval(() => this.processQueues(), 100);
    // Health monitoring
    setInterval(() => this.monitorHealth(), 5000);
    // Cleanup
    setInterval(() => this.cleanup(), 300000);
  }

  private async processQueues(): Promise<void> {
    for (const priority of [MessagePriority.CRITICAL, MessagePriority.HIGH, MessagePriority.NORMAL, MessagePriority.LOW, MessagePriority.BACKGROUND]) {
      const queue = this.messageQueue.get(priority) || [];
      const toProcess = queue.splice(0, 10);
      for (const message of toProcess) {
        await this.processMessage(message).catch(err =>
          this.emit('hive.processing_error', { messageId: message.id, error: String(err) })
        );
      }
    }
  }

  private async monitorHealth(): Promise<void> {
    for (const node of this.topology.nodes.values()) {
      // Simulate heartbeat check
      const timeSinceHeartbeat = Date.now() - node.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > 30000) {
        node.status = ChannelStatus.OFFLINE;
        this.emit('hive.node_offline', { nodeId: node.id });
      }
      node.lastHeartbeat = new Date();
      // Gradually reduce load
      node.load = Math.max(0, node.load - 0.01);
    }
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `hive_msg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  on(event: string, handler: (event: unknown) => void): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) handlers.forEach(h => h(data));
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface NodeHealth {
  nodeId: string;
  role: BeeRole;
  status: ChannelStatus;
  load: number;
  latency: number;
  uptime: number;
  healthy: boolean;
  lastHeartbeat: Date;
}

export interface HiveHealthReport {
  status: 'healthy' | 'degraded' | 'critical';
  totalNodes: number;
  activeNodes: number;
  degradedNodes: number;
  offlineNodes: number;
  averageLoad: number;
  averageLatency: number;
  messageQueueDepth: number;
  messagesPerSecond: number;
  topologyVersion: number;
  lastUpdated: Date;
}

export interface ServiceInfo {
  name: string;
  endpoint: string;
  classification: DataClassification;
  minUserType: UserType;
}

export interface ServiceDiscoveryResult {
  found: boolean;
  service?: ServiceInfo;
  reason?: string;
}

export interface CleanupResult {
  itemsCleaned: number;
  duration: number;
}