/**
 * @trancendos/void
 * The Void — Central Secure Secret Store
 * Zero-Knowledge | Shamir's Secret Sharing | Post-Quantum Cryptography
 */

export { VoidService } from './VoidService';

export {
  // Enums
  SecretClassification,
  SecretType,
  SecretStatus,
  EncryptionAlgorithm,
  RotationStrategy,
  SecretAction,
  ComplianceFramework,

  // Core interfaces
  SecretEnvelope,
  EncryptedPayload,
  KeyDerivationInfo,

  // Access Control
  SecretAccessPolicy,
  AccessPrincipal,
  AccessCondition,
  AccessWindow,
  AccessRateLimit,
  BreakGlassConfig,

  // Shamir's Secret Sharing
  ShamirConfig,
  ShardHolder,
  ShamirReconstructionResult,

  // Zero-Knowledge Proofs
  ZeroKnowledgeBinding,
  ZKVerificationResult,

  // Rotation
  RotationConfig,
  RotationEvent,

  // Audit
  SecretAuditEntry,
  SecretMetadata,
  SecretGDPR,

  // Operations
  StoreSecretRequest,
  RetrieveSecretRequest,
  RetrieveSecretResponse,
  RotateSecretRequest,
  SecretSearchOptions,

  // Vault
  VoidMasterKey,
  VaultSealStatus,
  UnsealRequest,

  // Metrics
  VoidMetrics,
  VoidConfig,
  StorageBackend,

  // MPC
  MPCSession,
  MPCParty,

  // Warp Tunnel
  SecretWarpTransfer,
} from './types';