/**
 * @package @infinity-os/types
 * Shared TypeScript types for the entire Infinity OS platform
 * 2060 Modular Standard — composable, replaceable, portable
 */

// ============================================================
// CORE IDENTITY & AUTH TYPES
// ============================================================

export type UserRole = 'super_admin' | 'org_admin' | 'auditor' | 'power_user' | 'user';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  organisationId: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'high-contrast' | 'system';
  language: string;
  timezone: string;
  desktopBackground?: string;
  widgetLayout?: WidgetLayout[];
  keyboardShortcuts?: Record<string, string>;
  notificationSettings?: NotificationSettings;
  aiEnabled: boolean;
  analyticsEnabled: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: OrganisationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationSettings {
  allowedModules?: string[];
  blockedModules?: string[];
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  dataResidency: 'global' | 'eu' | 'us';
  customBranding?: {
    primaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
  };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

// ============================================================
// FILE SYSTEM TYPES
// ============================================================

export type FilePermission = 'read' | 'write' | 'execute';
export type FileType = 'file' | 'directory' | 'symlink';

export interface FileSystemNode {
  id: string;
  name: string;
  path: string;
  type: FileType;
  mimeType?: string;
  size: number;
  ownerId: string;
  organisationId: string;
  permissions: FilePermissions;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface FilePermissions {
  owner: FilePermission[];
  group: FilePermission[];
  world: FilePermission[];
  acl?: ACLEntry[];
}

export interface ACLEntry {
  principalId: string;
  principalType: 'user' | 'group' | 'role';
  permissions: FilePermission[];
}

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  size: number;
  storageKey: string;
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

// ============================================================
// MODULE / APPLICATION TYPES
// ============================================================

export type ModuleCategory =
  | 'productivity'
  | 'development'
  | 'communication'
  | 'media'
  | 'utilities'
  | 'security'
  | 'ai'
  | 'finance'
  | 'education'
  | 'games';

export type ModulePermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'filesystem:delete'
  | 'network:fetch'
  | 'notifications:send'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'camera:access'
  | 'microphone:access'
  | 'location:access'
  | 'users:read'
  | 'ai:access';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl?: string;
  iconUrl: string;
  entryPoint: string;
  category: ModuleCategory;
  permissions: ModulePermission[];
  minKernelVersion: string;
  dependencies?: Record<string, string>;
  keywords?: string[];
  screenshots?: string[];
  changelog?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  isBuiltIn?: boolean;
  isSandboxed?: boolean;
}

export interface InstalledModule {
  id: string;
  manifestId: string;
  manifest: ModuleManifest;
  installedAt: string;
  installedBy: string;
  organisationId: string;
  userId?: string;
  grantedPermissions: ModulePermission[];
  isEnabled: boolean;
  settings?: Record<string, unknown>;
}

export interface AppStoreListing {
  id: string;
  manifest: ModuleManifest;
  publishedAt: string;
  updatedAt: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
}

// ============================================================
// KERNEL / IPC TYPES
// ============================================================

export interface KernelProcess {
  pid: string;
  moduleId: string;
  status: 'initialising' | 'running' | 'suspended' | 'terminated';
  startedAt: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface IPCMessage<T = unknown> {
  id: string;
  from: string;
  to: string | 'broadcast';
  type: string;
  payload: T;
  timestamp: number;
  replyTo?: string;
}

export interface KernelEvent {
  type: KernelEventType;
  payload: unknown;
  timestamp: number;
  source: string;
}

export type KernelEventType =
  | 'user:login'
  | 'user:logout'
  | 'module:installed'
  | 'module:uninstalled'
  | 'module:started'
  | 'module:stopped'
  | 'file:created'
  | 'file:updated'
  | 'file:deleted'
  | 'permission:granted'
  | 'permission:revoked'
  | 'notification:received'
  | 'system:alert'
  | 'system:update';

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export type NotificationChannel = 'in-app' | 'push' | 'email';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  iconUrl?: string;
  actionUrl?: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  readAt?: string;
  createdAt: string;
  expiresAt?: string;
  sourceModule?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationSettings {
  inApp: boolean;
  push: boolean;
  email: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  allowedModules?: string[];
  blockedModules?: string[];
}

// ============================================================
// UI / SHELL TYPES
// ============================================================

export interface Window {
  id: string;
  moduleId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimised: boolean;
  isMaximised: boolean;
  isFocused: boolean;
  zIndex: number;
}

export interface WidgetLayout {
  id: string;
  widgetType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  type: 'file' | 'module' | 'user' | 'setting' | 'content';
  title: string;
  description?: string;
  iconUrl?: string;
  path?: string;
  moduleId?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    cursor?: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

// ============================================================
// AUDIT & COMPLIANCE TYPES
// ============================================================

export interface AuditLog {
  id: string;
  userId: string;
  organisationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: 'analytics' | 'marketing' | 'ai' | 'data-processing';
  granted: boolean;
  version: string;
  grantedAt: string;
  revokedAt?: string;
  ipAddress?: string;
}