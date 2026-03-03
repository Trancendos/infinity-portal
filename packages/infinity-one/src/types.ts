/**
 * Infinity-One Universal Account Hub - Type Definitions
 * Central identity, IAM, RBAC, and profile management platform
 * 2060 future-proof with quantum-safe, BCI-ready, and ambient computing support
 */

// ============================================================================
// Core User Identity Types
// ============================================================================

export interface InfinityOneUser {
  id: string;                        // UUID v7
  did: string;                       // W3C Decentralised Identifier
  lighthouseToken: string;           // Cryptographic token from Lighthouse
  hiveNodeId: string;                // HIVE routing node assignment
  voidKeyId?: string;                // Void secret key reference
  profile: UserProfile;
  contact: ContactInfo;
  security: SecurityProfile;
  access: AccessProfile;
  compliance: ComplianceProfile;
  preferences: UserPreferences;
  metadata: UserMetadata;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  lastActiveAt?: Date;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  middleName?: string;
  displayName: string;
  username: string;
  photo?: string;                    // R2 storage URL
  photoThumbnail?: string;
  coverPhoto?: string;
  bio?: string;
  dateOfBirth?: Date;
  gender: Gender;
  pronouns?: string;
  nationality?: string;
  languages: string[];               // ISO 639-1 codes
  occupation?: string;
  organisation?: string;
  website?: string;
  socialLinks?: SocialLinks;
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non_binary',
  GENDERFLUID = 'genderfluid',
  AGENDER = 'agender',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
  OTHER = 'other'
}

export interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  github?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  custom?: Record<string, string>;
}

export interface ContactInfo {
  email: string;                     // Primary (verified)
  emailVerified: boolean;
  emailAlt: EmailAddress[];
  phone?: string;                    // E.164 format
  phoneVerified: boolean;
  phoneAlt: PhoneNumber[];
  address?: PostalAddress;
  addressAlt?: PostalAddress[];
  timezone: string;                  // IANA timezone
  locale: string;                    // BCP 47 language tag
}

export interface EmailAddress {
  address: string;
  verified: boolean;
  primary: boolean;
  label?: string;
  addedAt: Date;
}

export interface PhoneNumber {
  number: string;                    // E.164 format
  verified: boolean;
  primary: boolean;
  type: 'mobile' | 'home' | 'work' | 'other';
  label?: string;
  addedAt: Date;
}

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;                   // ISO 3166-1 alpha-2
  type: 'home' | 'work' | 'billing' | 'shipping' | 'other';
  verified: boolean;
  primary: boolean;
}

// ============================================================================
// Security Profile Types
// ============================================================================

export interface SecurityProfile {
  passwordHash?: string;             // Argon2id hash
  passwordChangedAt?: Date;
  mfaEnabled: boolean;
  mfaMethods: MFAMethod[];
  webauthnCredentials: WebAuthnCredential[];
  activeSessions: Session[];
  trustedDevices: TrustedDevice[];
  securityScore: number;             // 0-100
  riskLevel: RiskLevel;
  loginAttempts: LoginAttempt[];
  securityEvents: SecurityEvent[];
  recoveryMethods: RecoveryMethod[];
  biometrics?: BiometricProfile;
  quantumKeyId?: string;             // PQC key reference
}

export enum RiskLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface MFAMethod {
  id: string;
  type: MFAType;
  name: string;
  enabled: boolean;
  primary: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  metadata: Record<string, unknown>;
}

export enum MFAType {
  TOTP = 'totp',                     // Time-based OTP (Google Authenticator)
  WEBAUTHN = 'webauthn',             // Hardware key / passkey
  SMS = 'sms',                       // SMS OTP
  EMAIL = 'email',                   // Email OTP
  BACKUP_CODES = 'backup_codes',     // One-time backup codes
  PUSH = 'push',                     // Push notification
  BIOMETRIC = 'biometric',           // Fingerprint / face
  VOICE = 'voice',                   // Voice recognition
  NEURAL = 'neural'                  // BCI-based (2060)
}

export interface WebAuthnCredential {
  id: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: 'platform' | 'cross-platform';
  backedUp: boolean;
  transports: string[];
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  aaguid: string;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  location?: GeoLocation;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
  riskScore: number;
  mfaVerified: boolean;
  scopes: string[];
  applicationId?: string;
}

export interface TrustedDevice {
  id: string;
  name: string;
  fingerprint: string;
  platform: string;
  browser?: string;
  ipAddress: string;
  location?: GeoLocation;
  trustedAt: Date;
  expiresAt?: Date;
  lastSeenAt: Date;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface LoginAttempt {
  id: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  mfaUsed?: MFAType;
  location?: GeoLocation;
  riskScore: number;
}

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  timestamp: Date;
  ipAddress?: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: Date;
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  PASSWORD_CHANGED = 'password_changed',
  SUSPICIOUS_LOGIN = 'suspicious_login',
  IMPOSSIBLE_TRAVEL = 'impossible_travel',
  BRUTE_FORCE = 'brute_force',
  ACCOUNT_LOCKED = 'account_locked',
  PERMISSION_ESCALATION = 'permission_escalation',
  DATA_EXPORT = 'data_export',
  LIGHTHOUSE_ALERT = 'lighthouse_alert',
  WARP_TUNNEL_TRIGGERED = 'warp_tunnel_triggered'
}

export interface RecoveryMethod {
  id: string;
  type: 'email' | 'phone' | 'backup_codes' | 'trusted_contact' | 'identity_verification';
  value: string;                     // Masked value
  verified: boolean;
  addedAt: Date;
}

export interface BiometricProfile {
  fingerprintEnrolled: boolean;
  faceEnrolled: boolean;
  voiceEnrolled: boolean;
  irisEnrolled: boolean;
  neuralPatternEnrolled: boolean;    // BCI (2060)
  lastUpdated: Date;
}

// ============================================================================
// IAM Types
// ============================================================================

export interface IAMPolicy {
  id: string;
  name: string;
  description: string;
  version: string;
  statements: PolicyStatement[];
  conditions: PolicyCondition[];
  effect: PolicyEffect;
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface PolicyStatement {
  sid: string;
  effect: PolicyEffect;
  principals: string[];              // User IDs, role IDs, or '*'
  actions: string[];                 // e.g., 'infinity:read', 'vault:write'
  resources: string[];               // Resource ARNs or '*'
  conditions?: PolicyCondition[];
}

export enum PolicyEffect {
  ALLOW = 'allow',
  DENY = 'deny'
}

export interface PolicyCondition {
  operator: ConditionOperator;
  key: string;
  values: string[];
}

export enum ConditionOperator {
  STRING_EQUALS = 'StringEquals',
  STRING_NOT_EQUALS = 'StringNotEquals',
  STRING_LIKE = 'StringLike',
  IP_ADDRESS = 'IpAddress',
  NOT_IP_ADDRESS = 'NotIpAddress',
  DATE_GREATER_THAN = 'DateGreaterThan',
  DATE_LESS_THAN = 'DateLessThan',
  BOOL = 'Bool',
  NULL = 'Null',
  MFA_PRESENT = 'MfaPresent',
  RISK_SCORE_LESS_THAN = 'RiskScoreLessThan'
}

// ============================================================================
// RBAC Types
// ============================================================================

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: RoleType;
  level: number;                     // Hierarchy level (0 = highest)
  permissions: Permission[];
  inheritedRoles: string[];          // Parent role IDs
  policies: IAMPolicy[];
  constraints: RoleConstraint[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export enum RoleType {
  SYSTEM = 'system',                 // Built-in system roles
  ORGANISATION = 'organisation',     // Org-level roles
  APPLICATION = 'application',       // App-specific roles
  CUSTOM = 'custom',                 // User-defined roles
  TEMPORAL = 'temporal',             // Time-limited roles
  EMERGENCY = 'emergency'            // Break-glass access
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description: string;
  resource: string;                  // Resource type
  action: string;                    // Action type
  scope: PermissionScope;
  conditions?: PolicyCondition[];
  riskLevel: RiskLevel;
}

export enum PermissionScope {
  GLOBAL = 'global',
  ORGANISATION = 'organisation',
  TEAM = 'team',
  PERSONAL = 'personal',
  APPLICATION = 'application'
}

export interface RoleConstraint {
  type: ConstraintType;
  value: unknown;
  description: string;
}

export enum ConstraintType {
  MAX_USERS = 'max_users',
  TIME_WINDOW = 'time_window',
  IP_RANGE = 'ip_range',
  GEO_FENCE = 'geo_fence',
  DEVICE_TRUST = 'device_trust',
  MFA_REQUIRED = 'mfa_required',
  APPROVAL_REQUIRED = 'approval_required'
}

export interface Group {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: GroupType;
  members: GroupMember[];
  roles: Role[];
  parentGroupId?: string;
  childGroupIds: string[];
  policies: IAMPolicy[];
  createdAt: Date;
  updatedAt: Date;
}

export enum GroupType {
  ORGANISATION = 'organisation',
  DEPARTMENT = 'department',
  TEAM = 'team',
  PROJECT = 'project',
  DYNAMIC = 'dynamic',               // Auto-membership based on attributes
  EXTERNAL = 'external'              // Federated group
}

export interface GroupMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  addedAt: Date;
  addedBy: string;
  expiresAt?: Date;
}

// ============================================================================
// Application Access Types
// ============================================================================

export interface AppAccess {
  applicationId: string;
  applicationName: string;
  roles: Role[];
  permissions: Permission[];
  grantedAt: Date;
  grantedBy: string;
  expiresAt?: Date;
  conditions?: PolicyCondition[];
  lastAccessedAt?: Date;
  accessCount: number;
}

export interface Application {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: ApplicationType;
  icon?: string;
  url?: string;
  clientId: string;
  clientSecret?: string;             // Stored in Void
  redirectUris: string[];
  scopes: OAuthScope[];
  roles: Role[];
  policies: IAMPolicy[];
  ssoEnabled: boolean;
  mfaRequired: boolean;
  trustedApplication: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum ApplicationType {
  WEB = 'web',
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
  API = 'api',
  SERVICE = 'service',
  IOT = 'iot',
  AGENT = 'agent',
  BOT = 'bot'
}

export interface OAuthScope {
  name: string;
  displayName: string;
  description: string;
  sensitive: boolean;
  requiresConsent: boolean;
}

// ============================================================================
// Access Profile Types
// ============================================================================

export interface AccessProfile {
  roles: Role[];
  permissions: Permission[];
  groups: Group[];
  applications: AppAccess[];
  restrictions: AccessRestriction[];
  temporalAccess: TemporalAccess[];
  emergencyAccess?: EmergencyAccess;
  lastReviewedAt?: Date;
  nextReviewAt?: Date;
}

export interface AccessRestriction {
  id: string;
  type: RestrictionType;
  reason: string;
  appliedAt: Date;
  appliedBy: string;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
}

export enum RestrictionType {
  IP_BLOCK = 'ip_block',
  GEO_BLOCK = 'geo_block',
  TIME_BLOCK = 'time_block',
  DEVICE_BLOCK = 'device_block',
  FEATURE_BLOCK = 'feature_block',
  RATE_LIMIT = 'rate_limit',
  QUARANTINE = 'quarantine'
}

export interface TemporalAccess {
  id: string;
  roleId: string;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  startAt: Date;
  endAt: Date;
  status: 'pending' | 'approved' | 'active' | 'expired' | 'revoked';
}

export interface EmergencyAccess {
  enabled: boolean;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date;
  scope: string[];
  auditRequired: boolean;
}

// ============================================================================
// Compliance Profile Types
// ============================================================================

export interface ComplianceProfile {
  gdprConsent: ConsentRecord[];
  ccpaOptOut: boolean;
  dataRetentionPolicy: string;
  rightToErasureRequested: boolean;
  rightToErasureRequestedAt?: Date;
  dataPortabilityRequested: boolean;
  auditTrail: AuditEntry[];
  certifications: UserCertification[];
}

export interface ConsentRecord {
  id: string;
  type: ConsentType;
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  version: string;
  ipAddress: string;
  userAgent: string;
}

export enum ConsentType {
  TERMS_OF_SERVICE = 'terms_of_service',
  PRIVACY_POLICY = 'privacy_policy',
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  COOKIES = 'cookies',
  DATA_PROCESSING = 'data_processing',
  BIOMETRIC = 'biometric',
  NEURAL = 'neural'                  // BCI consent (2060)
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  resource: string;
  actor: string;
  ipAddress: string;
  result: 'success' | 'failure' | 'partial';
  metadata: Record<string, unknown>;
}

export interface UserCertification {
  id: string;
  type: string;
  issuedAt: Date;
  expiresAt?: Date;
  issuer: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// User Preferences Types
// ============================================================================

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system' | 'high-contrast';
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  currency: string;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  accessibility: AccessibilityPreferences;
  interface: InterfacePreferences;
}

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  inApp: boolean;
  securityAlerts: boolean;
  loginAlerts: boolean;
  marketingEmails: boolean;
  digest: 'realtime' | 'daily' | 'weekly' | 'never';
}

export interface PrivacyPreferences {
  profileVisibility: 'public' | 'private' | 'connections';
  activityVisibility: 'public' | 'private';
  searchable: boolean;
  dataSharing: boolean;
  analyticsOptIn: boolean;
}

export interface AccessibilityPreferences {
  screenReader: boolean;
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  keyboardNavigation: boolean;
  colorBlindMode?: 'deuteranopia' | 'protanopia' | 'tritanopia';
  neuralInterface?: boolean;         // BCI (2060)
}

export interface InterfacePreferences {
  layout: 'default' | 'compact' | 'comfortable';
  sidebarCollapsed: boolean;
  dashboardWidgets: string[];
  shortcuts: Record<string, string>;
  holographicMode?: boolean;         // AR/VR (2060)
}

// ============================================================================
// User Metadata & Status Types
// ============================================================================

export interface UserMetadata {
  source: 'direct' | 'oauth' | 'saml' | 'scim' | 'invitation' | 'migration';
  externalId?: string;
  externalProvider?: string;
  invitedBy?: string;
  invitedAt?: Date;
  onboardingCompleted: boolean;
  onboardingCompletedAt?: Date;
  verificationLevel: VerificationLevel;
  tags: string[];
  customAttributes: Record<string, unknown>;
}

export enum VerificationLevel {
  UNVERIFIED = 'unverified',
  EMAIL_VERIFIED = 'email_verified',
  PHONE_VERIFIED = 'phone_verified',
  IDENTITY_VERIFIED = 'identity_verified',
  BIOMETRIC_VERIFIED = 'biometric_verified',
  GOVERNMENT_ID_VERIFIED = 'government_id_verified',
  NEURAL_VERIFIED = 'neural_verified'  // BCI (2060)
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  LOCKED = 'locked',
  PENDING_VERIFICATION = 'pending_verification',
  PENDING_APPROVAL = 'pending_approval',
  DEACTIVATED = 'deactivated',
  QUARANTINED = 'quarantined',       // Moved to IceBox
  DELETED = 'deleted'
}

// ============================================================================
// Admin Types
// ============================================================================

export interface AdminAction {
  id: string;
  adminId: string;
  targetUserId?: string;
  targetResourceId?: string;
  action: AdminActionType;
  reason: string;
  approvedBy?: string;
  executedAt: Date;
  result: 'success' | 'failure';
  metadata: Record<string, unknown>;
  auditTrail: AuditEntry[];
}

export enum AdminActionType {
  CREATE_USER = 'create_user',
  SUSPEND_USER = 'suspend_user',
  DELETE_USER = 'delete_user',
  RESET_PASSWORD = 'reset_password',
  ASSIGN_ROLE = 'assign_role',
  REVOKE_ROLE = 'revoke_role',
  GRANT_PERMISSION = 'grant_permission',
  REVOKE_PERMISSION = 'revoke_permission',
  UNLOCK_ACCOUNT = 'unlock_account',
  FORCE_MFA = 'force_mfa',
  QUARANTINE_USER = 'quarantine_user',
  EMERGENCY_ACCESS = 'emergency_access',
  BULK_OPERATION = 'bulk_operation',
  EXPORT_DATA = 'export_data',
  PURGE_DATA = 'purge_data'
}

export interface BulkOperation {
  id: string;
  type: AdminActionType;
  targetUserIds: string[];
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  progress: number;
  results: BulkOperationResult[];
  createdAt: Date;
  completedAt?: Date;
  createdBy: string;
}

export interface BulkOperationResult {
  userId: string;
  success: boolean;
  error?: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Organisation Types
// ============================================================================

export interface Organisation {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  logo?: string;
  domain: string;
  domains: string[];
  type: OrgType;
  plan: OrgPlan;
  settings: OrgSettings;
  members: OrgMember[];
  groups: Group[];
  roles: Role[];
  policies: IAMPolicy[];
  applications: Application[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export enum OrgType {
  PERSONAL = 'personal',
  STARTUP = 'startup',
  ENTERPRISE = 'enterprise',
  GOVERNMENT = 'government',
  NON_PROFIT = 'non_profit',
  EDUCATIONAL = 'educational'
}

export enum OrgPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  SOVEREIGN = 'sovereign'
}

export interface OrgSettings {
  ssoEnabled: boolean;
  ssoProvider?: string;
  mfaRequired: boolean;
  passwordPolicy: PasswordPolicy;
  sessionPolicy: SessionPolicy;
  ipAllowlist: string[];
  geoAllowlist: string[];
  dataResidency: string;
  auditLogRetention: number;         // days
  customBranding?: BrandingConfig;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number;                    // days
  historyCount: number;
  breachCheckEnabled: boolean;
}

export interface SessionPolicy {
  maxDuration: number;               // seconds
  idleTimeout: number;               // seconds
  maxConcurrentSessions: number;
  requireMfaForSensitive: boolean;
  trustedDevicesEnabled: boolean;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logo: string;
  favicon: string;
  customDomain?: string;
  emailTemplate?: string;
}

export interface OrgMember {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'billing' | 'viewer';
  joinedAt: Date;
  invitedBy: string;
  status: 'active' | 'pending' | 'suspended';
}

// ============================================================================
// Token & Integration Types
// ============================================================================

export interface OAuthToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
  scope: string;
  idToken?: string;                  // OIDC
}

export interface OIDCClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  picture?: string;
  locale?: string;
  zoneinfo?: string;
  updated_at?: number;
  // Custom Infinity-One claims
  'infinity:did'?: string;
  'infinity:roles'?: string[];
  'infinity:permissions'?: string[];
  'infinity:lighthouse_token'?: string;
  'infinity:risk_score'?: number;
  'infinity:verification_level'?: string;
}

export interface SCIMUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name: SCIMName;
  emails: SCIMEmail[];
  phoneNumbers?: SCIMPhoneNumber[];
  photos?: SCIMPhoto[];
  addresses?: SCIMAddress[];
  groups?: SCIMGroupRef[];
  roles?: SCIMRole[];
  active: boolean;
  meta: SCIMMeta;
}

export interface SCIMName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

export interface SCIMEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMPhoneNumber {
  value: string;
  type?: string;
}

export interface SCIMPhoto {
  value: string;
  type?: string;
}

export interface SCIMAddress {
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMGroupRef {
  value: string;
  display?: string;
  type?: string;
}

export interface SCIMRole {
  value: string;
  display?: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMMeta {
  resourceType: string;
  created: string;
  lastModified: string;
  location: string;
  version: string;
}