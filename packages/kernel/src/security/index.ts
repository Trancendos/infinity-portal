/**
 * Security Module
 * 
 * Production-grade security infrastructure for Infinity Portal.
 */

export {
  SecurityMiddleware,
  HeaderSecurity,
  InputSanitizer,
  AuditLogger,
  ApiKeyManager,
  defaultSecurityConfig,
  type SecurityConfig,
  type SecurityHeaders,
  type CorsConfig,
  type SecurityAuditEntry,
  type SecurityEventSeverity,
  type ApiKey,
  type ApiKeyStatus,
  type SanitizationResult,
  type ValidationResult,
  type SecurityEvent,
} from './security-middleware';