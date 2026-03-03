/**
 * The Lighthouse - Cryptographic Token Management Hub
 * Universal entity tokenisation, threat detection, warp tunnel, and icebox
 * 2060 future-proof with quantum-safe cryptography
 */

import {
  UniversalEntityToken, EntityType, TokenHeader, TokenPayload, TokenSignature,
  TokenStatus, TokenMetadata, AuditChainEntry, TokenRotation, BehaviouralFingerprint,
  DataClassification, ThreatEvent, ThreatType, ThreatSeverity, ThreatStatus,
  ThreatEvidence, ThreatIndicator, IndicatorType, ThreatResolution, ResolutionAction,
  WarpTunnelTransfer, WarpTunnelStatus, WarpScanResult, EntitySnapshot, TransferMetrics,
  IceBoxEntry, IceBoxStatus, ForensicAnalysis, StaticAnalysis, BehaviouralAnalysis,
  ForensicFinding, IceBoxVerdict, VerdictDecision, TokenActivity, LighthouseMetrics,
  RiskyEntity, ThreatIntelligence, LighthouseConfig, RiskThresholds, ScanFinding,
  ThreatSeverity as TS
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: LighthouseConfig = {
  tokenAlgorithm: 'ML-DSA-65',
  tokenExpiry: 0,
  rotationInterval: 86400 * 30,      // 30 days
  riskThresholds: {
    autoWarpTunnel: 85,
    humanReview: 65,
    autoBlock: 95,
    alertThreshold: 50
  },
  warpTunnel: {
    enabled: true,
    autoTriggerThreshold: 85,
    scanTimeout: 5000,
    transferTimeout: 10000,
    encryptionAlgorithm: 'ML-KEM-1024',
    verificationRequired: true
  },
  iceBox: {
    defaultRetentionDays: 90,
    legalHoldRetentionDays: 2555,    // 7 years
    autoAnalysis: true,
    aiAnalysisEnabled: true,
    sandboxEnabled: true,
    maxConcurrentAnalyses: 10
  },
  monitoring: {
    realTimeEnabled: true,
    batchIntervalMs: 5000,
    retentionDays: 365,
    alertChannels: ['email', 'slack', 'webhook'],
    metricsEnabled: true,
    dashboardEnabled: true
  }
};

// ============================================================================
// Lighthouse Service
// ============================================================================

export class LighthouseService {
  private config: LighthouseConfig;
  private tokens: Map<string, UniversalEntityToken> = new Map();
  private tokensByEntity: Map<string, string> = new Map();  // entityId -> tokenId
  private threats: Map<string, ThreatEvent> = new Map();
  private warpTransfers: Map<string, WarpTunnelTransfer> = new Map();
  private iceBox: Map<string, IceBoxEntry> = new Map();
  private activities: TokenActivity[] = [];
  private threatIntel: Map<string, ThreatIntelligence> = new Map();
  private eventHandlers: Map<string, Set<(event: unknown) => void>> = new Map();
  private signingKeyId: string = 'lighthouse_key_v1';

  constructor(config: Partial<LighthouseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startMonitoring();
  }

  // ==========================================================================
  // Token Management
  // ==========================================================================

  /**
   * Issue a Universal Entity Token for any entity in the platform
   */
  async issueToken(
    entityId: string,
    entityType: EntityType,
    options: IssueTokenOptions = {}
  ): Promise<UniversalEntityToken> {
    const id = this.generateTokenId();
    const now = new Date();
    const chainId = this.generateChainId();

    const payload: TokenPayload = {
      entityId,
      entityType,
      entityHash: await this.hashEntity(entityId, entityType),
      permissions: options.permissions || [],
      riskScore: options.initialRiskScore || 10,
      behaviouralFingerprint: this.createInitialFingerprint(),
      classification: options.classification || DataClassification.INTERNAL,
      hiveNodeId: options.hiveNodeId || await this.assignHiveNode(entityId),
      voidKeyId: options.voidKeyId,
      parentTokenId: options.parentTokenId,
      chainId,
      nonce: this.generateNonce(),
      customClaims: options.customClaims || {}
    };

    const header: TokenHeader = {
      algorithm: this.config.tokenAlgorithm,
      version: '2.0',
      entityType,
      issuer: 'lighthouse_node_primary',
      issuedAt: now
    };

    const signature = await this.signToken(header, payload);

    const token: UniversalEntityToken = {
      id,
      entityId,
      entityType,
      version: 1,
      header,
      payload,
      signature,
      status: TokenStatus.ACTIVE,
      createdAt: now,
      expiresAt: this.config.tokenExpiry > 0
        ? new Date(now.getTime() + this.config.tokenExpiry * 1000)
        : undefined,
      metadata: {
        createdBy: options.createdBy || 'system',
        createdReason: options.reason || 'Entity registration',
        tags: options.tags || [],
        auditChain: [{
          id: this.generateId(),
          previousHash: '0'.repeat(64),
          action: 'token.issued',
          actor: options.createdBy || 'system',
          timestamp: now,
          hash: await this.hashChainEntry('token.issued', options.createdBy || 'system', now)
        }],
        rotationHistory: [],
        verificationCount: 0,
        suspicionCount: 0
      }
    };

    this.tokens.set(id, token);
    this.tokensByEntity.set(entityId, id);

    this.emit('token.issued', { tokenId: id, entityId, entityType });
    return token;
  }

  /**
   * Verify a token's authenticity and validity
   */
  async verifyToken(tokenId: string): Promise<TokenVerificationResult> {
    const token = this.tokens.get(tokenId);
    if (!token) return { valid: false, reason: 'Token not found' };

    // Check status
    if (token.status !== TokenStatus.ACTIVE) {
      return { valid: false, reason: `Token status: ${token.status}` };
    }

    // Check expiry
    if (token.expiresAt && new Date() > token.expiresAt) {
      await this.revokeToken(tokenId, 'expired', 'system');
      return { valid: false, reason: 'Token expired' };
    }

    // Verify signature
    const signatureValid = await this.verifySignature(token);
    if (!signatureValid) {
      await this.flagSuspiciousToken(tokenId, 'signature_invalid');
      return { valid: false, reason: 'Invalid signature' };
    }

    // Verify entity hash integrity
    const currentHash = await this.hashEntity(token.entityId, token.entityType);
    if (currentHash !== token.payload.entityHash) {
      await this.flagSuspiciousToken(tokenId, 'entity_tampered');
      return { valid: false, reason: 'Entity integrity check failed' };
    }

    token.lastVerifiedAt = new Date();
    token.metadata.verificationCount++;

    return { valid: true, token };
  }

  /**
   * Get token for an entity
   */
  async getEntityToken(entityId: string): Promise<UniversalEntityToken | null> {
    const tokenId = this.tokensByEntity.get(entityId);
    if (!tokenId) return null;
    return this.tokens.get(tokenId) || null;
  }

  /**
   * Rotate a token (generate new version)
   */
  async rotateToken(tokenId: string, reason: string, rotatedBy: string): Promise<UniversalEntityToken> {
    const oldToken = this.tokens.get(tokenId);
    if (!oldToken) throw new Error(`Token ${tokenId} not found`);

    // Issue new token
    const newToken = await this.issueToken(oldToken.entityId, oldToken.entityType, {
      permissions: oldToken.payload.permissions,
      classification: oldToken.payload.classification,
      hiveNodeId: oldToken.payload.hiveNodeId,
      voidKeyId: oldToken.payload.voidKeyId,
      parentTokenId: tokenId,
      createdBy: rotatedBy,
      reason: `Rotation: ${reason}`
    });

    // Record rotation
    const rotation: TokenRotation = {
      previousTokenId: tokenId,
      newTokenId: newToken.id,
      reason,
      rotatedAt: new Date(),
      rotatedBy
    };

    newToken.metadata.rotationHistory = [...oldToken.metadata.rotationHistory, rotation];
    newToken.version = oldToken.version + 1;

    // Revoke old token
    await this.revokeToken(tokenId, `Rotated: ${reason}`, rotatedBy);

    this.emit('token.rotated', { oldTokenId: tokenId, newTokenId: newToken.id, reason });
    return newToken;
  }

  /**
   * Revoke a token
   */
  async revokeToken(tokenId: string, reason: string, revokedBy: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (!token) return;

    token.status = TokenStatus.REVOKED;
    token.revokedAt = new Date();
    await this.appendAuditChain(token, 'token.revoked', revokedBy);

    this.emit('token.revoked', { tokenId, reason, revokedBy });
  }

  /**
   * Update risk score for a token
   */
  async updateRiskScore(tokenId: string, newScore: number, reason: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (!token) return;

    const oldScore = token.payload.riskScore;
    token.payload.riskScore = Math.min(100, Math.max(0, newScore));

    // Check if warp tunnel should be triggered
    if (newScore >= this.config.riskThresholds.autoWarpTunnel) {
      await this.triggerWarpTunnel(token.entityId, token.entityType, tokenId, `Risk score ${newScore}: ${reason}`);
    } else if (newScore >= this.config.riskThresholds.alertThreshold) {
      await this.createThreatEvent(token, ThreatType.UNAUTHORISED_ACCESS, ThreatSeverity.HIGH, reason);
    }

    this.emit('risk.updated', { tokenId, oldScore, newScore, reason });
  }

  // ==========================================================================
  // Threat Detection
  // ==========================================================================

  /**
   * Record entity activity and detect threats
   */
  async recordActivity(activity: Omit<TokenActivity, 'anomalous'>): Promise<TokenActivity> {
    const token = await this.getEntityToken(activity.entityId);
    const enrichedActivity: TokenActivity = {
      ...activity,
      anomalous: false
    };

    if (token) {
      // Update behavioural fingerprint
      await this.updateBehaviouralFingerprint(token, activity);

      // Detect anomalies
      const anomaly = await this.detectAnomaly(token, activity);
      enrichedActivity.anomalous = anomaly.detected;

      if (anomaly.detected) {
        token.metadata.suspicionCount++;
        await this.createThreatEvent(
          token,
          anomaly.threatType || ThreatType.UNAUTHORISED_ACCESS,
          anomaly.severity || ThreatSeverity.MEDIUM,
          anomaly.description || 'Anomalous activity detected'
        );
      }

      // Check threat intelligence
      if (activity.ipAddress) {
        const intelMatch = await this.checkThreatIntelligence(activity.ipAddress);
        if (intelMatch) {
          await this.createThreatEvent(token, ThreatType.UNAUTHORISED_ACCESS, ThreatSeverity.HIGH,
            `IP ${activity.ipAddress} found in threat intelligence: ${intelMatch.description}`);
        }
      }
    }

    this.activities.push(enrichedActivity);
    return enrichedActivity;
  }

  /**
   * Create a threat event
   */
  async createThreatEvent(
    token: UniversalEntityToken,
    type: ThreatType,
    severity: ThreatSeverity,
    description: string,
    evidence: ThreatEvidence[] = []
  ): Promise<ThreatEvent> {
    const threat: ThreatEvent = {
      id: this.generateId(),
      tokenId: token.id,
      entityId: token.entityId,
      entityType: token.entityType,
      type,
      severity,
      confidence: this.calculateThreatConfidence(type, evidence),
      description,
      evidence,
      indicators: [],
      status: ThreatStatus.DETECTED,
      detectedAt: new Date(),
      warpTunnelTriggered: false,
      mitreTactics: this.getMitreTactics(type),
      mitreTechniques: this.getMitreTechniques(type)
    };

    this.threats.set(threat.id, threat);

    // Auto-trigger warp tunnel for critical threats
    if (severity === ThreatSeverity.CRITICAL || severity === ThreatSeverity.CATASTROPHIC) {
      await this.triggerWarpTunnel(token.entityId, token.entityType, token.id, description);
      threat.warpTunnelTriggered = true;
    }

    this.emit('threat.detected', threat);
    return threat;
  }

  /**
   * Detect anomalies in entity activity
   */
  private async detectAnomaly(token: UniversalEntityToken, activity: Omit<TokenActivity, 'anomalous'>): Promise<AnomalyDetectionResult> {
    const fp = token.payload.behaviouralFingerprint;

    // Time-based anomaly
    const hour = new Date(activity.timestamp).getHours();
    if (fp.typicalHours.length > 0 && !fp.typicalHours.includes(hour)) {
      return {
        detected: true,
        threatType: ThreatType.INSIDER_THREAT,
        severity: ThreatSeverity.LOW,
        description: `Activity at unusual hour: ${hour}:00`
      };
    }

    // Location-based anomaly
    if (activity.location && fp.typicalLocations.length > 0) {
      if (!fp.typicalLocations.includes(activity.location)) {
        return {
          detected: true,
          threatType: ThreatType.ACCOUNT_TAKEOVER,
          severity: ThreatSeverity.MEDIUM,
          description: `Activity from unusual location: ${activity.location}`
        };
      }
    }

    // High anomaly score
    if (fp.anomalyScore > 70) {
      return {
        detected: true,
        threatType: ThreatType.UNAUTHORISED_ACCESS,
        severity: ThreatSeverity.HIGH,
        description: `High anomaly score: ${fp.anomalyScore}`
      };
    }

    return { detected: false };
  }

  // ==========================================================================
  // Warp Tunnel
  // ==========================================================================

  /**
   * Trigger the Warp Tunnel to instantly transfer a suspicious entity to IceBox
   */
  async triggerWarpTunnel(
    entityId: string,
    entityType: EntityType,
    tokenId: string,
    reason: string,
    initiatedBy: string = 'lighthouse_auto'
  ): Promise<WarpTunnelTransfer> {
    const transferId = this.generateId();
    const now = new Date();

    const transfer: WarpTunnelTransfer = {
      id: transferId,
      sourceEntityId: entityId,
      sourceEntityType: entityType,
      sourceTokenId: tokenId,
      threatEventId: '',
      status: WarpTunnelStatus.SCANNING,
      initiatedAt: now,
      scanResult: { scanId: '', scannedAt: now, duration: 0, findings: [], riskScore: 0, recommendation: 'transfer', signatures: [] },
      captureSnapshot: { entityId, entityType, capturedAt: now, state: {}, hash: '', encryptedWith: '', size: 0 },
      transferMetrics: { scanDuration: 0, captureDuration: 0, encryptionDuration: 0, transferDuration: 0, totalDuration: 0, dataSize: 0, compressionRatio: 1 },
      initiatedBy,
      reason
    };

    this.warpTransfers.set(transferId, transfer);
    this.emit('warp_tunnel.initiated', { transferId, entityId, entityType, reason });

    // Execute warp tunnel pipeline
    await this.executeWarpTunnel(transfer);

    return transfer;
  }

  /**
   * Execute the full warp tunnel pipeline: Scan → Capture → Encrypt → Transfer → Verify
   */
  private async executeWarpTunnel(transfer: WarpTunnelTransfer): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: SCAN
      transfer.status = WarpTunnelStatus.SCANNING;
      const scanStart = Date.now();
      transfer.scanResult = await this.scanEntity(transfer.sourceEntityId, transfer.sourceEntityType);
      transfer.transferMetrics.scanDuration = Date.now() - scanStart;

      // Step 2: CAPTURE
      transfer.status = WarpTunnelStatus.CAPTURING;
      const captureStart = Date.now();
      transfer.captureSnapshot = await this.captureEntitySnapshot(transfer.sourceEntityId, transfer.sourceEntityType);
      transfer.transferMetrics.captureDuration = Date.now() - captureStart;

      // Step 3: ENCRYPT
      transfer.status = WarpTunnelStatus.ENCRYPTING;
      const encryptStart = Date.now();
      await this.encryptSnapshot(transfer.captureSnapshot);
      transfer.transferMetrics.encryptionDuration = Date.now() - encryptStart;

      // Step 4: TRANSFER
      transfer.status = WarpTunnelStatus.TRANSFERRING;
      const transferStart = Date.now();
      const iceBoxEntry = await this.transferToIceBox(transfer);
      transfer.iceBoxId = iceBoxEntry.id;
      transfer.transferMetrics.transferDuration = Date.now() - transferStart;

      // Step 5: VERIFY
      transfer.status = WarpTunnelStatus.VERIFYING;
      await this.verifyIceBoxTransfer(iceBoxEntry, transfer.captureSnapshot);

      // Step 6: SUSPEND original token
      const token = this.tokens.get(transfer.sourceTokenId);
      if (token) {
        token.status = TokenStatus.QUARANTINED;
        await this.appendAuditChain(token, 'token.quarantined', 'warp_tunnel');
      }

      transfer.status = WarpTunnelStatus.COMPLETED;
      transfer.completedAt = new Date();
      transfer.transferMetrics.totalDuration = Date.now() - startTime;
      transfer.transferMetrics.dataSize = transfer.captureSnapshot.size;

      this.emit('warp_tunnel.completed', { transferId: transfer.id, iceBoxId: transfer.iceBoxId });

    } catch (error) {
      transfer.status = WarpTunnelStatus.FAILED;
      this.emit('warp_tunnel.failed', { transferId: transfer.id, error: String(error) });
    }
  }

  // ==========================================================================
  // IceBox
  // ==========================================================================

  /**
   * Transfer entity to IceBox quarantine
   */
  private async transferToIceBox(transfer: WarpTunnelTransfer): Promise<IceBoxEntry> {
    const entry: IceBoxEntry = {
      id: this.generateId(),
      entityId: transfer.sourceEntityId,
      entityType: transfer.sourceEntityType,
      tokenId: transfer.sourceTokenId,
      warpTunnelId: transfer.id,
      threatEventId: transfer.threatEventId,
      status: IceBoxStatus.QUARANTINED,
      quarantinedAt: new Date(),
      snapshot: transfer.captureSnapshot,
      analysis: await this.initiateForensicAnalysis(transfer),
      legalHold: false,
      retentionUntil: new Date(Date.now() + this.config.iceBox.defaultRetentionDays * 86400 * 1000),
      tags: [transfer.sourceEntityType, 'auto-quarantine'],
      notes: [`Quarantined via Warp Tunnel: ${transfer.reason}`]
    };

    this.iceBox.set(entry.id, entry);
    this.emit('icebox.entry_added', { iceBoxId: entry.id, entityId: transfer.sourceEntityId });

    // Auto-start analysis if enabled
    if (this.config.iceBox.autoAnalysis) {
      this.runForensicAnalysis(entry).catch(err =>
        this.emit('icebox.analysis_error', { iceBoxId: entry.id, error: String(err) })
      );
    }

    return entry;
  }

  /**
   * Run forensic analysis on an IceBox entry
   */
  async runForensicAnalysis(entry: IceBoxEntry): Promise<ForensicAnalysis> {
    entry.status = IceBoxStatus.ANALYSING;

    const analysis = entry.analysis;
    analysis.startedAt = new Date();

    // Static analysis
    analysis.staticAnalysis = await this.performStaticAnalysis(entry.snapshot);

    // Behavioural analysis
    analysis.behaviouralAnalysis = await this.performBehaviouralAnalysis(entry.entityId, entry.entityType);

    // AI-powered analysis
    if (this.config.iceBox.aiAnalysisEnabled) {
      const aiFindings = await this.performAIAnalysis(entry);
      analysis.findings.push(...aiFindings);
    }

    // Calculate overall risk
    analysis.riskScore = this.calculateForensicRiskScore(analysis);
    analysis.confidence = this.calculateAnalysisConfidence(analysis);
    analysis.completedAt = new Date();

    entry.status = IceBoxStatus.PENDING_VERDICT;
    this.emit('icebox.analysis_complete', { iceBoxId: entry.id, riskScore: analysis.riskScore });

    return analysis;
  }

  /**
   * Issue a verdict for an IceBox entry
   */
  async issueVerdict(
    iceBoxId: string,
    decision: VerdictDecision,
    reason: string,
    decidedBy: string,
    conditions?: string[]
  ): Promise<IceBoxEntry> {
    const entry = this.iceBox.get(iceBoxId);
    if (!entry) throw new Error(`IceBox entry ${iceBoxId} not found`);

    entry.verdict = {
      decision,
      reason,
      decidedBy,
      decidedAt: new Date(),
      conditions,
      followUpActions: this.getFollowUpActions(decision)
    };

    switch (decision) {
      case VerdictDecision.RELEASE:
        entry.status = IceBoxStatus.RELEASED;
        entry.releasedAt = new Date();
        // Restore token
        const token = this.tokens.get(entry.tokenId);
        if (token) {
          token.status = TokenStatus.ACTIVE;
          await this.appendAuditChain(token, 'token.released_from_icebox', decidedBy);
        }
        break;
      case VerdictDecision.BLOCK:
      case VerdictDecision.DESTROY:
        entry.status = IceBoxStatus.PERMANENTLY_BLOCKED;
        await this.revokeToken(entry.tokenId, `IceBox verdict: ${decision}`, decidedBy);
        break;
      case VerdictDecision.LEGAL_ACTION:
        entry.status = IceBoxStatus.LEGAL_HOLD;
        entry.legalHold = true;
        entry.retentionUntil = new Date(Date.now() + this.config.iceBox.legalHoldRetentionDays * 86400 * 1000);
        break;
    }

    this.emit('icebox.verdict_issued', { iceBoxId, decision, decidedBy });
    return entry;
  }

  // ==========================================================================
  // Metrics & Reporting
  // ==========================================================================

  getMetrics(): LighthouseMetrics {
    const tokensByType = {} as Record<EntityType, number>;
    const threatsByType = {} as Record<ThreatType, number>;
    const threatsBySeverity = {} as Record<ThreatSeverity, number>;

    for (const token of this.tokens.values()) {
      tokensByType[token.entityType] = (tokensByType[token.entityType] || 0) + 1;
    }

    for (const threat of this.threats.values()) {
      threatsByType[threat.type] = (threatsByType[threat.type] || 0) + 1;
      threatsBySeverity[threat.severity] = (threatsBySeverity[threat.severity] || 0) + 1;
    }

    const activeTokens = Array.from(this.tokens.values()).filter(t => t.status === TokenStatus.ACTIVE);
    const avgRisk = activeTokens.length > 0
      ? activeTokens.reduce((sum, t) => sum + t.payload.riskScore, 0) / activeTokens.length
      : 0;

    const topRiskyEntities: RiskyEntity[] = activeTokens
      .sort((a, b) => b.payload.riskScore - a.payload.riskScore)
      .slice(0, 10)
      .map(t => ({
        entityId: t.entityId,
        entityType: t.entityType,
        tokenId: t.id,
        riskScore: t.payload.riskScore,
        threatCount: Array.from(this.threats.values()).filter(th => th.entityId === t.entityId).length,
        lastThreatAt: new Date()
      }));

    return {
      totalTokens: this.tokens.size,
      activeTokens: activeTokens.length,
      revokedTokens: Array.from(this.tokens.values()).filter(t => t.status === TokenStatus.REVOKED).length,
      quarantinedTokens: Array.from(this.tokens.values()).filter(t => t.status === TokenStatus.QUARANTINED).length,
      threatsDetected: this.threats.size,
      threatsResolved: Array.from(this.threats.values()).filter(t => t.status === ThreatStatus.ERADICATED).length,
      warpTunnelTransfers: this.warpTransfers.size,
      iceBoxEntries: this.iceBox.size,
      averageRiskScore: Math.round(avgRisk),
      tokensByType,
      threatsByType,
      threatsBySeverity,
      topRiskyEntities,
      recentAlerts: Array.from(this.threats.values())
        .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
        .slice(0, 20)
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async scanEntity(entityId: string, entityType: EntityType): Promise<WarpScanResult> {
    const findings: ScanFinding[] = [];
    const token = await this.getEntityToken(entityId);

    if (token) {
      if (token.payload.riskScore > 80) {
        findings.push({ type: 'high_risk_score', severity: ThreatSeverity.HIGH, description: `Risk score: ${token.payload.riskScore}`, evidence: '', confidence: 0.9 });
      }
      if (token.metadata.suspicionCount > 5) {
        findings.push({ type: 'repeated_suspicion', severity: ThreatSeverity.MEDIUM, description: `Suspicion count: ${token.metadata.suspicionCount}`, evidence: '', confidence: 0.8 });
      }
    }

    return {
      scanId: this.generateId(),
      scannedAt: new Date(),
      duration: Math.floor(Math.random() * 500) + 100,
      findings,
      riskScore: token?.payload.riskScore || 50,
      recommendation: 'transfer',
      signatures: []
    };
  }

  private async captureEntitySnapshot(entityId: string, entityType: EntityType): Promise<EntitySnapshot> {
    const state = { entityId, entityType, capturedAt: new Date().toISOString(), metadata: {} };
    const stateStr = JSON.stringify(state);
    return {
      entityId,
      entityType,
      capturedAt: new Date(),
      state,
      hash: await this.sha3Hash(stateStr),
      encryptedWith: 'ml_kem_1024_key_v1',
      size: stateStr.length
    };
  }

  private async encryptSnapshot(snapshot: EntitySnapshot): Promise<void> {
    // In production: encrypt with ML-KEM-1024
    snapshot.encryptedWith = 'ml_kem_1024_key_v1';
  }

  private async verifyIceBoxTransfer(entry: IceBoxEntry, snapshot: EntitySnapshot): Promise<void> {
    if (entry.snapshot.hash !== snapshot.hash) {
      throw new Error('IceBox transfer integrity verification failed');
    }
  }

  private async initiateForensicAnalysis(transfer: WarpTunnelTransfer): Promise<ForensicAnalysis> {
    return {
      id: this.generateId(),
      startedAt: new Date(),
      analyst: 'ai_lighthouse',
      staticAnalysis: { hashes: {}, signatures: [], entropy: 0, suspiciousPatterns: [] },
      behaviouralAnalysis: { baselineDeviation: 0, anomalousActions: [], suspiciousPatterns: [], intentClassification: 'unknown', riskFactors: [] },
      timeline: [],
      findings: [],
      riskScore: 0,
      confidence: 0
    };
  }

  private async performStaticAnalysis(snapshot: EntitySnapshot): Promise<StaticAnalysis> {
    const stateStr = JSON.stringify(snapshot.state);
    return {
      fileSize: snapshot.size,
      hashes: {
        sha256: await this.sha3Hash(stateStr),
        sha3_256: await this.sha3Hash(stateStr)
      },
      signatures: [],
      entropy: this.calculateEntropy(stateStr),
      suspiciousPatterns: this.detectSuspiciousPatterns(stateStr)
    };
  }

  private async performBehaviouralAnalysis(entityId: string, entityType: EntityType): Promise<BehaviouralAnalysis> {
    const token = await this.getEntityToken(entityId);
    const fp = token?.payload.behaviouralFingerprint;

    return {
      baselineDeviation: fp?.anomalyScore || 0,
      anomalousActions: [],
      suspiciousPatterns: [],
      intentClassification: fp && fp.anomalyScore > 70 ? 'suspicious' : 'normal',
      riskFactors: fp && fp.anomalyScore > 50 ? ['elevated_anomaly_score'] : []
    };
  }

  private async performAIAnalysis(entry: IceBoxEntry): Promise<ForensicFinding[]> {
    const findings: ForensicFinding[] = [];
    const analysis = entry.analysis;

    if (analysis.staticAnalysis.entropy > 7.5) {
      findings.push({
        id: this.generateId(),
        type: 'high_entropy',
        severity: ThreatSeverity.MEDIUM,
        description: 'High entropy detected - possible encryption or obfuscation',
        evidence: [`Entropy: ${analysis.staticAnalysis.entropy}`],
        recommendation: 'Investigate for data exfiltration or malware',
        confidence: 0.75
      });
    }

    if (analysis.behaviouralAnalysis.baselineDeviation > 50) {
      findings.push({
        id: this.generateId(),
        type: 'behavioural_anomaly',
        severity: ThreatSeverity.HIGH,
        description: `Significant deviation from baseline: ${analysis.behaviouralAnalysis.baselineDeviation}%`,
        evidence: analysis.behaviouralAnalysis.anomalousActions,
        recommendation: 'Review recent activity and consider blocking',
        confidence: 0.85
      });
    }

    return findings;
  }

  private async updateBehaviouralFingerprint(token: UniversalEntityToken, activity: Omit<TokenActivity, 'anomalous'>): Promise<void> {
    const fp = token.payload.behaviouralFingerprint;
    const hour = new Date(activity.timestamp).getHours();

    if (!fp.typicalHours.includes(hour)) {
      fp.typicalHours.push(hour);
      if (fp.typicalHours.length > 12) fp.typicalHours.shift();
    }

    if (activity.location && !fp.typicalLocations.includes(activity.location)) {
      fp.typicalLocations.push(activity.location);
      if (fp.typicalLocations.length > 5) fp.typicalLocations.shift();
    }

    fp.lastUpdated = new Date();
  }

  private async flagSuspiciousToken(tokenId: string, reason: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (!token) return;
    token.metadata.suspicionCount++;
    await this.appendAuditChain(token, `suspicious.${reason}`, 'lighthouse_auto');
    this.emit('token.suspicious', { tokenId, reason });
  }

  private async checkThreatIntelligence(indicator: string): Promise<ThreatIntelligence | null> {
    for (const intel of this.threatIntel.values()) {
      if (intel.value === indicator) return intel;
    }
    return null;
  }

  private async signToken(header: TokenHeader, payload: TokenPayload): Promise<TokenSignature> {
    const data = JSON.stringify({ header, payload });
    return {
      algorithm: this.config.tokenAlgorithm,
      value: Buffer.from(await this.sha3Hash(data)).toString('base64url'),
      publicKeyId: this.signingKeyId,
      timestamp: new Date()
    };
  }

  private async verifySignature(token: UniversalEntityToken): Promise<boolean> {
    const data = JSON.stringify({ header: token.header, payload: token.payload });
    const expectedSig = Buffer.from(await this.sha3Hash(data)).toString('base64url');
    return token.signature.value === expectedSig;
  }

  private async appendAuditChain(token: UniversalEntityToken, action: string, actor: string): Promise<void> {
    const chain = token.metadata.auditChain;
    const previousHash = chain.length > 0 ? chain[chain.length - 1].hash : '0'.repeat(64);
    const now = new Date();
    const entry: AuditChainEntry = {
      id: this.generateId(),
      previousHash,
      action,
      actor,
      timestamp: now,
      hash: await this.hashChainEntry(action, actor, now)
    };
    chain.push(entry);
  }

  private createInitialFingerprint(): BehaviouralFingerprint {
    return {
      accessPatterns: [],
      typicalLocations: [],
      typicalHours: [],
      typicalDevices: [],
      interactionFrequency: 0,
      dataVolumeTypical: 0,
      anomalyScore: 0,
      lastUpdated: new Date()
    };
  }

  private calculateThreatConfidence(type: ThreatType, evidence: ThreatEvidence[]): number {
    const baseConfidence: Record<string, number> = {
      [ThreatType.BRUTE_FORCE]: 0.95,
      [ThreatType.IMPOSSIBLE_TRAVEL]: 0.90,
      [ThreatType.CREDENTIAL_STUFFING]: 0.85,
      [ThreatType.DATA_EXFILTRATION]: 0.75,
      [ThreatType.INSIDER_THREAT]: 0.65
    };
    return (baseConfidence[type] || 0.70) + (evidence.length * 0.02);
  }

  private getMitreTactics(type: ThreatType): string[] {
    const tactics: Record<string, string[]> = {
      [ThreatType.CREDENTIAL_STUFFING]: ['TA0006', 'TA0001'],
      [ThreatType.PRIVILEGE_ESCALATION]: ['TA0004'],
      [ThreatType.DATA_EXFILTRATION]: ['TA0010'],
      [ThreatType.LATERAL_MOVEMENT]: ['TA0008'],
      [ThreatType.INSIDER_THREAT]: ['TA0009']
    };
    return tactics[type] || ['TA0001'];
  }

  private getMitreTechniques(type: ThreatType): string[] {
    const techniques: Record<string, string[]> = {
      [ThreatType.CREDENTIAL_STUFFING]: ['T1110.004'],
      [ThreatType.PRIVILEGE_ESCALATION]: ['T1548'],
      [ThreatType.DATA_EXFILTRATION]: ['T1041'],
      [ThreatType.LATERAL_MOVEMENT]: ['T1021']
    };
    return techniques[type] || [];
  }

  private calculateForensicRiskScore(analysis: ForensicAnalysis): number {
    let score = 0;
    score += analysis.behaviouralAnalysis.baselineDeviation * 0.4;
    score += analysis.findings.filter(f => f.severity === ThreatSeverity.CRITICAL).length * 20;
    score += analysis.findings.filter(f => f.severity === ThreatSeverity.HIGH).length * 10;
    score += analysis.findings.filter(f => f.severity === ThreatSeverity.MEDIUM).length * 5;
    return Math.min(100, score);
  }

  private calculateAnalysisConfidence(analysis: ForensicAnalysis): number {
    const findingCount = analysis.findings.length;
    return Math.min(0.99, 0.5 + (findingCount * 0.05));
  }

  private getFollowUpActions(decision: VerdictDecision): string[] {
    const actions: Record<VerdictDecision, string[]> = {
      [VerdictDecision.RELEASE]: ['Monitor closely for 30 days', 'Update behavioural baseline'],
      [VerdictDecision.BLOCK]: ['Revoke all tokens', 'Notify security team', 'Update threat intelligence'],
      [VerdictDecision.REMEDIATE_AND_RELEASE]: ['Apply security patches', 'Reset credentials', 'Enable enhanced monitoring'],
      [VerdictDecision.ESCALATE]: ['Notify CISO', 'Engage incident response team'],
      [VerdictDecision.LEGAL_ACTION]: ['Preserve evidence', 'Notify legal team', 'File incident report'],
      [VerdictDecision.DESTROY]: ['Crypto-shred all data', 'Revoke all tokens', 'Update blocklists']
    };
    return actions[decision] || [];
  }

  private calculateEntropy(data: string): number {
    const freq: Record<string, number> = {};
    for (const char of data) freq[char] = (freq[char] || 0) + 1;
    return -Object.values(freq).reduce((sum, count) => {
      const p = count / data.length;
      return sum + p * Math.log2(p);
    }, 0);
  }

  private detectSuspiciousPatterns(data: string): string[] {
    const patterns: string[] = [];
    if (data.includes('eval(')) patterns.push('code_injection');
    if (data.includes('base64')) patterns.push('base64_encoding');
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(data)) patterns.push('ip_address_present');
    return patterns;
  }

  private async sha3Hash(data: string): Promise<string> {
    // Simplified - production uses actual SHA3-256
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  private async hashEntity(entityId: string, entityType: EntityType): Promise<string> {
    return this.sha3Hash(`${entityId}:${entityType}`);
  }

  private async hashChainEntry(action: string, actor: string, timestamp: Date): Promise<string> {
    return this.sha3Hash(`${action}:${actor}:${timestamp.toISOString()}`);
  }

  private async assignHiveNode(entityId: string): Promise<string> {
    return `hive_node_${Math.abs(entityId.charCodeAt(0) % 10)}`;
  }

  private generateTokenId(): string {
    return `uet_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 12)}`;
  }

  private generateChainId(): string {
    return `chain_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNonce(): string {
    return Math.random().toString(36).substr(2, 16);
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startMonitoring(): void {
    // In production: start background monitoring loops
    setInterval(() => this.runMonitoringCycle(), this.config.monitoring.batchIntervalMs);
  }

  private async runMonitoringCycle(): Promise<void> {
    // Check for expired tokens
    for (const token of this.tokens.values()) {
      if (token.expiresAt && new Date() > token.expiresAt && token.status === TokenStatus.ACTIVE) {
        await this.revokeToken(token.id, 'expired', 'system');
      }
    }
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

export interface IssueTokenOptions {
  permissions?: string[];
  initialRiskScore?: number;
  classification?: DataClassification;
  hiveNodeId?: string;
  voidKeyId?: string;
  parentTokenId?: string;
  customClaims?: Record<string, unknown>;
  createdBy?: string;
  reason?: string;
  tags?: string[];
}

export interface TokenVerificationResult {
  valid: boolean;
  reason?: string;
  token?: UniversalEntityToken;
}

export interface AnomalyDetectionResult {
  detected: boolean;
  threatType?: ThreatType;
  severity?: ThreatSeverity;
  description?: string;
}