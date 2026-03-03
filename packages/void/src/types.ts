/**
 * ████████╗██╗  ██╗███████╗    ██╗   ██╗ ██████╗ ██╗██████╗
 *    ██╔══╝██║  ██║██╔════╝    ██║   ██║██╔═══██╗██║██╔══██╗
 *    ██║   ███████║█████╗      ██║   ██║██║   ██║██║██║  ██║
 *    ██║   ██╔══██║██╔══╝      ╚██╗ ██╔╝██║   ██║██║██║  ██║
 *    ██║   ██║  ██║███████╗     ╚████╔╝ ╚██████╔╝██║██████╔╝
 *    ╚═╝   ╚═╝  ╚═╝╚══════╝     ╚═══╝   ╚═════╝ ╚═╝╚═════╝
 *
 * The Void - Central Secure Secret Store
 * Zero-Knowledge Proofs | Shamir's Secret Sharing | Multi-Party Computation
 * Post-Quantum Cryptography | Crypto-Shredding | GDPR Compliant
 *
 * "In the centre of it all lies The Void — where secrets are kept eternal,
 *  invisible to all but those who hold the shards of truth."
 *
 * @package @trancendos/void
 * @version 1.0.0
 * @future-proof 2060
 */

// ============================================================
// CORE SECRET TYPES
// ============================================================

/** Classification level of a secret — mirrors HIVE DataClassification */
export enum SecretClassification {
  INTERNAL      = 'INTERNAL',       // Internal platform secrets
  CONFIDENTIAL  = 'CONFIDENTIAL',   // Sensitive business data
  CLASSIFIED    = 'CLASSIFIED',     // Highly restricted secrets
  VOID          = 'VOID',           // Absolute top-secret — The Void core
  QUANTUM       = 'QUANTUM',        // Quantum-state secrets (2060)
  NEURAL        = 'NEURAL',         // Neural-pattern bound secrets (2060)
}

/** Type of secret stored in The Void */
export enum SecretType {
  // Cryptographic
  PRIVATE_KEY         = 'PRIVATE_KEY',        // Asymmetric private key
  SYMMETRIC_KEY       = 'SYMMETRIC_KEY',      // Symmetric encryption key
  SIGNING_KEY         = 'SIGNING_KEY',        // JWT/token signing key
  QUANTUM_KEY         = 'QUANTUM_KEY',        // Post-quantum key material
  CERTIFICATE         = 'CERTIFICATE',        // TLS/mTLS certificate
  CA_BUNDLE           = 'CA_BUNDLE',          // Certificate authority bundle

  // Credentials
  API_KEY             = 'API_KEY',            // External API key
  OAUTH_SECRET        = 'OAUTH_SECRET',       // OAuth client secret
  DATABASE_URL        = 'DATABASE_URL',       // Database connection string
  SERVICE_ACCOUNT     = 'SERVICE_ACCOUNT',    // Service account credentials
  WEBHOOK_SECRET      = 'WEBHOOK_SECRET',     // Webhook signing secret
  PASSPHRASE          = 'PASSPHRASE',         // Human-readable passphrase

  // Platform
  MASTER_KEY          = 'MASTER_KEY',         // Platform master encryption key
  SHAMIR_SHARD        = 'SHAMIR_SHARD',       // Shamir's Secret Sharing shard
  MPC_SHARE           = 'MPC_SHARE',          // Multi-Party Computation share
  HSM_REFERENCE       = 'HSM_REFERENCE',      // Hardware Security Module reference
  ZERO_KNOWLEDGE      = 'ZERO_KNOWLEDGE',     // Zero-knowledge proof material

  // Application
  ENCRYPTION_KEY      = 'ENCRYPTION_KEY',     // Application encryption key
  HMAC_SECRET         = 'HMAC_SECRET',        // HMAC signing secret
  SESSION_SECRET      = 'SESSION_SECRET',     // Session encryption secret
  TOTP_SEED           = 'TOTP_SEED',          // TOTP seed (MFA)
  BACKUP_CODE         = 'BACKUP_CODE',        // MFA backup codes

  // Financial
  PAYMENT_KEY         = 'PAYMENT_KEY',        // Payment processor key
  BANK_CREDENTIAL     = 'BANK_CREDENTIAL',    // Banking API credential
  CRYPTO_WALLET       = 'CRYPTO_WALLET',      // Cryptocurrency wallet key

  // 2060 Future
  NEURAL_BINDING      = 'NEURAL_BINDING',     // Neural interface binding key
  QUANTUM_ENTANGLED   = 'QUANTUM_ENTANGLED',  // Quantum-entangled secret pair
  BIO_METRIC_HASH     = 'BIO_METRIC_HASH',    // Biometric hash binding
  HOLOGRAPHIC         = 'HOLOGRAPHIC',        // Holographic storage reference
}

/** Current status of a secret */
export enum SecretStatus {
  ACTIVE      = 'ACTIVE',       // Secret is active and accessible
  ROTATING    = 'ROTATING',     // Secret is being rotated
  DEPRECATED  = 'DEPRECATED',   // Old version, still readable
  REVOKED     = 'REVOKED',      // Permanently revoked
  EXPIRED     = 'EXPIRED',      // Past expiry date
  SHREDDED    = 'SHREDDED',     // Crypto-shredded (GDPR erasure)
  QUARANTINED = 'QUARANTINED',  // Moved to IceBox via Warp Tunnel
  SEALED      = 'SEALED',       // Sealed — requires quorum to unseal
}

/** Encryption algorithm used for a secret */
export enum EncryptionAlgorithm {
  // Symmetric
  AES_256_GCM       = 'AES-256-GCM',         // Standard symmetric
  CHACHA20_POLY1305 = 'ChaCha20-Poly1305',   // High-performance symmetric
  AES_256_CBC       = 'AES-256-CBC',         // Legacy compatibility

  // Post-Quantum (NIST PQC 2024)
  ML_KEM_1024       = 'ML-KEM-1024',         // CRYSTALS-Kyber (key encapsulation)
  ML_KEM_768        = 'ML-KEM-768',          // CRYSTALS-Kyber (medium security)
  ML_DSA_65         = 'ML-DSA-65',           // CRYSTALS-Dilithium (signatures)
  SLH_DSA_256       = 'SLH-DSA-256',         // SPHINCS+ (stateless hash-based)
  BIKE_L3           = 'BIKE-L3',             // BIKE (code-based, 2060)

  // Hybrid (Classical + PQC)
  HYBRID_X25519_MLKEM = 'Hybrid-X25519-MLKEM-1024',  // Hybrid key exchange
  HYBRID_P384_MLKEM   = 'Hybrid-P384-MLKEM-1024',    // Hybrid (FIPS compliant)
}

// ============================================================
// SECRET CORE STRUCTURE
// ============================================================

/** Encrypted secret envelope — the actual stored unit */
export interface SecretEnvelope {
  /** Unique secret identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Secret type classification */
  type: SecretType;

  /** Security classification level */
  classification: SecretClassification;

  /** Current status */
  status: SecretStatus;

  /** Version number (increments on rotation) */
  version: number;

  /** Previous version IDs for rotation chain */
  previousVersions: string[];

  /** Encrypted payload */
  encryptedPayload: EncryptedPayload;

  /** Key derivation info */
  keyDerivation: KeyDerivationInfo;

  /** Access control policy */
  accessPolicy: SecretAccessPolicy;

  /** Shamir's Secret Sharing config (if applicable) */
  shamirConfig?: ShamirConfig;

  /** Zero-knowledge proof binding */
  zkBinding?: ZeroKnowledgeBinding;

  /** Metadata */
  metadata: SecretMetadata;

  /** Audit trail */
  auditLog: SecretAuditEntry[];

  /** Tags for organisation */
  tags: string[];

  /** Namespace / path (e.g. "platform/database/primary") */
  path: string;

  /** Owner entity (user ID, service ID, etc.) */
  ownerId: string;

  /** Organisation scope */
  organisationId?: string;

  /** Expiry timestamp */
  expiresAt?: string;

  /** Auto-rotation config */
  rotationConfig?: RotationConfig;

  /** GDPR compliance data */
  gdpr: SecretGDPR;

  /** Created timestamp */
  createdAt: string;

  /** Last updated timestamp */
  updatedAt: string;

  /** Last accessed timestamp */
  lastAccessedAt?: string;
}

/** Encrypted payload container */
export interface EncryptedPayload {
  /** Ciphertext (base64url encoded) */
  ciphertext: string;

  /** Initialisation vector / nonce */
  iv: string;

  /** Authentication tag (for AEAD) */
  authTag: string;

  /** Additional authenticated data */
  aad?: string;

  /** Algorithm used */
  algorithm: EncryptionAlgorithm;

  /** Key ID used for encryption */
  keyId: string;

  /** Key version */
  keyVersion: number;

  /** Integrity hash of plaintext (before encryption) */
  plaintextHash: string;

  /** Hash algorithm used */
  hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' | 'BLAKE3';

  /** Encrypted at timestamp */
  encryptedAt: string;
}

/** Key derivation information */
export interface KeyDerivationInfo {
  /** KDF algorithm */
  algorithm: 'HKDF' | 'PBKDF2' | 'Argon2id' | 'scrypt' | 'CRYSTALS-Kyber';

  /** Salt (base64url) */
  salt: string;

  /** Iterations (for PBKDF2) */
  iterations?: number;

  /** Memory cost (for Argon2id/scrypt) */
  memoryCost?: number;

  /** Parallelism (for Argon2id) */
  parallelism?: number;

  /** Output key length in bytes */
  keyLength: number;

  /** Info string (for HKDF) */
  info?: string;
}

// ============================================================
// ACCESS CONTROL
// ============================================================

/** Access policy for a secret */
export interface SecretAccessPolicy {
  /** Who can read this secret */
  readers: AccessPrincipal[];

  /** Who can write/update this secret */
  writers: AccessPrincipal[];

  /** Who can manage (rotate, delete, policy changes) */
  managers: AccessPrincipal[];

  /** Who can approve access requests */
  approvers: AccessPrincipal[];

  /** Conditions that must be met for access */
  conditions: AccessCondition[];

  /** Require multi-party approval for access */
  requireApproval: boolean;

  /** Number of approvals required */
  approvalQuorum?: number;

  /** Time-based access windows */
  accessWindows?: AccessWindow[];

  /** IP allowlist */
  ipAllowlist?: string[];

  /** Require MFA for access */
  requireMFA: boolean;

  /** Require hardware key for access */
  requireHardwareKey: boolean;

  /** Maximum access frequency */
  rateLimit?: AccessRateLimit;

  /** Break-glass emergency access */
  breakGlass?: BreakGlassConfig;
}

/** Access principal (who can access) */
export interface AccessPrincipal {
  /** Principal type */
  type: 'user' | 'role' | 'service' | 'group' | 'organisation' | 'system';

  /** Principal ID */
  id: string;

  /** Display name */
  name?: string;

  /** Expiry of this access grant */
  expiresAt?: string;

  /** Granted by */
  grantedBy?: string;

  /** Grant timestamp */
  grantedAt: string;
}

/** Condition for access */
export interface AccessCondition {
  type: 'time_of_day' | 'day_of_week' | 'ip_range' | 'geo_location' |
        'mfa_verified' | 'risk_score_below' | 'lighthouse_token_valid' |
        'hive_classification_match' | 'quantum_verified' | 'neural_verified';
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_in' | 'matches';
  value: unknown;
}

/** Time window for access */
export interface AccessWindow {
  /** Day of week (0=Sun, 6=Sat) */
  daysOfWeek: number[];

  /** Start time (HH:MM UTC) */
  startTime: string;

  /** End time (HH:MM UTC) */
  endTime: string;

  /** Timezone */
  timezone: string;
}

/** Rate limit for secret access */
export interface AccessRateLimit {
  /** Max requests per window */
  maxRequests: number;

  /** Window in seconds */
  windowSeconds: number;

  /** Per principal or global */
  perPrincipal: boolean;
}

/** Break-glass emergency access configuration */
export interface BreakGlassConfig {
  /** Is break-glass enabled */
  enabled: boolean;

  /** Principals who can invoke break-glass */
  authorisedPrincipals: string[];

  /** Require reason */
  requireReason: boolean;

  /** Auto-alert on break-glass use */
  alertOnUse: boolean;

  /** Alert recipients */
  alertRecipients: string[];

  /** Auto-rotate after break-glass use */
  autoRotateAfterUse: boolean;
}

// ============================================================
// SHAMIR'S SECRET SHARING
// ============================================================

/** Shamir's Secret Sharing configuration */
export interface ShamirConfig {
  /** Total number of shards */
  totalShards: number;

  /** Minimum shards required to reconstruct (threshold) */
  threshold: number;

  /** Shard holders */
  shardHolders: ShardHolder[];

  /** Whether shards have been distributed */
  distributed: boolean;

  /** Distribution timestamp */
  distributedAt?: string;

  /** Last reconstruction attempt */
  lastReconstructedAt?: string;

  /** Reconstruction requires audit */
  requireAudit: boolean;
}

/** A holder of a Shamir shard */
export interface ShardHolder {
  /** Holder ID */
  holderId: string;

  /** Holder type */
  holderType: 'user' | 'service' | 'hsm' | 'cloudflare_kv' | 'supabase' | 'offline';

  /** Shard index (1-based) */
  shardIndex: number;

  /** Encrypted shard (encrypted with holder's public key) */
  encryptedShard: string;

  /** Holder's public key fingerprint */
  publicKeyFingerprint: string;

  /** Whether this holder has confirmed receipt */
  confirmed: boolean;

  /** Confirmation timestamp */
  confirmedAt?: string;

  /** Geographic location of shard (for geo-distribution) */
  geoLocation?: string;
}

/** Result of Shamir reconstruction */
export interface ShamirReconstructionResult {
  success: boolean;
  secretId: string;
  shardsUsed: number;
  reconstructedAt: string;
  requestedBy: string;
  reason: string;
  auditId: string;
}

// ============================================================
// ZERO-KNOWLEDGE PROOFS
// ============================================================

/** Zero-knowledge proof binding for a secret */
export interface ZeroKnowledgeBinding {
  /** ZK proof system used */
  system: 'Groth16' | 'PLONK' | 'STARKs' | 'Bulletproofs' | 'Nova' | 'Halo2';

  /** Commitment to the secret (public) */
  commitment: string;

  /** Verification key */
  verificationKey: string;

  /** Proof that secret satisfies constraints (without revealing secret) */
  proof: string;

  /** Public inputs to the proof */
  publicInputs: string[];

  /** Circuit description */
  circuitId: string;

  /** Proof generated at */
  proofGeneratedAt: string;

  /** Proof expires at */
  proofExpiresAt?: string;
}

/** ZK proof verification result */
export interface ZKVerificationResult {
  valid: boolean;
  secretId: string;
  verifiedAt: string;
  verifier: string;
  proofSystem: string;
  publicInputsHash: string;
}

// ============================================================
// SECRET ROTATION
// ============================================================

/** Auto-rotation configuration */
export interface RotationConfig {
  /** Is auto-rotation enabled */
  enabled: boolean;

  /** Rotation interval in days */
  intervalDays: number;

  /** Rotation strategy */
  strategy: RotationStrategy;

  /** Notify before rotation (days) */
  notifyDaysBefore: number;

  /** Notification recipients */
  notifyRecipients: string[];

  /** Last rotation timestamp */
  lastRotatedAt?: string;

  /** Next scheduled rotation */
  nextRotationAt?: string;

  /** Rotation webhook URL */
  webhookUrl?: string;

  /** Keep N previous versions */
  keepVersions: number;

  /** Custom rotation handler */
  customHandler?: string;
}

/** Rotation strategy */
export enum RotationStrategy {
  IMMEDIATE     = 'IMMEDIATE',      // Rotate immediately, old key invalid
  GRACEFUL      = 'GRACEFUL',       // Keep old key valid for grace period
  DUAL_ACTIVE   = 'DUAL_ACTIVE',    // Both old and new keys valid during transition
  BLUE_GREEN    = 'BLUE_GREEN',     // Blue-green deployment style rotation
  CANARY        = 'CANARY',         // Gradual rollout of new key
}

/** Secret rotation event */
export interface RotationEvent {
  id: string;
  secretId: string;
  previousVersion: number;
  newVersion: number;
  strategy: RotationStrategy;
  triggeredBy: 'auto' | 'manual' | 'policy' | 'breach_response';
  triggeredByPrincipal?: string;
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  error?: string;
}

// ============================================================
// AUDIT & COMPLIANCE
// ============================================================

/** Audit log entry for secret operations */
export interface SecretAuditEntry {
  /** Unique audit entry ID */
  id: string;

  /** Secret ID */
  secretId: string;

  /** Action performed */
  action: SecretAction;

  /** Who performed the action */
  principalId: string;

  /** Principal type */
  principalType: 'user' | 'service' | 'system' | 'admin' | 'break_glass';

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Geographic location */
  geoLocation?: string;

  /** Lighthouse token ID (for entity tracking) */
  lighthouseTokenId?: string;

  /** HIVE routing path */
  hiveRoutingPath?: string;

  /** Result of the action */
  result: 'success' | 'denied' | 'error' | 'partial';

  /** Denial reason (if denied) */
  denialReason?: string;

  /** Risk score at time of access */
  riskScore?: number;

  /** Was this a break-glass access */
  isBreakGlass: boolean;

  /** Reason provided (for sensitive operations) */
  reason?: string;

  /** Timestamp */
  timestamp: string;

  /** Immutable hash of this entry (for tamper detection) */
  entryHash: string;

  /** Hash of previous entry (chain integrity) */
  previousEntryHash?: string;
}

/** Actions that can be performed on secrets */
export enum SecretAction {
  // CRUD
  CREATE          = 'CREATE',
  READ            = 'READ',
  UPDATE          = 'UPDATE',
  DELETE          = 'DELETE',

  // Access
  ACCESS_GRANTED  = 'ACCESS_GRANTED',
  ACCESS_DENIED   = 'ACCESS_DENIED',
  ACCESS_REVOKED  = 'ACCESS_REVOKED',

  // Rotation
  ROTATE          = 'ROTATE',
  ROTATION_START  = 'ROTATION_START',
  ROTATION_COMPLETE = 'ROTATION_COMPLETE',
  ROTATION_FAILED = 'ROTATION_FAILED',

  // Shamir
  SHARD_DISTRIBUTE  = 'SHARD_DISTRIBUTE',
  SHARD_COLLECT     = 'SHARD_COLLECT',
  RECONSTRUCT       = 'RECONSTRUCT',

  // Security
  SEAL            = 'SEAL',
  UNSEAL          = 'UNSEAL',
  QUARANTINE      = 'QUARANTINE',
  SHRED           = 'SHRED',
  BREAK_GLASS     = 'BREAK_GLASS',

  // Policy
  POLICY_UPDATE   = 'POLICY_UPDATE',
  POLICY_EVALUATE = 'POLICY_EVALUATE',

  // ZK
  ZK_PROOF_GENERATE = 'ZK_PROOF_GENERATE',
  ZK_PROOF_VERIFY   = 'ZK_PROOF_VERIFY',
}

/** Secret metadata */
export interface SecretMetadata {
  /** Source system that created this secret */
  sourceSystem?: string;

  /** External reference ID */
  externalRef?: string;

  /** Environment (production, staging, development) */
  environment: 'production' | 'staging' | 'development' | 'testing';

  /** Region where secret is stored */
  region: string;

  /** Replication regions */
  replicatedTo?: string[];

  /** Custom labels */
  labels: Record<string, string>;

  /** Linked entity IDs (Lighthouse UET IDs) */
  linkedEntityIds?: string[];

  /** Linked application IDs */
  linkedApplicationIds?: string[];

  /** Compliance frameworks this secret falls under */
  complianceFrameworks: ComplianceFramework[];

  /** Data residency requirements */
  dataResidency?: string[];

  /** Sensitivity score (0-100) */
  sensitivityScore: number;
}

/** Compliance framework */
export enum ComplianceFramework {
  GDPR      = 'GDPR',
  SOC2      = 'SOC2',
  ISO27001  = 'ISO27001',
  PCI_DSS   = 'PCI_DSS',
  HIPAA     = 'HIPAA',
  FIPS_140  = 'FIPS-140-3',
  NIST_CSF  = 'NIST-CSF',
  DORA      = 'DORA',       // EU Digital Operational Resilience Act
  NIS2      = 'NIS2',       // EU Network and Information Security
}

/** GDPR compliance data for a secret */
export interface SecretGDPR {
  /** Contains personal data */
  containsPersonalData: boolean;

  /** Data subject IDs (if personal data) */
  dataSubjectIds?: string[];

  /** Legal basis for processing */
  legalBasis?: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';

  /** Retention period in days */
  retentionDays?: number;

  /** Scheduled for erasure */
  scheduledErasureAt?: string;

  /** Erasure completed */
  erasureCompletedAt?: string;

  /** Data portability export available */
  portabilityAvailable: boolean;
}

// ============================================================
// VAULT OPERATIONS
// ============================================================

/** Request to store a new secret */
export interface StoreSecretRequest {
  name: string;
  description?: string;
  type: SecretType;
  classification: SecretClassification;
  plaintext: string;
  path: string;
  tags?: string[];
  accessPolicy?: Partial<SecretAccessPolicy>;
  shamirConfig?: Partial<ShamirConfig>;
  rotationConfig?: Partial<RotationConfig>;
  expiresAt?: string;
  metadata?: Partial<SecretMetadata>;
  requestedBy: string;
  reason?: string;
}

/** Request to retrieve a secret */
export interface RetrieveSecretRequest {
  secretId: string;
  requestedBy: string;
  reason?: string;
  mfaToken?: string;
  hardwareKeySignature?: string;
  lighthouseTokenId?: string;
  breakGlass?: boolean;
  breakGlassReason?: string;
}

/** Response when retrieving a secret */
export interface RetrieveSecretResponse {
  secretId: string;
  name: string;
  type: SecretType;
  classification: SecretClassification;
  version: number;
  plaintext: string;
  expiresAt?: string;
  retrievedAt: string;
  auditId: string;
  warnings?: string[];
}

/** Request to rotate a secret */
export interface RotateSecretRequest {
  secretId: string;
  newPlaintext?: string;       // If not provided, auto-generate
  strategy: RotationStrategy;
  requestedBy: string;
  reason?: string;
  gracePeriodHours?: number;
}

/** Secret search/filter options */
export interface SecretSearchOptions {
  path?: string;
  type?: SecretType;
  classification?: SecretClassification;
  status?: SecretStatus;
  tags?: string[];
  ownerId?: string;
  organisationId?: string;
  environment?: string;
  expiringWithinDays?: number;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// VOID CORE — MASTER KEY MANAGEMENT
// ============================================================

/** The Void master key state */
export interface VoidMasterKey {
  /** Key ID */
  id: string;

  /** Key version */
  version: number;

  /** Algorithm */
  algorithm: EncryptionAlgorithm;

  /** Key status */
  status: 'active' | 'rotating' | 'retired';

  /** Shamir shards of the master key */
  shamirShards: ShardHolder[];

  /** Threshold for reconstruction */
  shamirThreshold: number;

  /** Total shards */
  shamirTotal: number;

  /** Whether the vault is sealed */
  sealed: boolean;

  /** Unseal progress (shards collected) */
  unsealProgress: number;

  /** Created at */
  createdAt: string;

  /** Last rotated at */
  lastRotatedAt?: string;
}

/** Vault seal/unseal status */
export interface VaultSealStatus {
  sealed: boolean;
  shamirThreshold: number;
  shamirTotal: number;
  shardsProvided: number;
  shardsRemaining: number;
  progress: number;  // 0-100
  lastSealedAt?: string;
  lastUnsealedAt?: string;
  sealedBy?: string;
  unsealedBy?: string[];
}

/** Unseal request (provide a Shamir shard) */
export interface UnsealRequest {
  shardIndex: number;
  encryptedShard: string;
  providedBy: string;
  signature: string;
}

// ============================================================
// VOID METRICS & HEALTH
// ============================================================

/** Void service metrics */
export interface VoidMetrics {
  /** Total secrets stored */
  totalSecrets: number;

  /** Secrets by classification */
  byClassification: Record<SecretClassification, number>;

  /** Secrets by type */
  byType: Record<SecretType, number>;

  /** Secrets by status */
  byStatus: Record<SecretStatus, number>;

  /** Secrets expiring within 7 days */
  expiringIn7Days: number;

  /** Secrets expiring within 30 days */
  expiringIn30Days: number;

  /** Total access requests (24h) */
  accessRequests24h: number;

  /** Denied access requests (24h) */
  deniedRequests24h: number;

  /** Break-glass uses (30d) */
  breakGlassUses30d: number;

  /** Rotations completed (30d) */
  rotationsCompleted30d: number;

  /** Rotations failed (30d) */
  rotationsFailed30d: number;

  /** Vault seal status */
  sealStatus: VaultSealStatus;

  /** Average sensitivity score */
  avgSensitivityScore: number;

  /** Secrets pending GDPR erasure */
  pendingGDPRErasure: number;

  /** Last health check */
  lastHealthCheck: string;

  /** Health status */
  healthStatus: 'healthy' | 'degraded' | 'critical' | 'sealed';
}

/** Void service configuration */
export interface VoidConfig {
  /** Master key algorithm */
  masterKeyAlgorithm: EncryptionAlgorithm;

  /** Default encryption algorithm for secrets */
  defaultEncryptionAlgorithm: EncryptionAlgorithm;

  /** Shamir threshold (default 5-of-9) */
  shamirThreshold: number;

  /** Shamir total shards (default 9) */
  shamirTotal: number;

  /** Auto-seal after inactivity (minutes) */
  autoSealMinutes: number;

  /** Max secret size in bytes */
  maxSecretSizeBytes: number;

  /** Max secrets per organisation */
  maxSecretsPerOrg: number;

  /** Default retention days */
  defaultRetentionDays: number;

  /** Audit log retention days */
  auditRetentionDays: number;

  /** Enable zero-knowledge proofs */
  enableZKProofs: boolean;

  /** Enable Shamir's Secret Sharing for VOID classification */
  enableShamirForVoid: boolean;

  /** Lighthouse integration */
  lighthouseIntegration: boolean;

  /** HIVE routing integration */
  hiveIntegration: boolean;

  /** Warp Tunnel integration (quarantine compromised secrets) */
  warpTunnelIntegration: boolean;

  /** Storage backends */
  storageBackends: StorageBackend[];
}

/** Storage backend configuration */
export interface StorageBackend {
  id: string;
  type: 'cloudflare_kv' | 'supabase' | 'r2' | 'hsm' | 'memory' | 'quantum_storage';
  priority: number;
  encrypted: boolean;
  region?: string;
  config: Record<string, unknown>;
}

// ============================================================
// MULTI-PARTY COMPUTATION (MPC)
// ============================================================

/** MPC session for distributed secret operations */
export interface MPCSession {
  id: string;
  secretId: string;
  operation: 'generate' | 'sign' | 'decrypt' | 'reconstruct';
  parties: MPCParty[];
  threshold: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  protocol: 'ECDSA-MPC' | 'BLS-MPC' | 'Threshold-BLS' | 'FROST' | 'GG20';
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  result?: string;
}

/** A party in an MPC session */
export interface MPCParty {
  partyId: string;
  partyIndex: number;
  publicKey: string;
  share?: string;
  committed: boolean;
  committedAt?: string;
  signature?: string;
}

// ============================================================
// WARP TUNNEL INTEGRATION
// ============================================================

/** Warp Tunnel transfer for a compromised secret */
export interface SecretWarpTransfer {
  id: string;
  secretId: string;
  secretName: string;
  reason: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  triggeredBy: string;
  triggeredAt: string;
  status: 'initiated' | 'scanning' | 'capturing' | 'encrypting' | 'transferring' | 'quarantined' | 'failed';
  iceBoxEntryId?: string;
  autoShredded: boolean;
  shredCompletedAt?: string;
}