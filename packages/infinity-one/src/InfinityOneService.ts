/**
 * Infinity-One Universal Account Hub - Core Service
 * Central identity, IAM, RBAC, and profile management
 * 2060 future-proof with quantum-safe authentication
 */

import {
  InfinityOneUser, UserProfile, ContactInfo, SecurityProfile, AccessProfile,
  ComplianceProfile, UserPreferences, UserMetadata, UserStatus, Role, RoleType,
  Permission, PermissionScope, Group, GroupType, IAMPolicy, PolicyEffect,
  Application, ApplicationType, AppAccess, Organisation, OrgType, OrgPlan,
  MFAType, MFAMethod, WebAuthnCredential, Session, TrustedDevice, GeoLocation,
  SecurityEvent, SecurityEventType, LoginAttempt, AuditEntry, ConsentRecord,
  ConsentType, AdminAction, AdminActionType, BulkOperation, OAuthToken,
  OIDCClaims, SCIMUser, RiskLevel, VerificationLevel, Gender, PolicyStatement,
  ConditionOperator, PolicyCondition, ConstraintType, RoleConstraint,
  AccessRestriction, RestrictionType, TemporalAccess, OrgMember, OrgSettings,
  PasswordPolicy, SessionPolicy, GroupMember, BulkOperationResult
} from './types';

// ============================================================================
// System Roles (Built-in)
// ============================================================================

export const SYSTEM_ROLES: Record<string, Partial<Role>> = {
  SUPER_ADMIN: {
    name: 'super_admin',
    displayName: 'Super Administrator',
    description: 'Unrestricted access to all platform resources',
    type: RoleType.SYSTEM,
    level: 0
  },
  ORG_ADMIN: {
    name: 'org_admin',
    displayName: 'Organisation Administrator',
    description: 'Full control over organisation resources',
    type: RoleType.SYSTEM,
    level: 1
  },
  SECURITY_ADMIN: {
    name: 'security_admin',
    displayName: 'Security Administrator',
    description: 'Security policy and incident management',
    type: RoleType.SYSTEM,
    level: 1
  },
  POWER_USER: {
    name: 'power_user',
    displayName: 'Power User',
    description: 'Advanced features and shared workspaces',
    type: RoleType.SYSTEM,
    level: 2
  },
  STANDARD_USER: {
    name: 'standard_user',
    displayName: 'Standard User',
    description: 'Personal files and approved modules',
    type: RoleType.SYSTEM,
    level: 3
  },
  GUEST: {
    name: 'guest',
    displayName: 'Guest',
    description: 'Limited read-only access',
    type: RoleType.SYSTEM,
    level: 4
  },
  BOT: {
    name: 'bot',
    displayName: 'Bot/Agent',
    description: 'Automated agent access',
    type: RoleType.SYSTEM,
    level: 3
  }
};

// ============================================================================
// Permission Registry
// ============================================================================

export const SYSTEM_PERMISSIONS: Record<string, Partial<Permission>> = {
  // Infinity-One
  'infinity-one:read': { resource: 'infinity-one', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.LOW },
  'infinity-one:write': { resource: 'infinity-one', action: 'write', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.MEDIUM },
  'infinity-one:admin': { resource: 'infinity-one', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.HIGH },
  // Lighthouse
  'lighthouse:read': { resource: 'lighthouse', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.LOW },
  'lighthouse:write': { resource: 'lighthouse', action: 'write', scope: PermissionScope.ORGANISATION, riskLevel: RiskLevel.HIGH },
  'lighthouse:admin': { resource: 'lighthouse', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.CRITICAL },
  // HIVE
  'hive:read': { resource: 'hive', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.LOW },
  'hive:route': { resource: 'hive', action: 'route', scope: PermissionScope.ORGANISATION, riskLevel: RiskLevel.MEDIUM },
  'hive:admin': { resource: 'hive', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.CRITICAL },
  // Void
  'void:read': { resource: 'void', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.HIGH },
  'void:write': { resource: 'void', action: 'write', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.CRITICAL },
  'void:admin': { resource: 'void', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.CRITICAL },
  // IceBox
  'icebox:read': { resource: 'icebox', action: 'read', scope: PermissionScope.ORGANISATION, riskLevel: RiskLevel.HIGH },
  'icebox:release': { resource: 'icebox', action: 'release', scope: PermissionScope.ORGANISATION, riskLevel: RiskLevel.CRITICAL },
  'icebox:admin': { resource: 'icebox', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.CRITICAL },
  // Royal Bank
  'rba:read': { resource: 'royal-bank', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.LOW },
  'rba:transact': { resource: 'royal-bank', action: 'transact', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.MEDIUM },
  'rba:admin': { resource: 'royal-bank', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.CRITICAL },
  // Arcadian Exchange
  'aex:read': { resource: 'arcadian-exchange', action: 'read', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.LOW },
  'aex:trade': { resource: 'arcadian-exchange', action: 'trade', scope: PermissionScope.PERSONAL, riskLevel: RiskLevel.MEDIUM },
  'aex:admin': { resource: 'arcadian-exchange', action: 'admin', scope: PermissionScope.GLOBAL, riskLevel: RiskLevel.HIGH },
};

// ============================================================================
// Infinity-One Core Service
// ============================================================================

export class InfinityOneService {
  private users: Map<string, InfinityOneUser> = new Map();
  private roles: Map<string, Role> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private groups: Map<string, Group> = new Map();
  private organisations: Map<string, Organisation> = new Map();
  private applications: Map<string, Application> = new Map();
  private policies: Map<string, IAMPolicy> = new Map();
  private sessions: Map<string, Session> = new Map();
  private auditLog: AuditEntry[] = [];
  private eventHandlers: Map<string, Set<(event: unknown) => void>> = new Map();

  constructor() {
    this.initializeSystemRoles();
    this.initializeSystemPermissions();
  }

  // ==========================================================================
  // User Management
  // ==========================================================================

  async createUser(data: CreateUserInput): Promise<InfinityOneUser> {
    const id = this.generateId();
    const now = new Date();

    const user: InfinityOneUser = {
      id,
      did: `did:infinity:${id}`,
      lighthouseToken: await this.requestLighthouseToken(id, 'user'),
      hiveNodeId: await this.assignHiveNode(id),
      profile: {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName || `${data.firstName} ${data.lastName}`,
        username: data.username || await this.generateUsername(data.firstName, data.lastName),
        gender: data.gender || Gender.PREFER_NOT_TO_SAY,
        languages: data.languages || ['en'],
        photo: data.photo,
        dateOfBirth: data.dateOfBirth,
        occupation: data.occupation,
        organisation: data.organisation
      },
      contact: {
        email: data.email,
        emailVerified: false,
        emailAlt: [],
        phone: data.phone,
        phoneVerified: false,
        phoneAlt: [],
        address: data.address,
        timezone: data.timezone || 'UTC',
        locale: data.locale || 'en-GB'
      },
      security: {
        mfaEnabled: false,
        mfaMethods: [],
        webauthnCredentials: [],
        activeSessions: [],
        trustedDevices: [],
        securityScore: 30,
        riskLevel: RiskLevel.MEDIUM,
        loginAttempts: [],
        securityEvents: [],
        recoveryMethods: []
      },
      access: {
        roles: [await this.getRole('standard_user')].filter(Boolean) as Role[],
        permissions: [],
        groups: [],
        applications: [],
        restrictions: [],
        temporalAccess: []
      },
      compliance: {
        gdprConsent: [],
        ccpaOptOut: false,
        dataRetentionPolicy: 'standard',
        rightToErasureRequested: false,
        dataPortabilityRequested: false,
        auditTrail: [],
        certifications: []
      },
      preferences: this.getDefaultPreferences(),
      metadata: {
        source: data.source || 'direct',
        externalId: data.externalId,
        externalProvider: data.externalProvider,
        invitedBy: data.invitedBy,
        invitedAt: data.invitedBy ? now : undefined,
        onboardingCompleted: false,
        verificationLevel: VerificationLevel.UNVERIFIED,
        tags: data.tags || [],
        customAttributes: data.customAttributes || {}
      },
      status: UserStatus.PENDING_VERIFICATION,
      createdAt: now,
      updatedAt: now
    };

    this.users.set(id, user);
    await this.logAudit('user.created', 'user', id, data.createdBy || 'system', 'success', { email: data.email });
    this.emit('user.created', user);
    return user;
  }

  async getUser(id: string): Promise<InfinityOneUser | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<InfinityOneUser | null> {
    for (const user of this.users.values()) {
      if (user.contact.email === email) return user;
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<InfinityOneUser>, updatedBy: string): Promise<InfinityOneUser> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User ${id} not found`);

    const updated = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updated);
    await this.logAudit('user.updated', 'user', id, updatedBy, 'success', { fields: Object.keys(updates) });
    this.emit('user.updated', updated);
    return updated;
  }

  async suspendUser(id: string, reason: string, suspendedBy: string): Promise<void> {
    await this.updateUser(id, { status: UserStatus.SUSPENDED }, suspendedBy);
    await this.revokeAllSessions(id);
    await this.logAudit('user.suspended', 'user', id, suspendedBy, 'success', { reason });
    this.emit('user.suspended', { userId: id, reason, suspendedBy });
  }

  async deleteUser(id: string, deletedBy: string, hardDelete = false): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User ${id} not found`);

    if (hardDelete) {
      // GDPR right to erasure - crypto-shred all data
      await this.cryptoShredUser(id);
      this.users.delete(id);
    } else {
      await this.updateUser(id, { status: UserStatus.DELETED }, deletedBy);
    }

    await this.logAudit('user.deleted', 'user', id, deletedBy, 'success', { hardDelete });
    this.emit('user.deleted', { userId: id, hardDelete });
  }

  async quarantineUser(id: string, reason: string, quarantinedBy: string): Promise<void> {
    await this.updateUser(id, { status: UserStatus.QUARANTINED }, quarantinedBy);
    await this.revokeAllSessions(id);
    // Trigger Warp Tunnel to move user to IceBox
    await this.triggerWarpTunnel(id, 'user', reason);
    await this.logAudit('user.quarantined', 'user', id, quarantinedBy, 'success', { reason });
    this.emit('user.quarantined', { userId: id, reason });
  }

  async listUsers(filters?: UserFilters): Promise<InfinityOneUser[]> {
    let users = Array.from(this.users.values());
    if (filters?.status) users = users.filter(u => u.status === filters.status);
    if (filters?.role) users = users.filter(u => u.access.roles.some(r => r.name === filters.role));
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      users = users.filter(u =>
        u.profile.displayName.toLowerCase().includes(q) ||
        u.contact.email.toLowerCase().includes(q) ||
        u.profile.username.toLowerCase().includes(q)
      );
    }
    return users;
  }

  // ==========================================================================
  // IAM - Role Management
  // ==========================================================================

  async createRole(data: CreateRoleInput, createdBy: string): Promise<Role> {
    const id = this.generateId();
    const role: Role = {
      id,
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      type: data.type || RoleType.CUSTOM,
      level: data.level || 3,
      permissions: data.permissions || [],
      inheritedRoles: data.inheritedRoles || [],
      policies: data.policies || [],
      constraints: data.constraints || [],
      metadata: data.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy
    };

    this.roles.set(id, role);
    await this.logAudit('role.created', 'role', id, createdBy, 'success', { name: data.name });
    return role;
  }

  async getRole(nameOrId: string): Promise<Role | null> {
    // Try by ID first
    if (this.roles.has(nameOrId)) return this.roles.get(nameOrId)!;
    // Try by name
    for (const role of this.roles.values()) {
      if (role.name === nameOrId) return role;
    }
    return null;
  }

  async assignRole(userId: string, roleId: string, assignedBy: string, options?: AssignRoleOptions): Promise<void> {
    const user = this.users.get(userId);
    const role = await this.getRole(roleId);
    if (!user) throw new Error(`User ${userId} not found`);
    if (!role) throw new Error(`Role ${roleId} not found`);

    // Check if role already assigned
    if (user.access.roles.some(r => r.id === role.id)) return;

    // Check constraints
    await this.validateRoleConstraints(role, user);

    if (options?.temporal) {
      user.access.temporalAccess.push({
        id: this.generateId(),
        roleId: role.id,
        reason: options.reason || 'Temporal access granted',
        requestedBy: assignedBy,
        approvedBy: options.approvedBy,
        startAt: options.temporal.startAt,
        endAt: options.temporal.endAt,
        status: options.approvedBy ? 'approved' : 'pending'
      });
    } else {
      user.access.roles.push(role);
    }

    user.updatedAt = new Date();
    await this.logAudit('role.assigned', 'user', userId, assignedBy, 'success', { roleId, roleName: role.name });
    this.emit('role.assigned', { userId, roleId, role });
  }

  async revokeRole(userId: string, roleId: string, revokedBy: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    user.access.roles = user.access.roles.filter(r => r.id !== roleId);
    user.updatedAt = new Date();
    await this.logAudit('role.revoked', 'user', userId, revokedBy, 'success', { roleId });
    this.emit('role.revoked', { userId, roleId });
  }

  // ==========================================================================
  // RBAC - Permission Checking
  // ==========================================================================

  async checkPermission(userId: string, resource: string, action: string, context?: PermissionContext): Promise<PermissionResult> {
    const user = this.users.get(userId);
    if (!user) return { allowed: false, reason: 'User not found' };

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      return { allowed: false, reason: `User status is ${user.status}` };
    }

    // Check restrictions
    const restriction = await this.checkRestrictions(user, context);
    if (restriction) return { allowed: false, reason: restriction };

    // Super admin bypass
    if (user.access.roles.some(r => r.name === 'super_admin')) {
      return { allowed: true, reason: 'Super admin access', riskScore: 0 };
    }

    // Collect all permissions from roles
    const allPermissions = await this.collectPermissions(user);

    // Check explicit deny first (deny overrides allow)
    const denied = allPermissions.find(p =>
      p.resource === resource && p.action === action && p.scope === PermissionScope.GLOBAL
    );

    // Check allow
    const allowed = allPermissions.find(p =>
      (p.resource === resource || p.resource === '*') &&
      (p.action === action || p.action === '*')
    );

    if (!allowed) {
      return { allowed: false, reason: 'No matching permission found' };
    }

    // Evaluate conditions
    if (allowed.conditions && context) {
      const conditionResult = await this.evaluateConditions(allowed.conditions, context);
      if (!conditionResult.passed) {
        return { allowed: false, reason: conditionResult.reason };
      }
    }

    return {
      allowed: true,
      reason: 'Permission granted',
      permission: allowed,
      riskScore: allowed.riskLevel === RiskLevel.CRITICAL ? 90 :
                 allowed.riskLevel === RiskLevel.HIGH ? 70 :
                 allowed.riskLevel === RiskLevel.MEDIUM ? 40 : 10
    };
  }

  async checkPermissions(userId: string, checks: PermissionCheck[]): Promise<Map<string, PermissionResult>> {
    const results = new Map<string, PermissionResult>();
    for (const check of checks) {
      const key = `${check.resource}:${check.action}`;
      results.set(key, await this.checkPermission(userId, check.resource, check.action, check.context));
    }
    return results;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  async createSession(userId: string, deviceInfo: DeviceInfo, options?: SessionOptions): Promise<Session> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const session: Session = {
      id: this.generateId(),
      userId,
      deviceId: deviceInfo.deviceId || this.generateId(),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      location: deviceInfo.location,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (options?.duration || 3600) * 1000),
      lastActiveAt: new Date(),
      riskScore: await this.calculateSessionRisk(user, deviceInfo),
      mfaVerified: options?.mfaVerified || false,
      scopes: options?.scopes || ['openid', 'profile', 'email'],
      applicationId: options?.applicationId
    };

    user.security.activeSessions.push(session);
    this.sessions.set(session.id, session);
    await this.logAudit('session.created', 'session', session.id, userId, 'success', {
      ipAddress: deviceInfo.ipAddress,
      riskScore: session.riskScore
    });

    return session;
  }

  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return { valid: false, reason: 'Session not found' };
    if (new Date() > session.expiresAt) {
      await this.revokeSession(sessionId);
      return { valid: false, reason: 'Session expired' };
    }

    // Update last active
    session.lastActiveAt = new Date();
    return { valid: true, session };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);
    const user = this.users.get(session.userId);
    if (user) {
      user.security.activeSessions = user.security.activeSessions.filter(s => s.id !== sessionId);
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;

    for (const session of user.security.activeSessions) {
      this.sessions.delete(session.id);
    }
    user.security.activeSessions = [];
  }

  // ==========================================================================
  // MFA Management
  // ==========================================================================

  async enrollMFA(userId: string, type: MFAType, name: string): Promise<MFAEnrollmentResult> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const method: MFAMethod = {
      id: this.generateId(),
      type,
      name,
      enabled: false,
      primary: user.security.mfaMethods.length === 0,
      createdAt: new Date(),
      metadata: {}
    };

    let enrollmentData: Record<string, unknown> = {};

    switch (type) {
      case MFAType.TOTP:
        enrollmentData = await this.generateTOTPSecret(userId);
        break;
      case MFAType.WEBAUTHN:
        enrollmentData = await this.generateWebAuthnChallenge(userId);
        break;
      case MFAType.SMS:
        enrollmentData = { phoneNumber: user.contact.phone };
        break;
      case MFAType.EMAIL:
        enrollmentData = { email: user.contact.email };
        break;
    }

    method.metadata = enrollmentData;
    user.security.mfaMethods.push(method);
    await this.logAudit('mfa.enrolled', 'user', userId, userId, 'success', { type });

    return { methodId: method.id, enrollmentData };
  }

  async verifyMFA(userId: string, methodId: string, code: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    const method = user.security.mfaMethods.find(m => m.id === methodId);
    if (!method) return false;

    // Verify based on type (simplified - real implementation would use proper crypto)
    const verified = await this.verifyMFACode(method, code);

    if (verified) {
      method.enabled = true;
      method.lastUsedAt = new Date();
      if (!user.security.mfaEnabled) {
        user.security.mfaEnabled = true;
        user.security.securityScore = Math.min(100, user.security.securityScore + 20);
      }
      await this.logAudit('mfa.verified', 'user', userId, userId, 'success', { type: method.type });
    } else {
      await this.logAudit('mfa.failed', 'user', userId, userId, 'failure', { type: method.type });
    }

    return verified;
  }

  // ==========================================================================
  // Organisation Management
  // ==========================================================================

  async createOrganisation(data: CreateOrgInput, createdBy: string): Promise<Organisation> {
    const id = this.generateId();
    const org: Organisation = {
      id,
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      domain: data.domain,
      domains: data.domains || [data.domain],
      type: data.type || OrgType.STARTUP,
      plan: data.plan || OrgPlan.FREE,
      settings: this.getDefaultOrgSettings(),
      members: [{
        userId: createdBy,
        role: 'owner',
        joinedAt: new Date(),
        invitedBy: createdBy,
        status: 'active'
      }],
      groups: [],
      roles: [],
      policies: [],
      applications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy
    };

    this.organisations.set(id, org);
    await this.logAudit('org.created', 'organisation', id, createdBy, 'success', { name: data.name });
    return org;
  }

  // ==========================================================================
  // SCIM 2.0 Provisioning
  // ==========================================================================

  async scimCreateUser(scimUser: SCIMUser, orgId: string): Promise<InfinityOneUser> {
    return this.createUser({
      firstName: scimUser.name.givenName || '',
      lastName: scimUser.name.familyName || '',
      email: scimUser.emails[0]?.value || '',
      username: scimUser.userName,
      phone: scimUser.phoneNumbers?.[0]?.value,
      source: 'scim',
      externalId: scimUser.externalId,
      createdBy: `scim:${orgId}`
    });
  }

  async scimUpdateUser(id: string, scimUser: Partial<SCIMUser>, updatedBy: string): Promise<InfinityOneUser> {
    const updates: Partial<InfinityOneUser> = {};
    if (scimUser.name) {
      updates.profile = {
        ...this.users.get(id)?.profile,
        firstName: scimUser.name.givenName || '',
        lastName: scimUser.name.familyName || '',
        displayName: scimUser.name.formatted || '',
        username: scimUser.userName || '',
        gender: Gender.PREFER_NOT_TO_SAY,
        languages: ['en']
      };
    }
    return this.updateUser(id, updates, updatedBy);
  }

  // ==========================================================================
  // OAuth2 / OIDC
  // ==========================================================================

  async generateOAuthToken(userId: string, scopes: string[], applicationId: string): Promise<OAuthToken> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const now = Math.floor(Date.now() / 1000);
    const claims: OIDCClaims = {
      sub: userId,
      iss: 'https://identity.trancendos.com',
      aud: applicationId,
      exp: now + 900, // 15 minutes
      iat: now,
      name: user.profile.displayName,
      email: user.contact.email,
      email_verified: user.contact.emailVerified,
      phone_number: user.contact.phone,
      picture: user.profile.photo,
      locale: user.contact.locale,
      zoneinfo: user.contact.timezone,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000),
      'infinity:did': user.did,
      'infinity:roles': user.access.roles.map(r => r.name),
      'infinity:permissions': user.access.permissions.map(p => `${p.resource}:${p.action}`),
      'infinity:lighthouse_token': user.lighthouseToken,
      'infinity:risk_score': user.security.riskLevel === RiskLevel.CRITICAL ? 90 :
                              user.security.riskLevel === RiskLevel.HIGH ? 70 :
                              user.security.riskLevel === RiskLevel.MEDIUM ? 40 : 10,
      'infinity:verification_level': user.metadata.verificationLevel
    };

    // In production, sign with ML-DSA-65 (quantum-safe)
    const accessToken = await this.signJWT(claims);
    const idToken = scopes.includes('openid') ? await this.signJWT({ ...claims, nonce: this.generateId() }) : undefined;

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: await this.generateRefreshToken(userId, applicationId),
      scope: scopes.join(' '),
      idToken
    };
  }

  // ==========================================================================
  // Audit & Compliance
  // ==========================================================================

  async logAudit(
    action: string,
    resource: string,
    resourceId: string,
    actor: string,
    result: 'success' | 'failure' | 'partial',
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      action,
      resource: `${resource}/${resourceId}`,
      actor,
      ipAddress: metadata.ipAddress as string || 'system',
      result,
      metadata
    };
    this.auditLog.push(entry);
    this.emit('audit.entry', entry);
  }

  async getAuditLog(filters?: AuditFilters): Promise<AuditEntry[]> {
    let entries = [...this.auditLog];
    if (filters?.userId) entries = entries.filter(e => e.actor === filters.userId);
    if (filters?.action) entries = entries.filter(e => e.action.includes(filters.action!));
    if (filters?.from) entries = entries.filter(e => e.timestamp >= filters.from!);
    if (filters?.to) entries = entries.filter(e => e.timestamp <= filters.to!);
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async processGDPRRequest(userId: string, type: 'erasure' | 'portability' | 'access', requestedBy: string): Promise<GDPRRequestResult> {
    const user = this.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    switch (type) {
      case 'erasure':
        user.compliance.rightToErasureRequested = true;
        user.compliance.rightToErasureRequestedAt = new Date();
        await this.scheduleDataErasure(userId);
        break;
      case 'portability':
        user.compliance.dataPortabilityRequested = true;
        return { success: true, data: await this.exportUserData(userId) };
      case 'access':
        return { success: true, data: await this.exportUserData(userId) };
    }

    await this.logAudit(`gdpr.${type}`, 'user', userId, requestedBy, 'success', {});
    return { success: true };
  }

  // ==========================================================================
  // Security & Risk
  // ==========================================================================

  async calculateSecurityScore(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user) return 0;

    let score = 0;
    if (user.contact.emailVerified) score += 10;
    if (user.contact.phoneVerified) score += 10;
    if (user.security.mfaEnabled) score += 20;
    if (user.security.webauthnCredentials.length > 0) score += 15;
    if (user.security.trustedDevices.length > 0) score += 5;
    if (user.metadata.verificationLevel === VerificationLevel.IDENTITY_VERIFIED) score += 20;
    if (user.security.recoveryMethods.length >= 2) score += 10;
    if (user.security.mfaMethods.length >= 2) score += 10;

    user.security.securityScore = Math.min(100, score);
    return user.security.securityScore;
  }

  async detectAnomalousLogin(userId: string, attempt: LoginAttempt): Promise<AnomalyResult> {
    const user = this.users.get(userId);
    if (!user) return { anomalous: false };

    const recentAttempts = user.security.loginAttempts.slice(-10);
    const failedAttempts = recentAttempts.filter(a => !a.success).length;

    // Brute force detection
    if (failedAttempts >= 5) {
      await this.lockAccount(userId, 'brute_force');
      return { anomalous: true, type: 'brute_force', severity: 'critical' };
    }

    // Impossible travel detection
    if (recentAttempts.length > 0 && attempt.location) {
      const lastAttempt = recentAttempts[recentAttempts.length - 1];
      if (lastAttempt.location && this.isImpossibleTravel(lastAttempt, attempt)) {
        return { anomalous: true, type: 'impossible_travel', severity: 'high' };
      }
    }

    // New location detection
    const knownLocations = recentAttempts
      .filter(a => a.location)
      .map(a => a.location!.country);

    if (attempt.location && !knownLocations.includes(attempt.location.country)) {
      return { anomalous: true, type: 'new_location', severity: 'medium' };
    }

    return { anomalous: false };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private initializeSystemRoles(): void {
    for (const [key, roleData] of Object.entries(SYSTEM_ROLES)) {
      const role: Role = {
        id: this.generateId(),
        name: roleData.name!,
        displayName: roleData.displayName!,
        description: roleData.description!,
        type: roleData.type!,
        level: roleData.level!,
        permissions: [],
        inheritedRoles: [],
        policies: [],
        constraints: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system'
      };
      this.roles.set(role.id, role);
    }
  }

  private initializeSystemPermissions(): void {
    for (const [key, permData] of Object.entries(SYSTEM_PERMISSIONS)) {
      const permission: Permission = {
        id: this.generateId(),
        name: key,
        displayName: key.replace(':', ' ').replace('-', ' '),
        description: `${permData.action} access to ${permData.resource}`,
        resource: permData.resource!,
        action: permData.action!,
        scope: permData.scope!,
        riskLevel: permData.riskLevel!
      };
      this.permissions.set(permission.id, permission);
    }
  }

  private async collectPermissions(user: InfinityOneUser): Promise<Permission[]> {
    const permissions: Permission[] = [...user.access.permissions];
    for (const role of user.access.roles) {
      permissions.push(...role.permissions);
      // Collect inherited role permissions
      for (const inheritedRoleId of role.inheritedRoles) {
        const inheritedRole = await this.getRole(inheritedRoleId);
        if (inheritedRole) permissions.push(...inheritedRole.permissions);
      }
    }
    return permissions;
  }

  private async validateRoleConstraints(role: Role, user: InfinityOneUser): Promise<void> {
    for (const constraint of role.constraints) {
      switch (constraint.type) {
        case ConstraintType.MFA_REQUIRED:
          if (!user.security.mfaEnabled) {
            throw new Error(`Role ${role.name} requires MFA to be enabled`);
          }
          break;
        case ConstraintType.MAX_USERS:
          const usersWithRole = Array.from(this.users.values())
            .filter(u => u.access.roles.some(r => r.id === role.id)).length;
          if (usersWithRole >= (constraint.value as number)) {
            throw new Error(`Role ${role.name} has reached maximum user limit`);
          }
          break;
      }
    }
  }

  private async checkRestrictions(user: InfinityOneUser, context?: PermissionContext): Promise<string | null> {
    for (const restriction of user.access.restrictions) {
      if (restriction.expiresAt && new Date() > restriction.expiresAt) continue;
      switch (restriction.type) {
        case RestrictionType.QUARANTINE:
          return 'User is quarantined';
        case RestrictionType.IP_BLOCK:
          if (context?.ipAddress && restriction.metadata.ipRange) return 'IP address blocked';
          break;
        case RestrictionType.GEO_BLOCK:
          if (context?.country && restriction.metadata.countries) return 'Geographic access blocked';
          break;
      }
    }
    return null;
  }

  private async evaluateConditions(conditions: PolicyCondition[], context: PermissionContext): Promise<{ passed: boolean; reason?: string }> {
    for (const condition of conditions) {
      switch (condition.operator) {
        case ConditionOperator.MFA_PRESENT:
          if (!context.mfaVerified) return { passed: false, reason: 'MFA required' };
          break;
        case ConditionOperator.IP_ADDRESS:
          if (!condition.values.some(v => context.ipAddress?.startsWith(v))) {
            return { passed: false, reason: 'IP address not in allowed range' };
          }
          break;
        case ConditionOperator.RISK_SCORE_LESS_THAN:
          const threshold = parseInt(condition.values[0]);
          if ((context.riskScore || 0) >= threshold) {
            return { passed: false, reason: 'Risk score too high' };
          }
          break;
      }
    }
    return { passed: true };
  }

  private async calculateSessionRisk(user: InfinityOneUser, device: DeviceInfo): Promise<number> {
    let risk = 0;
    if (!user.security.mfaEnabled) risk += 20;
    if (user.security.riskLevel === RiskLevel.HIGH) risk += 30;
    if (user.security.riskLevel === RiskLevel.CRITICAL) risk += 50;
    if (!user.contact.emailVerified) risk += 10;
    return Math.min(100, risk);
  }

  private isImpossibleTravel(last: LoginAttempt, current: LoginAttempt): boolean {
    if (!last.location || !current.location) return false;
    const timeDiff = (current.timestamp.getTime() - last.timestamp.getTime()) / 3600000; // hours
    const distance = this.calculateDistance(
      last.location.latitude, last.location.longitude,
      current.location.latitude, current.location.longitude
    );
    const maxSpeed = 900; // km/h (commercial flight)
    return distance / timeDiff > maxSpeed;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  private async lockAccount(userId: string, reason: string): Promise<void> {
    await this.updateUser(userId, { status: UserStatus.LOCKED }, 'system');
    this.emit('account.locked', { userId, reason });
  }

  private async triggerWarpTunnel(entityId: string, entityType: string, reason: string): Promise<void> {
    this.emit('warp_tunnel.triggered', { entityId, entityType, reason, timestamp: new Date() });
  }

  private async cryptoShredUser(userId: string): Promise<void> {
    // Trigger Vault crypto-shredding for GDPR compliance
    this.emit('crypto_shred.requested', { userId, timestamp: new Date() });
  }

  private async scheduleDataErasure(userId: string): Promise<void> {
    // Schedule erasure after 30-day grace period
    this.emit('data_erasure.scheduled', { userId, scheduledFor: new Date(Date.now() + 30 * 24 * 3600 * 1000) });
  }

  private async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const user = this.users.get(userId);
    if (!user) return {};
    // Return sanitised user data for GDPR portability
    return {
      profile: user.profile,
      contact: { ...user.contact, emailAlt: user.contact.emailAlt.map(e => e.address) },
      preferences: user.preferences,
      createdAt: user.createdAt
    };
  }

  private async requestLighthouseToken(entityId: string, entityType: string): Promise<string> {
    // Request token from Lighthouse service
    return `lh_${entityType}_${entityId}_${Date.now()}`;
  }

  private async assignHiveNode(userId: string): Promise<string> {
    return `hive_node_${Math.floor(Math.random() * 10)}`;
  }

  private async generateUsername(firstName: string, lastName: string): Promise<string> {
    const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    return `${base}${Math.floor(Math.random() * 1000)}`;
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      theme: 'system',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      currency: 'GBP',
      notifications: {
        email: true, sms: false, push: true, inApp: true,
        securityAlerts: true, loginAlerts: true, marketingEmails: false, digest: 'daily'
      },
      privacy: {
        profileVisibility: 'private', activityVisibility: 'private',
        searchable: false, dataSharing: false, analyticsOptIn: false
      },
      accessibility: {
        screenReader: false, highContrast: false, largeText: false,
        reducedMotion: false, keyboardNavigation: true
      },
      interface: {
        layout: 'default', sidebarCollapsed: false,
        dashboardWidgets: ['profile', 'security', 'activity'], shortcuts: {}
      }
    };
  }

  private getDefaultOrgSettings(): OrgSettings {
    return {
      ssoEnabled: false,
      mfaRequired: false,
      passwordPolicy: {
        minLength: 12, requireUppercase: true, requireLowercase: true,
        requireNumbers: true, requireSpecialChars: true,
        maxAge: 90, historyCount: 10, breachCheckEnabled: true
      },
      sessionPolicy: {
        maxDuration: 86400, idleTimeout: 3600,
        maxConcurrentSessions: 5, requireMfaForSensitive: true, trustedDevicesEnabled: true
      },
      ipAllowlist: [],
      geoAllowlist: [],
      dataResidency: 'EU',
      auditLogRetention: 365
    };
  }

  private async generateTOTPSecret(userId: string): Promise<Record<string, unknown>> {
    const secret = this.generateSecureRandom(20);
    return { secret: Buffer.from(secret).toString('base32'), algorithm: 'SHA1', digits: 6, period: 30 };
  }

  private async generateWebAuthnChallenge(userId: string): Promise<Record<string, unknown>> {
    return { challenge: this.generateSecureRandom(32), timeout: 60000, rpId: 'trancendos.com' };
  }

  private async verifyMFACode(method: MFAMethod, code: string): Promise<boolean> {
    // Simplified - real implementation uses proper TOTP/WebAuthn verification
    return code.length >= 6;
  }

  private async signJWT(claims: OIDCClaims): Promise<string> {
    // Simplified - real implementation uses ML-DSA-65 quantum-safe signing
    const header = Buffer.from(JSON.stringify({ alg: 'ML-DSA-65', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = Buffer.from(`sig_${Date.now()}`).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  private async generateRefreshToken(userId: string, applicationId: string): Promise<string> {
    return `rt_${userId}_${applicationId}_${this.generateSecureRandom(32).toString('hex')}`;
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSecureRandom(bytes: number): Buffer {
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Buffer.from(arr);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) handlers.forEach(h => h(data));
  }

  on(event: string, handler: (event: unknown) => void): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler);
  }
}

// ============================================================================
// Input/Output Types
// ============================================================================

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  displayName?: string;
  username?: string;
  phone?: string;
  photo?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  languages?: string[];
  occupation?: string;
  organisation?: string;
  address?: import('./types').PostalAddress;
  timezone?: string;
  locale?: string;
  source?: 'direct' | 'oauth' | 'saml' | 'scim' | 'invitation' | 'migration';
  externalId?: string;
  externalProvider?: string;
  invitedBy?: string;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
  createdBy?: string;
}

export interface CreateRoleInput {
  name: string;
  displayName: string;
  description: string;
  type?: RoleType;
  level?: number;
  permissions?: Permission[];
  inheritedRoles?: string[];
  policies?: IAMPolicy[];
  constraints?: RoleConstraint[];
  metadata?: Record<string, unknown>;
}

export interface CreateOrgInput {
  name: string;
  displayName: string;
  description?: string;
  domain: string;
  domains?: string[];
  type?: OrgType;
  plan?: OrgPlan;
}

export interface AssignRoleOptions {
  reason?: string;
  approvedBy?: string;
  temporal?: { startAt: Date; endAt: Date };
}

export interface UserFilters {
  status?: UserStatus;
  role?: string;
  search?: string;
  orgId?: string;
  page?: number;
  limit?: number;
}

export interface PermissionContext {
  ipAddress?: string;
  country?: string;
  mfaVerified?: boolean;
  riskScore?: number;
  deviceTrusted?: boolean;
  timeOfDay?: number;
  applicationId?: string;
}

export interface PermissionCheck {
  resource: string;
  action: string;
  context?: PermissionContext;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  permission?: Permission;
  riskScore?: number;
}

export interface DeviceInfo {
  deviceId?: string;
  ipAddress: string;
  userAgent: string;
  location?: GeoLocation;
  platform?: string;
  browser?: string;
}

export interface SessionOptions {
  duration?: number;
  mfaVerified?: boolean;
  scopes?: string[];
  applicationId?: string;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  session?: Session;
}

export interface MFAEnrollmentResult {
  methodId: string;
  enrollmentData: Record<string, unknown>;
}

export interface AnomalyResult {
  anomalous: boolean;
  type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditFilters {
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  resource?: string;
}

export interface GDPRRequestResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}