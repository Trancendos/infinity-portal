/**
 * @trancendos/infinity-one
 * Infinity-One — Central Account Management Hub
 * IAM | RBAC | ABAC | OAuth 2.1 | OIDC | WebAuthn | SCIM 2.0
 */

export { InfinityOneService } from './InfinityOneService';

export {
  // Core User
  InfinityOneUser,
  UserProfile,
  SocialLinks,
  ContactInfo,
  EmailAddress,
  PhoneNumber,
  PostalAddress,

  // Enums
  Gender,
  UserStatus,
  VerificationLevel,
  RiskLevel,

  // Security
  SecurityProfile,
  MFAMethod,
  MFAType,
  WebAuthnCredential,
  Session,
  TrustedDevice,
  GeoLocation,
  LoginAttempt,
  SecurityEvent,
  SecurityEventType,
  RecoveryMethod,
  BiometricProfile,

  // IAM
  IAMPolicy,
  PolicyStatement,
  PolicyEffect,
  PolicyCondition,
  ConditionOperator,

  // RBAC
  Role,
  RoleType,
  Permission,
  PermissionScope,
  RoleConstraint,
  ConstraintType,

  // Groups
  Group,
  GroupType,
  GroupMember,

  // Applications & Access
  AppAccess,
  Application,
  ApplicationType,
  OAuthScope,
  AccessProfile,
  AccessRestriction,
  RestrictionType,
  TemporalAccess,
  EmergencyAccess,

  // Compliance
  ComplianceProfile,
  ConsentRecord,
  ConsentType,
  AuditEntry,
  UserCertification,

  // Preferences
  UserPreferences,
  NotificationPreferences,
  PrivacyPreferences,
  AccessibilityPreferences,
  InterfacePreferences,

  // Metadata
  UserMetadata,

  // Admin
  AdminAction,
  AdminActionType,
  BulkOperation,
} from './types';