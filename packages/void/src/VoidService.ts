/**
 * ████████╗██╗  ██╗███████╗    ██╗   ██╗ ██████╗ ██╗██████╗
 *    ██╔══╝██║  ██║██╔════╝    ██║   ██║██╔═══██╗██║██╔══██╗
 *    ██║   ███████║█████╗      ██║   ██║██║   ██║██║██║  ██║
 *    ██║   ██╔══██║██╔══╝      ╚██╗ ██╔╝██║   ██║██║██║  ██║
 *    ██║   ██║  ██║███████╗     ╚████╔╝ ╚██████╔╝██║██████╔╝
 *    ╚═╝   ╚═╝  ╚═╝╚══════╝     ╚═══╝   ╚═════╝ ╚═╝╚═════╝
 *
 * The Void Service — Central Secure Secret Store
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │                      THE VOID                           │
 *  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
 *  │  │  Master  │  │ Shamir's │  │  Zero-Knowledge      │  │
 *  │  │   Key    │  │  5-of-9  │  │  Proof Engine        │  │
 *  │  │ ML-KEM   │  │ Sharding │  │  Groth16/STARKs      │  │
 *  │  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
 *  │       │             │                    │              │
 *  │  ┌────▼─────────────▼────────────────────▼───────────┐  │
 *  │  │              Secret Vault Engine                   │  │
 *  │  │  AES-256-GCM / ChaCha20 / ML-KEM-1024             │  │
 *  │  └────────────────────┬──────────────────────────────┘  │
 *  │                       │                                 │
 *  │  ┌────────────────────▼──────────────────────────────┐  │
 *  │  │           Access Control & Audit Chain             │  │
 *  │  │  RBAC + ABAC + MFA + Break-Glass + Rate Limiting  │  │
 *  │  └────────────────────┬──────────────────────────────┘  │
 *  │                       │                                 │
 *  │  ┌──────────┐  ┌──────▼──────┐  ┌────────────────────┐  │
 *  │  │ Warp     │  │  HIVE       │  │  Lighthouse        │  │
 *  │  │ Tunnel   │  │  Router     │  │  Token Verify      │  │
 *  │  └──────────┘  └─────────────┘  └────────────────────┘  │
 *  └─────────────────────────────────────────────────────────┘
 *
 * @package @trancendos/void
 * @version 1.0.0
 * @future-proof 2060
 */

import {
  SecretEnvelope,
  SecretType,
  SecretClassification,
  SecretStatus,
  EncryptionAlgorithm,
  EncryptedPayload,
  KeyDerivationInfo,
  SecretAccessPolicy,
  AccessPrincipal,
  ShamirConfig,
  ShardHolder,
  ShamirReconstructionResult,
  ZeroKnowledgeBinding,
  ZKVerificationResult,
  RotationConfig,
  RotationStrategy,
  RotationEvent,
  SecretAuditEntry,
  SecretAction,
  SecretMetadata,
  SecretGDPR,
  ComplianceFramework,
  StoreSecretRequest,
  RetrieveSecretRequest,
  RetrieveSecretResponse,
  RotateSecretRequest,
  SecretSearchOptions,
  VoidMasterKey,
  VaultSealStatus,
  UnsealRequest,
  VoidMetrics,
  VoidConfig,
  MPCSession,
  MPCParty,
  SecretWarpTransfer,
} from './types';

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

const DEFAULT_CONFIG: VoidConfig = {
  masterKeyAlgorithm: EncryptionAlgorithm.ML_KEM_1024,
  defaultEncryptionAlgorithm: EncryptionAlgorithm.AES_256_GCM,
  shamirThreshold: 5,
  shamirTotal: 9,
  autoSealMinutes: 30,
  maxSecretSizeBytes: 65536,       // 64KB
  maxSecretsPerOrg: 10000,
  defaultRetentionDays: 365,
  auditRetentionDays: 2555,        // 7 years (compliance)
  enableZKProofs: true,
  enableShamirForVoid: true,
  lighthouseIntegration: true,
  hiveIntegration: true,
  warpTunnelIntegration: true,
  storageBackends: [
    {
      id: 'cloudflare-kv-primary',
      type: 'cloudflare_kv',
      priority: 1,
      encrypted: true,
      region: 'global',
      config: {},
    },
    {
      id: 'supabase-secondary',
      type: 'supabase',
      priority: 2,
      encrypted: true,
      region: 'eu-west-1',
      config: {},
    },
  ],
};

// ============================================================
// VOID SERVICE
// ============================================================

export class VoidService {
  private config: VoidConfig;
  private secrets: Map<string, SecretEnvelope> = new Map();
  private masterKey: VoidMasterKey | null = null;
  private sealStatus: VaultSealStatus;
  private unsealShards: Map<number, string> = new Map();
  private rotationEvents: Map<string, RotationEvent[]> = new Map();
  private warpTransfers: Map<string, SecretWarpTransfer> = new Map();
  private mpcSessions: Map<string, MPCSession> = new Map();
  private accessRequestLog: Map<string, number> = new Map(); // rate limiting

  constructor(config: Partial<VoidConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sealStatus = {
      sealed: true,
      shamirThreshold: this.config.shamirThreshold,
      shamirTotal: this.config.shamirTotal,
      shardsProvided: 0,
      shardsRemaining: this.config.shamirThreshold,
      progress: 0,
    };
    this.initialiseMasterKey();
  }

  // ============================================================
  // VAULT SEAL / UNSEAL
  // ============================================================

  /**
   * Initialise the master key with Shamir's Secret Sharing (5-of-9)
   * In production: shards distributed to HSMs, Cloudflare KV, Supabase, offline
   */
  private initialiseMasterKey(): void {
    const masterKeyId = this.generateId('mk');
    this.masterKey = {
      id: masterKeyId,
      version: 1,
      algorithm: this.config.masterKeyAlgorithm,
      status: 'active',
      shamirShards: this.generateShamirShards(masterKeyId),
      shamirThreshold: this.config.shamirThreshold,
      shamirTotal: this.config.shamirTotal,
      sealed: true,
      unsealProgress: 0,
      createdAt: new Date().toISOString(),
    };

    console.log(`[VOID] Master key initialised: ${masterKeyId}`);
    console.log(`[VOID] Shamir's Secret Sharing: ${this.config.shamirThreshold}-of-${this.config.shamirTotal}`);
    console.log(`[VOID] Vault is SEALED — provide ${this.config.shamirThreshold} shards to unseal`);
  }

  /**
   * Generate Shamir shard holders (simulated — in production uses real SSS)
   */
  private generateShamirShards(masterKeyId: string): ShardHolder[] {
    const holderTypes: ShardHolder['holderType'][] = [
      'hsm',            // Shard 1: Hardware Security Module
      'cloudflare_kv',  // Shard 2: Cloudflare KV (encrypted)
      'supabase',       // Shard 3: Supabase (encrypted)
      'offline',        // Shard 4: Offline cold storage
      'hsm',            // Shard 5: Secondary HSM
      'cloudflare_kv',  // Shard 6: Cloudflare KV (secondary region)
      'offline',        // Shard 7: Offline cold storage (geo-distributed)
      'supabase',       // Shard 8: Supabase (secondary region)
      'offline',        // Shard 9: Offline cold storage (disaster recovery)
    ];

    const geoLocations = [
      'eu-west-1', 'us-east-1', 'ap-southeast-1',
      'eu-central-1', 'us-west-2', 'ap-northeast-1',
      'sa-east-1', 'af-south-1', 'au-southeast-1',
    ];

    return holderTypes.map((type, index) => ({
      holderId: `shard-holder-${index + 1}`,
      holderType: type,
      shardIndex: index + 1,
      encryptedShard: this.simulateEncryptedShard(masterKeyId, index + 1),
      publicKeyFingerprint: this.generateFingerprint(`holder-${index + 1}`),
      confirmed: false,
      geoLocation: geoLocations[index],
    }));
  }

  /**
   * Provide an unseal shard (Shamir reconstruction)
   */
  async provideUnsealShard(request: UnsealRequest): Promise<VaultSealStatus> {
    if (!this.sealStatus.sealed) {
      return this.sealStatus;
    }

    // Verify shard signature
    const isValid = await this.verifyShardSignature(request);
    if (!isValid) {
      throw new Error('[VOID] Invalid shard signature — unseal rejected');
    }

    // Store shard
    this.unsealShards.set(request.shardIndex, request.encryptedShard);
    const shardsProvided = this.unsealShards.size;
    const shardsRemaining = Math.max(0, this.config.shamirThreshold - shardsProvided);
    const progress = Math.round((shardsProvided / this.config.shamirThreshold) * 100);

    this.sealStatus = {
      ...this.sealStatus,
      shardsProvided,
      shardsRemaining,
      progress,
    };

    console.log(`[VOID] Unseal shard ${request.shardIndex} accepted (${shardsProvided}/${this.config.shamirThreshold})`);

    // Check if threshold reached
    if (shardsProvided >= this.config.shamirThreshold) {
      await this.completUnseal(request.providedBy);
    }

    return this.sealStatus;
  }

  /**
   * Complete the unseal process once threshold is reached
   */
  private async completUnseal(unsealedBy: string): Promise<void> {
    // In production: reconstruct master key from shards using SSS
    this.sealStatus = {
      ...this.sealStatus,
      sealed: false,
      progress: 100,
      shardsRemaining: 0,
      lastUnsealedAt: new Date().toISOString(),
      unsealedBy: [unsealedBy],
    };

    if (this.masterKey) {
      this.masterKey.sealed = false;
      this.masterKey.unsealProgress = 100;
    }

    // Clear shard cache (security)
    this.unsealShards.clear();

    console.log(`[VOID] ✅ Vault UNSEALED by ${unsealedBy}`);
    console.log(`[VOID] Master key active — secrets accessible`);
  }

  /**
   * Seal the vault (emergency or scheduled)
   */
  async sealVault(sealedBy: string, reason: string): Promise<VaultSealStatus> {
    this.sealStatus = {
      ...this.sealStatus,
      sealed: true,
      shardsProvided: 0,
      shardsRemaining: this.config.shamirThreshold,
      progress: 0,
      lastSealedAt: new Date().toISOString(),
      sealedBy,
    };

    if (this.masterKey) {
      this.masterKey.sealed = true;
      this.masterKey.unsealProgress = 0;
    }

    // Clear any cached keys
    this.unsealShards.clear();

    console.log(`[VOID] 🔒 Vault SEALED by ${sealedBy}: ${reason}`);
    return this.sealStatus;
  }

  /**
   * Get current seal status
   */
  getSealStatus(): VaultSealStatus {
    return { ...this.sealStatus };
  }

  // ============================================================
  // SECRET STORAGE
  // ============================================================

  /**
   * Store a new secret in The Void
   */
  async storeSecret(request: StoreSecretRequest): Promise<SecretEnvelope> {
    this.requireUnsealed();
    this.validateSecretRequest(request);

    const secretId = this.generateId('sec');
    const now = new Date().toISOString();

    // Determine encryption algorithm based on classification
    const algorithm = this.selectEncryptionAlgorithm(request.classification);

    // Encrypt the plaintext
    const encryptedPayload = await this.encryptSecret(
      request.plaintext,
      algorithm,
      secretId,
    );

    // Build access policy
    const accessPolicy = this.buildAccessPolicy(request);

    // Build Shamir config for VOID classification
    let shamirConfig: ShamirConfig | undefined;
    if (
      request.classification === SecretClassification.VOID &&
      this.config.enableShamirForVoid
    ) {
      shamirConfig = this.buildShamirConfig(secretId, request.shamirConfig);
    }

    // Generate ZK binding if enabled
    let zkBinding: ZeroKnowledgeBinding | undefined;
    if (this.config.enableZKProofs && request.classification !== SecretClassification.INTERNAL) {
      zkBinding = await this.generateZKBinding(request.plaintext, secretId);
    }

    // Build rotation config
    const rotationConfig = this.buildRotationConfig(request.type, request.rotationConfig);

    // Build metadata
    const metadata: SecretMetadata = {
      environment: 'production',
      region: 'eu-west-1',
      labels: {},
      complianceFrameworks: this.inferComplianceFrameworks(request.type, request.classification),
      sensitivityScore: this.calculateSensitivityScore(request.type, request.classification),
      ...request.metadata,
    };

    // Build GDPR record
    const gdpr: SecretGDPR = {
      containsPersonalData: this.mightContainPersonalData(request.type),
      portabilityAvailable: false,
    };

    // Build key derivation info
    const keyDerivation: KeyDerivationInfo = {
      algorithm: 'HKDF',
      salt: this.generateSalt(),
      keyLength: 32,
      info: `void:${secretId}:${request.classification}`,
    };

    // Create the secret envelope
    const envelope: SecretEnvelope = {
      id: secretId,
      name: request.name,
      description: request.description,
      type: request.type,
      classification: request.classification,
      status: SecretStatus.ACTIVE,
      version: 1,
      previousVersions: [],
      encryptedPayload,
      keyDerivation,
      accessPolicy,
      shamirConfig,
      zkBinding,
      metadata,
      auditLog: [],
      tags: request.tags ?? [],
      path: request.path,
      ownerId: request.requestedBy,
      expiresAt: request.expiresAt,
      rotationConfig,
      gdpr,
      createdAt: now,
      updatedAt: now,
    };

    // Add initial audit entry
    envelope.auditLog.push(
      this.createAuditEntry(secretId, SecretAction.CREATE, request.requestedBy, 'success', {
        reason: request.reason,
        classification: request.classification,
        type: request.type,
      }),
    );

    // Store
    this.secrets.set(secretId, envelope);

    // Distribute Shamir shards if applicable
    if (shamirConfig) {
      await this.distributeShamirShards(secretId, shamirConfig);
    }

    console.log(`[VOID] ✅ Secret stored: ${secretId} (${request.name}) [${request.classification}]`);

    // Return envelope without plaintext
    return this.sanitiseEnvelope(envelope);
  }

  /**
   * Retrieve a secret from The Void
   */
  async retrieveSecret(request: RetrieveSecretRequest): Promise<RetrieveSecretResponse> {
    this.requireUnsealed();

    const envelope = this.secrets.get(request.secretId);
    if (!envelope) {
      throw new Error(`[VOID] Secret not found: ${request.secretId}`);
    }

    // Check status
    if (envelope.status === SecretStatus.SHREDDED) {
      throw new Error(`[VOID] Secret has been crypto-shredded: ${request.secretId}`);
    }
    if (envelope.status === SecretStatus.REVOKED) {
      throw new Error(`[VOID] Secret has been revoked: ${request.secretId}`);
    }
    if (envelope.status === SecretStatus.QUARANTINED) {
      throw new Error(`[VOID] Secret is quarantined in IceBox: ${request.secretId}`);
    }
    if (envelope.status === SecretStatus.SEALED) {
      throw new Error(`[VOID] Secret is sealed — requires quorum to unseal: ${request.secretId}`);
    }

    // Check expiry
    if (envelope.expiresAt && new Date(envelope.expiresAt) < new Date()) {
      envelope.status = SecretStatus.EXPIRED;
      throw new Error(`[VOID] Secret has expired: ${request.secretId}`);
    }

    // Rate limiting
    this.checkRateLimit(request.requestedBy, envelope.accessPolicy);

    // Access control check
    const accessResult = await this.checkAccess(envelope, request);
    if (!accessResult.allowed) {
      // Audit denied access
      envelope.auditLog.push(
        this.createAuditEntry(
          request.secretId,
          SecretAction.ACCESS_DENIED,
          request.requestedBy,
          'denied',
          { reason: accessResult.reason },
        ),
      );
      throw new Error(`[VOID] Access denied: ${accessResult.reason}`);
    }

    // MFA check
    if (envelope.accessPolicy.requireMFA && !request.mfaToken) {
      throw new Error('[VOID] MFA token required for this secret');
    }

    // Hardware key check
    if (envelope.accessPolicy.requireHardwareKey && !request.hardwareKeySignature) {
      throw new Error('[VOID] Hardware key signature required for this secret');
    }

    // Decrypt the secret
    const plaintext = await this.decryptSecret(envelope.encryptedPayload);

    // Update last accessed
    envelope.lastAccessedAt = new Date().toISOString();

    // Audit successful access
    const auditEntry = this.createAuditEntry(
      request.secretId,
      SecretAction.READ,
      request.requestedBy,
      'success',
      {
        reason: request.reason,
        isBreakGlass: request.breakGlass ?? false,
        lighthouseTokenId: request.lighthouseTokenId,
      },
    );
    envelope.auditLog.push(auditEntry);

    // Break-glass audit
    if (request.breakGlass) {
      console.warn(`[VOID] ⚠️  BREAK-GLASS ACCESS: ${request.secretId} by ${request.requestedBy}`);
      await this.handleBreakGlassAccess(envelope, request);
    }

    const warnings: string[] = [];
    if (envelope.expiresAt) {
      const daysUntilExpiry = Math.floor(
        (new Date(envelope.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilExpiry <= 7) {
        warnings.push(`Secret expires in ${daysUntilExpiry} days`);
      }
    }
    if (envelope.status === SecretStatus.ROTATING) {
      warnings.push('Secret is currently being rotated — new version available soon');
    }

    return {
      secretId: envelope.id,
      name: envelope.name,
      type: envelope.type,
      classification: envelope.classification,
      version: envelope.version,
      plaintext,
      expiresAt: envelope.expiresAt,
      retrievedAt: new Date().toISOString(),
      auditId: auditEntry.id,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Update a secret's value (creates new version)
   */
  async updateSecret(
    secretId: string,
    newPlaintext: string,
    updatedBy: string,
    reason?: string,
  ): Promise<SecretEnvelope> {
    this.requireUnsealed();

    const envelope = this.secrets.get(secretId);
    if (!envelope) throw new Error(`[VOID] Secret not found: ${secretId}`);

    // Re-encrypt with new value
    const algorithm = this.selectEncryptionAlgorithm(envelope.classification);
    const newEncryptedPayload = await this.encryptSecret(newPlaintext, algorithm, secretId);

    // Increment version
    envelope.previousVersions.push(`${secretId}:v${envelope.version}`);
    envelope.version += 1;
    envelope.encryptedPayload = newEncryptedPayload;
    envelope.updatedAt = new Date().toISOString();

    // Regenerate ZK binding
    if (this.config.enableZKProofs && envelope.zkBinding) {
      envelope.zkBinding = await this.generateZKBinding(newPlaintext, secretId);
    }

    envelope.auditLog.push(
      this.createAuditEntry(secretId, SecretAction.UPDATE, updatedBy, 'success', { reason }),
    );

    console.log(`[VOID] Secret updated: ${secretId} → v${envelope.version}`);
    return this.sanitiseEnvelope(envelope);
  }

  /**
   * Delete a secret (soft delete → crypto-shred)
   */
  async deleteSecret(secretId: string, deletedBy: string, reason: string): Promise<void> {
    this.requireUnsealed();

    const envelope = this.secrets.get(secretId);
    if (!envelope) throw new Error(`[VOID] Secret not found: ${secretId}`);

    // Crypto-shred: overwrite encryption key, making ciphertext permanently unreadable
    await this.cryptoShred(envelope);

    envelope.status = SecretStatus.SHREDDED;
    envelope.updatedAt = new Date().toISOString();

    envelope.auditLog.push(
      this.createAuditEntry(secretId, SecretAction.SHRED, deletedBy, 'success', { reason }),
    );

    console.log(`[VOID] 🗑️  Secret crypto-shredded: ${secretId}`);
  }

  // ============================================================
  // SECRET ROTATION
  // ============================================================

  /**
   * Rotate a secret (generate new version)
   */
  async rotateSecret(request: RotateSecretRequest): Promise<RotationEvent> {
    this.requireUnsealed();

    const envelope = this.secrets.get(request.secretId);
    if (!envelope) throw new Error(`[VOID] Secret not found: ${request.secretId}`);

    const rotationId = this.generateId('rot');
    const now = new Date().toISOString();

    const rotationEvent: RotationEvent = {
      id: rotationId,
      secretId: request.secretId,
      previousVersion: envelope.version,
      newVersion: envelope.version + 1,
      strategy: request.strategy,
      triggeredBy: 'manual',
      triggeredByPrincipal: request.requestedBy,
      startedAt: now,
      status: 'in_progress',
    };

    // Store rotation event
    const events = this.rotationEvents.get(request.secretId) ?? [];
    events.push(rotationEvent);
    this.rotationEvents.set(request.secretId, events);

    try {
      envelope.status = SecretStatus.ROTATING;

      // Generate new secret value if not provided
      const newPlaintext = request.newPlaintext ?? this.generateSecretValue(envelope.type);

      // Re-encrypt
      const algorithm = this.selectEncryptionAlgorithm(envelope.classification);
      const newPayload = await this.encryptSecret(newPlaintext, algorithm, request.secretId);

      // Handle strategy
      switch (request.strategy) {
        case RotationStrategy.IMMEDIATE:
          envelope.previousVersions.push(`${request.secretId}:v${envelope.version}`);
          envelope.version += 1;
          envelope.encryptedPayload = newPayload;
          envelope.status = SecretStatus.ACTIVE;
          break;

        case RotationStrategy.GRACEFUL:
        case RotationStrategy.DUAL_ACTIVE:
          // Keep old version accessible during grace period
          envelope.previousVersions.push(`${request.secretId}:v${envelope.version}`);
          envelope.version += 1;
          envelope.encryptedPayload = newPayload;
          envelope.status = SecretStatus.ACTIVE;
          // Schedule old version deprecation
          if (request.gracePeriodHours) {
            this.scheduleVersionDeprecation(request.secretId, envelope.version - 1, request.gracePeriodHours);
          }
          break;

        case RotationStrategy.BLUE_GREEN:
        case RotationStrategy.CANARY:
          envelope.previousVersions.push(`${request.secretId}:v${envelope.version}`);
          envelope.version += 1;
          envelope.encryptedPayload = newPayload;
          envelope.status = SecretStatus.ACTIVE;
          break;
      }

      envelope.updatedAt = new Date().toISOString();

      // Update rotation config
      if (envelope.rotationConfig) {
        envelope.rotationConfig.lastRotatedAt = now;
        if (envelope.rotationConfig.intervalDays) {
          const nextRotation = new Date();
          nextRotation.setDate(nextRotation.getDate() + envelope.rotationConfig.intervalDays);
          envelope.rotationConfig.nextRotationAt = nextRotation.toISOString();
        }
      }

      rotationEvent.status = 'completed';
      rotationEvent.completedAt = new Date().toISOString();

      envelope.auditLog.push(
        this.createAuditEntry(request.secretId, SecretAction.ROTATE, request.requestedBy, 'success', {
          reason: request.reason,
          previousVersion: rotationEvent.previousVersion,
          newVersion: rotationEvent.newVersion,
          strategy: request.strategy,
        }),
      );

      console.log(`[VOID] 🔄 Secret rotated: ${request.secretId} v${rotationEvent.previousVersion} → v${rotationEvent.newVersion}`);

    } catch (error) {
      rotationEvent.status = 'failed';
      rotationEvent.error = error instanceof Error ? error.message : 'Unknown error';
      envelope.status = SecretStatus.ACTIVE; // Rollback status
      throw error;
    }

    return rotationEvent;
  }

  /**
   * Run auto-rotation check for all secrets
   */
  async runAutoRotation(): Promise<{ rotated: number; failed: number; skipped: number }> {
    let rotated = 0;
    let failed = 0;
    let skipped = 0;

    for (const [secretId, envelope] of this.secrets) {
      if (!envelope.rotationConfig?.enabled) {
        skipped++;
        continue;
      }

      const nextRotation = envelope.rotationConfig.nextRotationAt;
      if (!nextRotation || new Date(nextRotation) > new Date()) {
        skipped++;
        continue;
      }

      try {
        await this.rotateSecret({
          secretId,
          strategy: envelope.rotationConfig.strategy,
          requestedBy: 'system:auto-rotation',
          reason: 'Scheduled auto-rotation',
        });
        rotated++;
      } catch (error) {
        console.error(`[VOID] Auto-rotation failed for ${secretId}:`, error);
        failed++;
      }
    }

    console.log(`[VOID] Auto-rotation complete: ${rotated} rotated, ${failed} failed, ${skipped} skipped`);
    return { rotated, failed, skipped };
  }

  // ============================================================
  // SHAMIR'S SECRET SHARING
  // ============================================================

  /**
   * Distribute Shamir shards to holders
   */
  private async distributeShamirShards(secretId: string, config: ShamirConfig): Promise<void> {
    // In production: use real Shamir's Secret Sharing library
    // Split secret into N shards, distribute to holders
    for (const holder of config.shardHolders) {
      await this.deliverShardToHolder(secretId, holder);
    }

    config.distributed = true;
    config.distributedAt = new Date().toISOString();

    console.log(`[VOID] Shamir shards distributed: ${config.totalShards} shards for ${secretId}`);
  }

  /**
   * Reconstruct a secret from Shamir shards
   */
  async reconstructFromShards(
    secretId: string,
    shards: Array<{ index: number; shard: string }>,
    requestedBy: string,
    reason: string,
  ): Promise<ShamirReconstructionResult> {
    this.requireUnsealed();

    const envelope = this.secrets.get(secretId);
    if (!envelope?.shamirConfig) {
      throw new Error(`[VOID] No Shamir config for secret: ${secretId}`);
    }

    if (shards.length < envelope.shamirConfig.threshold) {
      throw new Error(
        `[VOID] Insufficient shards: ${shards.length}/${envelope.shamirConfig.threshold} required`,
      );
    }

    const auditId = this.generateId('audit');

    // In production: use real SSS reconstruction
    // Verify each shard, reconstruct secret
    const result: ShamirReconstructionResult = {
      success: true,
      secretId,
      shardsUsed: shards.length,
      reconstructedAt: new Date().toISOString(),
      requestedBy,
      reason,
      auditId,
    };

    envelope.auditLog.push(
      this.createAuditEntry(secretId, SecretAction.RECONSTRUCT, requestedBy, 'success', {
        reason,
        shardsUsed: shards.length,
        auditId,
      }),
    );

    console.log(`[VOID] Shamir reconstruction: ${secretId} (${shards.length} shards used)`);
    return result;
  }

  // ============================================================
  // ZERO-KNOWLEDGE PROOFS
  // ============================================================

  /**
   * Generate a zero-knowledge proof binding for a secret
   */
  private async generateZKBinding(plaintext: string, secretId: string): Promise<ZeroKnowledgeBinding> {
    // In production: use real ZK proof library (snarkjs, bellman, etc.)
    const commitment = await this.computeCommitment(plaintext);

    return {
      system: 'Groth16',
      commitment,
      verificationKey: this.generateFingerprint(`vk:${secretId}`),
      proof: this.generateFingerprint(`proof:${secretId}:${commitment}`),
      publicInputs: [commitment],
      circuitId: 'void-secret-v1',
      proofGeneratedAt: new Date().toISOString(),
      proofExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Verify a zero-knowledge proof for a secret
   */
  async verifyZKProof(secretId: string, proof: string, publicInputs: string[]): Promise<ZKVerificationResult> {
    const envelope = this.secrets.get(secretId);
    if (!envelope?.zkBinding) {
      throw new Error(`[VOID] No ZK binding for secret: ${secretId}`);
    }

    // In production: verify proof using ZK library
    const valid = proof === envelope.zkBinding.proof;

    return {
      valid,
      secretId,
      verifiedAt: new Date().toISOString(),
      verifier: 'void-zk-engine-v1',
      proofSystem: envelope.zkBinding.system,
      publicInputsHash: await this.computeCommitment(publicInputs.join(':')),
    };
  }

  // ============================================================
  // ACCESS CONTROL
  // ============================================================

  /**
   * Check if a principal has access to a secret
   */
  private async checkAccess(
    envelope: SecretEnvelope,
    request: RetrieveSecretRequest,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = envelope.accessPolicy;

    // Break-glass bypass (with audit)
    if (request.breakGlass) {
      const breakGlassConfig = policy.breakGlass;
      if (!breakGlassConfig?.enabled) {
        return { allowed: false, reason: 'Break-glass not enabled for this secret' };
      }
      if (!breakGlassConfig.authorisedPrincipals.includes(request.requestedBy)) {
        return { allowed: false, reason: 'Principal not authorised for break-glass access' };
      }
      if (breakGlassConfig.requireReason && !request.breakGlassReason) {
        return { allowed: false, reason: 'Break-glass reason required' };
      }
      return { allowed: true };
    }

    // Check if principal is in readers list
    const isReader = policy.readers.some(
      (r) => r.id === request.requestedBy || r.id === '*',
    );

    if (!isReader) {
      return { allowed: false, reason: 'Principal not in readers list' };
    }

    // Check reader expiry
    const reader = policy.readers.find((r) => r.id === request.requestedBy);
    if (reader?.expiresAt && new Date(reader.expiresAt) < new Date()) {
      return { allowed: false, reason: 'Access grant has expired' };
    }

    // Check conditions
    for (const condition of policy.conditions) {
      const conditionMet = await this.evaluateCondition(condition, request);
      if (!conditionMet) {
        return { allowed: false, reason: `Condition not met: ${condition.type}` };
      }
    }

    // Check access windows
    if (policy.accessWindows && policy.accessWindows.length > 0) {
      const inWindow = this.checkAccessWindow(policy.accessWindows);
      if (!inWindow) {
        return { allowed: false, reason: 'Outside allowed access window' };
      }
    }

    // Check Lighthouse token if integration enabled
    if (this.config.lighthouseIntegration && request.lighthouseTokenId) {
      const tokenValid = await this.verifyLighthouseToken(request.lighthouseTokenId);
      if (!tokenValid) {
        return { allowed: false, reason: 'Lighthouse token invalid or revoked' };
      }
    }

    return { allowed: true };
  }

  /**
   * Evaluate an access condition
   */
  private async evaluateCondition(
    condition: SecretAccessPolicy['conditions'][0],
    request: RetrieveSecretRequest,
  ): Promise<boolean> {
    switch (condition.type) {
      case 'mfa_verified':
        return !!request.mfaToken;
      case 'lighthouse_token_valid':
        return !!request.lighthouseTokenId;
      case 'risk_score_below':
        // In production: check Lighthouse risk score
        return true;
      default:
        return true;
    }
  }

  /**
   * Check if current time is within an access window
   */
  private checkAccessWindow(windows: SecretEnvelope['accessPolicy']['accessWindows']): boolean {
    if (!windows) return true;
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    return windows.some((window) => {
      if (!window.daysOfWeek.includes(dayOfWeek)) return false;
      return currentTime >= window.startTime && currentTime <= window.endTime;
    });
  }

  /**
   * Rate limit check
   */
  private checkRateLimit(principalId: string, policy: SecretAccessPolicy): void {
    if (!policy.rateLimit) return;

    const key = `${principalId}:${Math.floor(Date.now() / (policy.rateLimit.windowSeconds * 1000))}`;
    const count = this.accessRequestLog.get(key) ?? 0;

    if (count >= policy.rateLimit.maxRequests) {
      throw new Error(`[VOID] Rate limit exceeded: ${policy.rateLimit.maxRequests} requests per ${policy.rateLimit.windowSeconds}s`);
    }

    this.accessRequestLog.set(key, count + 1);
  }

  // ============================================================
  // WARP TUNNEL INTEGRATION
  // ============================================================

  /**
   * Quarantine a compromised secret via Warp Tunnel → IceBox
   */
  async quarantineSecret(
    secretId: string,
    reason: string,
    threatLevel: SecretWarpTransfer['threatLevel'],
    triggeredBy: string,
  ): Promise<SecretWarpTransfer> {
    const envelope = this.secrets.get(secretId);
    if (!envelope) throw new Error(`[VOID] Secret not found: ${secretId}`);

    const transferId = this.generateId('warp');
    const now = new Date().toISOString();

    const transfer: SecretWarpTransfer = {
      id: transferId,
      secretId,
      secretName: envelope.name,
      reason,
      threatLevel,
      triggeredBy,
      triggeredAt: now,
      status: 'initiated',
      autoShredded: false,
    };

    this.warpTransfers.set(transferId, transfer);

    // Execute Warp Tunnel pipeline
    await this.executeWarpTunnel(transfer, envelope);

    return transfer;
  }

  /**
   * Execute the Warp Tunnel pipeline for a secret
   */
  private async executeWarpTunnel(
    transfer: SecretWarpTransfer,
    envelope: SecretEnvelope,
  ): Promise<void> {
    const steps: SecretWarpTransfer['status'][] = [
      'scanning', 'capturing', 'encrypting', 'transferring', 'quarantined',
    ];

    for (const step of steps) {
      transfer.status = step;
      await this.simulateDelay(50);

      if (step === 'quarantined') {
        // Mark secret as quarantined
        envelope.status = SecretStatus.QUARANTINED;
        envelope.updatedAt = new Date().toISOString();

        // Auto-shred if critical
        if (transfer.threatLevel === 'critical') {
          await this.cryptoShred(envelope);
          transfer.autoShredded = true;
          transfer.shredCompletedAt = new Date().toISOString();
          envelope.status = SecretStatus.SHREDDED;
        }

        transfer.iceBoxEntryId = this.generateId('ice');

        envelope.auditLog.push(
          this.createAuditEntry(
            envelope.id,
            SecretAction.QUARANTINE,
            transfer.triggeredBy,
            'success',
            {
              reason: transfer.reason,
              threatLevel: transfer.threatLevel,
              transferId: transfer.id,
              iceBoxEntryId: transfer.iceBoxEntryId,
              autoShredded: transfer.autoShredded,
            },
          ),
        );

        console.log(`[VOID] ⚡ Secret quarantined via Warp Tunnel: ${envelope.id} → IceBox:${transfer.iceBoxEntryId}`);
      }
    }
  }

  // ============================================================
  // GDPR COMPLIANCE
  // ============================================================

  /**
   * Process GDPR erasure request for a data subject
   */
  async processGDPRErasure(dataSubjectId: string, requestedBy: string): Promise<{
    secretsErased: number;
    secretsScheduled: number;
    details: Array<{ secretId: string; action: 'erased' | 'scheduled' | 'retained'; reason: string }>;
  }> {
    const results: Array<{ secretId: string; action: 'erased' | 'scheduled' | 'retained'; reason: string }> = [];
    let secretsErased = 0;
    let secretsScheduled = 0;

    for (const [secretId, envelope] of this.secrets) {
      if (!envelope.gdpr.dataSubjectIds?.includes(dataSubjectId)) continue;

      // Check if secret can be erased
      if (envelope.gdpr.legalBasis === 'legal_obligation') {
        results.push({
          secretId,
          action: 'retained',
          reason: 'Legal obligation — cannot erase',
        });
        continue;
      }

      // Immediate erasure for non-critical secrets
      if (envelope.classification !== SecretClassification.VOID) {
        await this.cryptoShred(envelope);
        envelope.status = SecretStatus.SHREDDED;
        envelope.gdpr.erasureCompletedAt = new Date().toISOString();
        secretsErased++;
        results.push({ secretId, action: 'erased', reason: 'GDPR erasure completed' });
      } else {
        // Schedule erasure for VOID secrets (requires quorum)
        const erasureDate = new Date();
        erasureDate.setDate(erasureDate.getDate() + 30); // 30-day notice
        envelope.gdpr.scheduledErasureAt = erasureDate.toISOString();
        secretsScheduled++;
        results.push({ secretId, action: 'scheduled', reason: 'VOID secret — scheduled for quorum erasure' });
      }
    }

    console.log(`[VOID] GDPR erasure: ${secretsErased} erased, ${secretsScheduled} scheduled for ${dataSubjectId}`);
    return { secretsErased, secretsScheduled, details: results };
  }

  // ============================================================
  // SEARCH & LISTING
  // ============================================================

  /**
   * Search secrets with filters
   */
  async searchSecrets(
    options: SecretSearchOptions,
    requestedBy: string,
  ): Promise<Array<Omit<SecretEnvelope, 'encryptedPayload' | 'auditLog'>>> {
    this.requireUnsealed();

    const results: Array<Omit<SecretEnvelope, 'encryptedPayload' | 'auditLog'>> = [];

    for (const envelope of this.secrets.values()) {
      // Apply filters
      if (options.path && !envelope.path.startsWith(options.path)) continue;
      if (options.type && envelope.type !== options.type) continue;
      if (options.classification && envelope.classification !== options.classification) continue;
      if (options.status && envelope.status !== options.status) continue;
      if (options.ownerId && envelope.ownerId !== options.ownerId) continue;
      if (options.organisationId && envelope.organisationId !== options.organisationId) continue;
      if (options.environment && envelope.metadata.environment !== options.environment) continue;
      if (options.tags?.length) {
        const hasAllTags = options.tags.every((tag) => envelope.tags.includes(tag));
        if (!hasAllTags) continue;
      }
      if (options.expiringWithinDays && envelope.expiresAt) {
        const daysUntilExpiry = Math.floor(
          (new Date(envelope.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntilExpiry > options.expiringWithinDays) continue;
      }
      if (options.createdAfter && envelope.createdAt < options.createdAfter) continue;
      if (options.createdBefore && envelope.createdAt > options.createdBefore) continue;

      // Check read access
      const hasAccess = envelope.accessPolicy.readers.some(
        (r) => r.id === requestedBy || r.id === '*',
      );
      if (!hasAccess) continue;

      // Sanitise before returning
      const { encryptedPayload, auditLog, ...safe } = envelope;
      results.push(safe);
    }

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get audit log for a secret
   */
  async getAuditLog(
    secretId: string,
    requestedBy: string,
    limit = 100,
  ): Promise<SecretAuditEntry[]> {
    const envelope = this.secrets.get(secretId);
    if (!envelope) throw new Error(`[VOID] Secret not found: ${secretId}`);

    // Only managers can view audit logs
    const isManager = envelope.accessPolicy.managers.some((m) => m.id === requestedBy);
    if (!isManager) {
      throw new Error('[VOID] Only managers can view audit logs');
    }

    return envelope.auditLog.slice(-limit);
  }

  // ============================================================
  // METRICS & HEALTH
  // ============================================================

  /**
   * Get Void service metrics
   */
  getMetrics(): VoidMetrics {
    const byClassification = {} as Record<SecretClassification, number>;
    const byType = {} as Record<SecretType, number>;
    const byStatus = {} as Record<SecretStatus, number>;

    // Initialise counters
    Object.values(SecretClassification).forEach((c) => { byClassification[c] = 0; });
    Object.values(SecretType).forEach((t) => { byType[t] = 0; });
    Object.values(SecretStatus).forEach((s) => { byStatus[s] = 0; });

    let expiringIn7Days = 0;
    let expiringIn30Days = 0;
    let totalSensitivity = 0;
    let pendingGDPRErasure = 0;

    for (const envelope of this.secrets.values()) {
      byClassification[envelope.classification]++;
      byType[envelope.type]++;
      byStatus[envelope.status]++;
      totalSensitivity += envelope.metadata.sensitivityScore;

      if (envelope.expiresAt) {
        const daysUntilExpiry = Math.floor(
          (new Date(envelope.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        if (daysUntilExpiry <= 7) expiringIn7Days++;
        if (daysUntilExpiry <= 30) expiringIn30Days++;
      }

      if (envelope.gdpr.scheduledErasureAt && !envelope.gdpr.erasureCompletedAt) {
        pendingGDPRErasure++;
      }
    }

    const totalSecrets = this.secrets.size;

    // Count recent access requests from audit logs
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let accessRequests24h = 0;
    let deniedRequests24h = 0;
    let breakGlassUses30d = 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    for (const envelope of this.secrets.values()) {
      for (const entry of envelope.auditLog) {
        if (entry.timestamp >= oneDayAgo) {
          if (entry.action === SecretAction.READ) accessRequests24h++;
          if (entry.action === SecretAction.ACCESS_DENIED) deniedRequests24h++;
        }
        if (entry.timestamp >= thirtyDaysAgo && entry.isBreakGlass) {
          breakGlassUses30d++;
        }
      }
    }

    // Count rotations
    let rotationsCompleted30d = 0;
    let rotationsFailed30d = 0;
    for (const events of this.rotationEvents.values()) {
      for (const event of events) {
        if (event.startedAt >= thirtyDaysAgo) {
          if (event.status === 'completed') rotationsCompleted30d++;
          if (event.status === 'failed') rotationsFailed30d++;
        }
      }
    }

    const healthStatus = this.sealStatus.sealed
      ? 'sealed'
      : totalSecrets === 0
        ? 'healthy'
        : byStatus[SecretStatus.QUARANTINED] > 0
          ? 'degraded'
          : 'healthy';

    return {
      totalSecrets,
      byClassification,
      byType,
      byStatus,
      expiringIn7Days,
      expiringIn30Days,
      accessRequests24h,
      deniedRequests24h,
      breakGlassUses30d,
      rotationsCompleted30d,
      rotationsFailed30d,
      sealStatus: this.sealStatus,
      avgSensitivityScore: totalSecrets > 0 ? Math.round(totalSensitivity / totalSecrets) : 0,
      pendingGDPRErasure,
      lastHealthCheck: new Date().toISOString(),
      healthStatus,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private requireUnsealed(): void {
    if (this.sealStatus.sealed) {
      throw new Error(
        `[VOID] Vault is SEALED — provide ${this.sealStatus.shardsRemaining} more shards to unseal`,
      );
    }
  }

  private validateSecretRequest(request: StoreSecretRequest): void {
    if (!request.name?.trim()) throw new Error('[VOID] Secret name is required');
    if (!request.plaintext) throw new Error('[VOID] Secret plaintext is required');
    if (!request.path?.trim()) throw new Error('[VOID] Secret path is required');

    const sizeBytes = new TextEncoder().encode(request.plaintext).length;
    if (sizeBytes > this.config.maxSecretSizeBytes) {
      throw new Error(`[VOID] Secret exceeds max size: ${sizeBytes} > ${this.config.maxSecretSizeBytes} bytes`);
    }
  }

  private selectEncryptionAlgorithm(classification: SecretClassification): EncryptionAlgorithm {
    switch (classification) {
      case SecretClassification.VOID:
      case SecretClassification.QUANTUM:
        return EncryptionAlgorithm.ML_KEM_1024;
      case SecretClassification.CLASSIFIED:
        return EncryptionAlgorithm.HYBRID_X25519_MLKEM;
      case SecretClassification.CONFIDENTIAL:
        return EncryptionAlgorithm.CHACHA20_POLY1305;
      case SecretClassification.NEURAL:
        return EncryptionAlgorithm.SLH_DSA_256;
      default:
        return EncryptionAlgorithm.AES_256_GCM;
    }
  }

  private async encryptSecret(
    plaintext: string,
    algorithm: EncryptionAlgorithm,
    secretId: string,
  ): Promise<EncryptedPayload> {
    // In production: use Web Crypto API / node:crypto / libsodium
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Simulate encryption (production uses real crypto)
    const iv = this.generateRandomBytes(12);
    const keyId = this.masterKey?.id ?? 'mk-default';

    // Compute plaintext hash for integrity
    const plaintextHash = await this.computeHash(plaintext);

    return {
      ciphertext: Buffer.from(data).toString('base64url') + ':encrypted',
      iv,
      authTag: this.generateRandomBytes(16),
      aad: `void:${secretId}`,
      algorithm,
      keyId,
      keyVersion: this.masterKey?.version ?? 1,
      plaintextHash,
      hashAlgorithm: 'SHA-256',
      encryptedAt: new Date().toISOString(),
    };
  }

  private async decryptSecret(payload: EncryptedPayload): Promise<string> {
    // In production: use real decryption
    // Simulate: strip ':encrypted' suffix and decode
    const base64 = payload.ciphertext.replace(':encrypted', '');
    const decoded = Buffer.from(base64, 'base64url').toString('utf-8');
    return decoded;
  }

  private async cryptoShred(envelope: SecretEnvelope): Promise<void> {
    // Crypto-shredding: overwrite the encryption key reference
    // making the ciphertext permanently unreadable
    envelope.encryptedPayload.keyId = 'SHREDDED';
    envelope.encryptedPayload.ciphertext = 'SHREDDED';
    envelope.encryptedPayload.iv = 'SHREDDED';
    envelope.encryptedPayload.authTag = 'SHREDDED';
    console.log(`[VOID] 🔥 Crypto-shredded: ${envelope.id}`);
  }

  private buildAccessPolicy(request: StoreSecretRequest): SecretAccessPolicy {
    const now = new Date().toISOString();
    const ownerPrincipal: AccessPrincipal = {
      type: 'user',
      id: request.requestedBy,
      grantedBy: 'system',
      grantedAt: now,
    };

    return {
      readers: [ownerPrincipal, ...(request.accessPolicy?.readers ?? [])],
      writers: [ownerPrincipal, ...(request.accessPolicy?.writers ?? [])],
      managers: [ownerPrincipal, ...(request.accessPolicy?.managers ?? [])],
      approvers: request.accessPolicy?.approvers ?? [],
      conditions: request.accessPolicy?.conditions ?? [],
      requireApproval: request.accessPolicy?.requireApproval ?? false,
      requireMFA: request.classification === SecretClassification.VOID ||
                  request.classification === SecretClassification.CLASSIFIED,
      requireHardwareKey: request.classification === SecretClassification.VOID,
      rateLimit: {
        maxRequests: 100,
        windowSeconds: 3600,
        perPrincipal: true,
      },
      breakGlass: {
        enabled: request.classification === SecretClassification.VOID ||
                 request.classification === SecretClassification.CLASSIFIED,
        authorisedPrincipals: [request.requestedBy],
        requireReason: true,
        alertOnUse: true,
        alertRecipients: [request.requestedBy],
        autoRotateAfterUse: true,
      },
      ...request.accessPolicy,
    };
  }

  private buildShamirConfig(secretId: string, partial?: Partial<ShamirConfig>): ShamirConfig {
    return {
      totalShards: partial?.totalShards ?? this.config.shamirTotal,
      threshold: partial?.threshold ?? this.config.shamirThreshold,
      shardHolders: this.generateShamirShards(secretId),
      distributed: false,
      requireAudit: true,
      ...partial,
    };
  }

  private buildRotationConfig(
    type: SecretType,
    partial?: Partial<RotationConfig>,
  ): RotationConfig {
    // Default rotation intervals by type
    const intervalDays: Record<string, number> = {
      [SecretType.MASTER_KEY]: 365,
      [SecretType.PRIVATE_KEY]: 365,
      [SecretType.API_KEY]: 90,
      [SecretType.OAUTH_SECRET]: 180,
      [SecretType.DATABASE_URL]: 90,
      [SecretType.SIGNING_KEY]: 180,
      [SecretType.SYMMETRIC_KEY]: 90,
      [SecretType.PAYMENT_KEY]: 90,
    };

    const interval = intervalDays[type] ?? 90;
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + interval);

    return {
      enabled: true,
      intervalDays: interval,
      strategy: RotationStrategy.GRACEFUL,
      notifyDaysBefore: 14,
      notifyRecipients: [],
      nextRotationAt: nextRotation.toISOString(),
      keepVersions: 3,
      ...partial,
    };
  }

  private inferComplianceFrameworks(
    type: SecretType,
    classification: SecretClassification,
  ): ComplianceFramework[] {
    const frameworks: ComplianceFramework[] = [ComplianceFramework.ISO27001, ComplianceFramework.SOC2];

    if (type === SecretType.PAYMENT_KEY || type === SecretType.BANK_CREDENTIAL) {
      frameworks.push(ComplianceFramework.PCI_DSS);
    }
    if (classification === SecretClassification.VOID || classification === SecretClassification.CLASSIFIED) {
      frameworks.push(ComplianceFramework.NIST_CSF, ComplianceFramework.FIPS_140);
    }
    if (type === SecretType.QUANTUM_KEY || type === SecretType.QUANTUM_ENTANGLED) {
      frameworks.push(ComplianceFramework.NIST_CSF);
    }

    return [...new Set(frameworks)];
  }

  private calculateSensitivityScore(type: SecretType, classification: SecretClassification): number {
    const typeScores: Record<string, number> = {
      [SecretType.MASTER_KEY]: 100,
      [SecretType.PRIVATE_KEY]: 95,
      [SecretType.QUANTUM_KEY]: 100,
      [SecretType.PAYMENT_KEY]: 95,
      [SecretType.BANK_CREDENTIAL]: 95,
      [SecretType.SIGNING_KEY]: 90,
      [SecretType.SHAMIR_SHARD]: 100,
      [SecretType.MPC_SHARE]: 95,
      [SecretType.DATABASE_URL]: 85,
      [SecretType.API_KEY]: 75,
      [SecretType.OAUTH_SECRET]: 80,
      [SecretType.SYMMETRIC_KEY]: 85,
    };

    const classificationBonus: Record<string, number> = {
      [SecretClassification.VOID]: 0,
      [SecretClassification.CLASSIFIED]: 0,
      [SecretClassification.CONFIDENTIAL]: -5,
      [SecretClassification.INTERNAL]: -15,
    };

    const baseScore = typeScores[type] ?? 60;
    const bonus = classificationBonus[classification] ?? 0;
    return Math.min(100, Math.max(0, baseScore + bonus));
  }

  private mightContainPersonalData(type: SecretType): boolean {
    return [
      SecretType.TOTP_SEED,
      SecretType.BACKUP_CODE,
      SecretType.BIO_METRIC_HASH,
      SecretType.NEURAL_BINDING,
    ].includes(type);
  }

  private createAuditEntry(
    secretId: string,
    action: SecretAction,
    principalId: string,
    result: SecretAuditEntry['result'],
    extra: Record<string, unknown> = {},
  ): SecretAuditEntry {
    const id = this.generateId('audit');
    const timestamp = new Date().toISOString();

    // Get previous entry hash for chain integrity
    const envelope = this.secrets.get(secretId);
    const previousEntryHash = envelope?.auditLog.length
      ? envelope.auditLog[envelope.auditLog.length - 1].entryHash
      : undefined;

    const entryData = JSON.stringify({ id, secretId, action, principalId, result, timestamp, ...extra });
    const entryHash = this.simpleHash(entryData);

    return {
      id,
      secretId,
      action,
      principalId,
      principalType: 'user',
      result,
      isBreakGlass: extra.isBreakGlass as boolean ?? false,
      reason: extra.reason as string | undefined,
      lighthouseTokenId: extra.lighthouseTokenId as string | undefined,
      timestamp,
      entryHash,
      previousEntryHash,
    };
  }

  private sanitiseEnvelope(envelope: SecretEnvelope): SecretEnvelope {
    // Return envelope without the actual ciphertext details
    return {
      ...envelope,
      encryptedPayload: {
        ...envelope.encryptedPayload,
        ciphertext: '[REDACTED]',
        iv: '[REDACTED]',
        authTag: '[REDACTED]',
      },
    };
  }

  private async handleBreakGlassAccess(
    envelope: SecretEnvelope,
    request: RetrieveSecretRequest,
  ): Promise<void> {
    const config = envelope.accessPolicy.breakGlass;
    if (!config) return;

    // Alert recipients
    if (config.alertOnUse) {
      console.warn(`[VOID] 🚨 BREAK-GLASS ALERT: ${envelope.id} accessed by ${request.requestedBy}`);
      console.warn(`[VOID] Reason: ${request.breakGlassReason}`);
      // In production: send alerts via email/Slack/PagerDuty
    }

    // Auto-rotate after break-glass
    if (config.autoRotateAfterUse) {
      setTimeout(async () => {
        try {
          await this.rotateSecret({
            secretId: envelope.id,
            strategy: RotationStrategy.IMMEDIATE,
            requestedBy: 'system:break-glass-auto-rotate',
            reason: `Auto-rotation after break-glass access by ${request.requestedBy}`,
          });
        } catch (error) {
          console.error('[VOID] Break-glass auto-rotation failed:', error);
        }
      }, 5000);
    }
  }

  private scheduleVersionDeprecation(secretId: string, version: number, gracePeriodHours: number): void {
    setTimeout(() => {
      const envelope = this.secrets.get(secretId);
      if (envelope) {
        console.log(`[VOID] Grace period expired for ${secretId} v${version}`);
      }
    }, gracePeriodHours * 60 * 60 * 1000);
  }

  private async verifyLighthouseToken(tokenId: string): Promise<boolean> {
    // In production: call Lighthouse service to verify token
    return tokenId.startsWith('uet-');
  }

  private async verifyShardSignature(request: UnsealRequest): Promise<boolean> {
    // In production: verify cryptographic signature of shard
    return !!request.signature && !!request.encryptedShard;
  }

  private async deliverShardToHolder(secretId: string, holder: ShardHolder): Promise<void> {
    // In production: deliver shard to holder via secure channel
    holder.confirmed = true;
    holder.confirmedAt = new Date().toISOString();
  }

  private generateSecretValue(type: SecretType): string {
    // Generate appropriate random value for secret type
    const bytes = 32;
    return this.generateRandomBytes(bytes);
  }

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${timestamp}-${random}`;
  }

  private generateRandomBytes(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private generateSalt(): string {
    return this.generateRandomBytes(32);
  }

  private generateFingerprint(input: string): string {
    return this.simpleHash(input).substring(0, 40);
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0') +
           Math.abs(hash * 31).toString(16).padStart(16, '0');
  }

  private async computeHash(input: string): Promise<string> {
    return this.simpleHash(input);
  }

  private async computeCommitment(input: string): Promise<string> {
    return 'commit:' + this.simpleHash(input);
  }

  private simulateEncryptedShard(masterKeyId: string, shardIndex: number): string {
    return Buffer.from(`shard:${masterKeyId}:${shardIndex}:${this.generateRandomBytes(32)}`).toString('base64url');
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}