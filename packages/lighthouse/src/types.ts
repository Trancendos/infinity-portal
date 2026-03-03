/**
 * The Lighthouse - Cryptographic Token Management Hub
 * Types for universal entity tokens, threat detection, warp tunnel, and icebox
 */

// ============================================================================
// Universal Entity Token (UET) Types
// ============================================================================

export interface UniversalEntityToken {
  id: string;                        // Token UUID
  entityId: string;                  // Entity being tokenised
  entityType: EntityType;            // Type of entity
  version: number;                   // Token version (increments on rotation)
  header: TokenHeader;
  payload: TokenPayload;
  signature: TokenSignature;
  status: TokenStatus;
  createdAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  lastVerifiedAt?: Date;
  rotatedAt?: Date;
  metadata: TokenMetadata;
}

export enum EntityType {
  USER = 'user',
  DATA = 'data',
  AI_MODEL = 'ai_model',
  BOT = 'bot',
  AGENT = 'agent',
  ITEM = 'item',
  SERVICE = 'service',
  TRANSACTION = 'transaction',
  DOCUMENT = 'document',
  MEDIA = 'media',
  CODE = 'code',
  WORKFLOW = 'workflow',
  POLICY = 'policy',
  SECRET = 'secret',
  DEVICE = 'device',
  NETWORK = 'network',
  QUANTUM_RESOURCE = 'quantum_resource',  // 2060
  NEURAL_PATTERN = 'neural_pattern'       // 2060 BCI
}

export interface TokenHeader {
  algorithm: string;                 // ML-DSA-65 (quantum-safe)
  version: string;                   // Token format version
  entityType: EntityType;
  issuer: string;                    // Lighthouse node ID
  issuedAt: Date;
}

export interface TokenPayload {
  entityId: string;
  entityType: EntityType;
  entityHash: string;                // SHA3-256 of entity state
  permissions: string[];
  riskScore: number;                 // 0-100
  behaviouralFingerprint: BehaviouralFingerprint;
  classification: DataClassification;
  hiveNodeId: string;                // HIVE routing assignment
  voidKeyId?: string;                // Void encryption key reference
  parentTokenId?: string;            // For derived tokens
  chainId: string;                   // Audit chain ID
  nonce: string;                     // Replay protection
  customClaims: Record<string, unknown>;
}

export interface TokenSignature {
  algorithm: string;                 // ML-DSA-65
  value: string;                     // Base64url encoded signature
  publicKeyId: string;               // Signing key ID
  hybridSignature?: string;          // Classical + PQC hybrid
  timestamp: Date;
}

export enum TokenStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
  ROTATING = 'rotating',
  QUARANTINED = 'quarantined',
  COMPROMISED = 'compromised'
}

export interface TokenMetadata {
  createdBy: string;
  createdReason: string;
  lastModifiedBy?: string;
  tags: string[];
  auditChain: AuditChainEntry[];
  rotationHistory: TokenRotation[];
  verificationCount: number;
  suspicionCount: number;
}

export interface AuditChainEntry {
  id: string;
  previousHash: string;
  action: string;
  actor: string;
  timestamp: Date;
  hash: string;                      // SHA3-256 of this entry
}

export interface TokenRotation {
  previousTokenId: string;
  newTokenId: string;
  reason: string;
  rotatedAt: Date;
  rotatedBy: string;
}

export interface BehaviouralFingerprint {
  accessPatterns: AccessPattern[];
  typicalLocations: string[];
  typicalHours: number[];            // 0-23
  typicalDevices: string[];
  interactionFrequency: number;      // ops/hour
  dataVolumeTypical: number;         // bytes/hour
  anomalyScore: number;              // 0-100
  lastUpdated: Date;
}

export interface AccessPattern {
  resource: string;
  frequency: number;
  lastAccessed: Date;
  typicalTime: string;               // HH:MM
}

export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  CLASSIFIED = 'classified',
  VOID = 'void'                      // Ultra-secret
}

// ============================================================================
// Threat Detection Types
// ============================================================================

export interface ThreatEvent {
  id: string;
  tokenId: string;
  entityId: string;
  entityType: EntityType;
  type: ThreatType;
  severity: ThreatSeverity;
  confidence: number;                // 0-1
  description: string;
  evidence: ThreatEvidence[];
  indicators: ThreatIndicator[];
  status: ThreatStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  warpTunnelTriggered: boolean;
  iceBoxId?: string;
  assignedTo?: string;
  resolution?: ThreatResolution;
  mitreTactics: string[];            // MITRE ATT&CK tactics
  mitreTechniques: string[];         // MITRE ATT&CK techniques
}

export enum ThreatType {
  // Identity Threats
  CREDENTIAL_STUFFING = 'credential_stuffing',
  ACCOUNT_TAKEOVER = 'account_takeover',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  IMPOSSIBLE_TRAVEL = 'impossible_travel',
  BRUTE_FORCE = 'brute_force',
  // Data Threats
  DATA_EXFILTRATION = 'data_exfiltration',
  DATA_TAMPERING = 'data_tampering',
  UNAUTHORISED_ACCESS = 'unauthorised_access',
  DATA_POISONING = 'data_poisoning',
  // AI/Bot Threats
  AI_JAILBREAK = 'ai_jailbreak',
  BOT_ABUSE = 'bot_abuse',
  AGENT_HIJACKING = 'agent_hijacking',
  MODEL_EXTRACTION = 'model_extraction',
  PROMPT_INJECTION = 'prompt_injection',
  // System Threats
  LATERAL_MOVEMENT = 'lateral_movement',
  SUPPLY_CHAIN = 'supply_chain',
  INSIDER_THREAT = 'insider_threat',
  ZERO_DAY = 'zero_day',
  RANSOMWARE = 'ransomware',
  // Quantum Threats (2060)
  QUANTUM_ATTACK = 'quantum_attack',
  HARVEST_NOW_DECRYPT_LATER = 'harvest_now_decrypt_later',
  // Neural Threats (2060)
  NEURAL_HIJACKING = 'neural_hijacking',
  THOUGHT_EXTRACTION = 'thought_extraction'
}

export enum ThreatSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  CATASTROPHIC = 'catastrophic'
}

export enum ThreatStatus {
  DETECTED = 'detected',
  INVESTIGATING = 'investigating',
  CONFIRMED = 'confirmed',
  CONTAINED = 'contained',
  ERADICATED = 'eradicated',
  RECOVERED = 'recovered',
  FALSE_POSITIVE = 'false_positive',
  WARP_TUNNELLED = 'warp_tunnelled'
}

export interface ThreatEvidence {
  type: string;
  description: string;
  data: unknown;
  timestamp: Date;
  source: string;
  confidence: number;
}

export interface ThreatIndicator {
  type: IndicatorType;
  value: string;
  confidence: number;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
}

export enum IndicatorType {
  IP_ADDRESS = 'ip_address',
  DOMAIN = 'domain',
  URL = 'url',
  FILE_HASH = 'file_hash',
  EMAIL = 'email',
  USER_AGENT = 'user_agent',
  BEHAVIOUR_PATTERN = 'behaviour_pattern',
  TOKEN_PATTERN = 'token_pattern'
}

export interface ThreatResolution {
  action: ResolutionAction;
  description: string;
  resolvedBy: string;
  resolvedAt: Date;
  preventionMeasures: string[];
  lessonsLearned: string[];
}

export enum ResolutionAction {
  BLOCKED = 'blocked',
  QUARANTINED = 'quarantined',
  REMEDIATED = 'remediated',
  ACCEPTED_RISK = 'accepted_risk',
  FALSE_POSITIVE = 'false_positive',
  ESCALATED = 'escalated'
}

// ============================================================================
// Warp Tunnel Types
// ============================================================================

export interface WarpTunnelTransfer {
  id: string;
  sourceEntityId: string;
  sourceEntityType: EntityType;
  sourceTokenId: string;
  threatEventId: string;
  status: WarpTunnelStatus;
  initiatedAt: Date;
  completedAt?: Date;
  scanResult: WarpScanResult;
  captureSnapshot: EntitySnapshot;
  transferMetrics: TransferMetrics;
  iceBoxId?: string;
  initiatedBy: string;
  reason: string;
}

export enum WarpTunnelStatus {
  SCANNING = 'scanning',
  CAPTURING = 'capturing',
  ENCRYPTING = 'encrypting',
  TRANSFERRING = 'transferring',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

export interface WarpScanResult {
  scanId: string;
  scannedAt: Date;
  duration: number;                  // ms
  findings: ScanFinding[];
  riskScore: number;
  recommendation: 'transfer' | 'monitor' | 'release';
  signatures: string[];              // Matched threat signatures
}

export interface ScanFinding {
  type: string;
  severity: ThreatSeverity;
  description: string;
  evidence: string;
  confidence: number;
}

export interface EntitySnapshot {
  entityId: string;
  entityType: EntityType;
  capturedAt: Date;
  state: Record<string, unknown>;
  hash: string;                      // Integrity verification
  encryptedWith: string;             // Key ID used for encryption
  size: number;                      // bytes
}

export interface TransferMetrics {
  scanDuration: number;              // ms
  captureDuration: number;           // ms
  encryptionDuration: number;        // ms
  transferDuration: number;          // ms
  totalDuration: number;             // ms
  dataSize: number;                  // bytes
  compressionRatio: number;
}

// ============================================================================
// IceBox Types
// ============================================================================

export interface IceBoxEntry {
  id: string;
  entityId: string;
  entityType: EntityType;
  tokenId: string;
  warpTunnelId: string;
  threatEventId: string;
  status: IceBoxStatus;
  quarantinedAt: Date;
  releasedAt?: Date;
  deletedAt?: Date;
  snapshot: EntitySnapshot;
  analysis: ForensicAnalysis;
  verdict?: IceBoxVerdict;
  assignedAnalyst?: string;
  legalHold: boolean;
  retentionUntil: Date;
  tags: string[];
  notes: string[];
}

export enum IceBoxStatus {
  QUARANTINED = 'quarantined',
  ANALYSING = 'analysing',
  PENDING_VERDICT = 'pending_verdict',
  RELEASED = 'released',
  PERMANENTLY_BLOCKED = 'permanently_blocked',
  LEGAL_HOLD = 'legal_hold',
  ARCHIVED = 'archived'
}

export interface ForensicAnalysis {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  analyst: string;                   // 'ai' or user ID
  staticAnalysis: StaticAnalysis;
  dynamicAnalysis?: DynamicAnalysis;
  behaviouralAnalysis: BehaviouralAnalysis;
  networkAnalysis?: NetworkAnalysis;
  timeline: ForensicEvent[];
  findings: ForensicFinding[];
  riskScore: number;
  confidence: number;
}

export interface StaticAnalysis {
  fileType?: string;
  fileSize?: number;
  hashes: Record<string, string>;    // md5, sha1, sha256, sha3-256
  signatures: string[];
  entropy: number;
  suspiciousPatterns: string[];
  codeAnalysis?: CodeAnalysis;
}

export interface CodeAnalysis {
  language?: string;
  complexity: number;
  vulnerabilities: string[];
  maliciousPatterns: string[];
  obfuscationDetected: boolean;
}

export interface DynamicAnalysis {
  executionEnvironment: string;
  duration: number;
  systemCalls: string[];
  networkConnections: string[];
  fileOperations: string[];
  registryChanges?: string[];
  processCreations: string[];
  anomalies: string[];
}

export interface BehaviouralAnalysis {
  baselineDeviation: number;         // % deviation from normal
  anomalousActions: string[];
  suspiciousPatterns: string[];
  intentClassification: string;
  riskFactors: string[];
}

export interface NetworkAnalysis {
  connections: NetworkConnection[];
  dnsQueries: string[];
  dataTransferred: number;
  suspiciousEndpoints: string[];
  c2Detected: boolean;
}

export interface NetworkConnection {
  destination: string;
  port: number;
  protocol: string;
  bytesTransferred: number;
  suspicious: boolean;
}

export interface ForensicEvent {
  timestamp: Date;
  type: string;
  description: string;
  severity: ThreatSeverity;
  evidence: string;
}

export interface ForensicFinding {
  id: string;
  type: string;
  severity: ThreatSeverity;
  description: string;
  evidence: string[];
  recommendation: string;
  confidence: number;
}

export interface IceBoxVerdict {
  decision: VerdictDecision;
  reason: string;
  decidedBy: string;
  decidedAt: Date;
  conditions?: string[];
  followUpActions: string[];
}

export enum VerdictDecision {
  RELEASE = 'release',
  BLOCK = 'block',
  REMEDIATE_AND_RELEASE = 'remediate_and_release',
  ESCALATE = 'escalate',
  LEGAL_ACTION = 'legal_action',
  DESTROY = 'destroy'
}

// ============================================================================
// Monitoring & Analytics Types
// ============================================================================

export interface TokenActivity {
  tokenId: string;
  entityId: string;
  entityType: EntityType;
  action: string;
  resource: string;
  ipAddress?: string;
  location?: string;
  timestamp: Date;
  duration?: number;
  result: 'success' | 'failure' | 'blocked';
  riskScore: number;
  anomalous: boolean;
}

export interface LighthouseMetrics {
  totalTokens: number;
  activeTokens: number;
  revokedTokens: number;
  quarantinedTokens: number;
  threatsDetected: number;
  threatsResolved: number;
  warpTunnelTransfers: number;
  iceBoxEntries: number;
  averageRiskScore: number;
  tokensByType: Record<EntityType, number>;
  threatsByType: Record<ThreatType, number>;
  threatsBySeverity: Record<ThreatSeverity, number>;
  topRiskyEntities: RiskyEntity[];
  recentAlerts: ThreatEvent[];
}

export interface RiskyEntity {
  entityId: string;
  entityType: EntityType;
  tokenId: string;
  riskScore: number;
  threatCount: number;
  lastThreatAt: Date;
}

export interface ThreatIntelligence {
  id: string;
  source: string;
  type: IndicatorType;
  value: string;
  severity: ThreatSeverity;
  confidence: number;
  description: string;
  tags: string[];
  firstSeen: Date;
  lastSeen: Date;
  expiresAt?: Date;
  relatedIndicators: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface LighthouseConfig {
  tokenAlgorithm: string;            // Default: ML-DSA-65
  tokenExpiry: number;               // Default: 0 (no expiry)
  rotationInterval: number;          // seconds
  riskThresholds: RiskThresholds;
  warpTunnel: WarpTunnelConfig;
  iceBox: IceBoxConfig;
  monitoring: MonitoringConfig;
}

export interface RiskThresholds {
  autoWarpTunnel: number;            // Risk score to auto-trigger warp tunnel
  humanReview: number;               // Risk score requiring human review
  autoBlock: number;                 // Risk score for auto-block
  alertThreshold: number;            // Risk score for alert
}

export interface WarpTunnelConfig {
  enabled: boolean;
  autoTriggerThreshold: number;
  scanTimeout: number;               // ms
  transferTimeout: number;           // ms
  encryptionAlgorithm: string;
  verificationRequired: boolean;
}

export interface IceBoxConfig {
  defaultRetentionDays: number;
  legalHoldRetentionDays: number;
  autoAnalysis: boolean;
  aiAnalysisEnabled: boolean;
  sandboxEnabled: boolean;
  maxConcurrentAnalyses: number;
}

export interface MonitoringConfig {
  realTimeEnabled: boolean;
  batchIntervalMs: number;
  retentionDays: number;
  alertChannels: string[];
  metricsEnabled: boolean;
  dashboardEnabled: boolean;
}