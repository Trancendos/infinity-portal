// ============================================================
// Infinity OS — Deterministic AI Policy Engine
// Written in Rust, compiled to WebAssembly
//
// This is the GATEKEEPER — the deterministic enforcer that
// sits between AI recommendations and actual system actions.
//
// The AI can SUGGEST. This module DECIDES.
// No neural network makes security decisions here.
//
// ISO 27001: A.8.16 Monitoring, A.9.4 Access control
// Zero Trust: Every AI action is validated before execution
//
// Compile to WASM:
//   cargo build --target wasm32-unknown-unknown --release
//   wasm-pack build --target web
// ============================================================

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================
// TYPES
// ============================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiRequest {
    /// The action the AI wants to perform
    pub action: String,
    /// The resource being targeted
    pub target_resource: String,
    /// Risk score 0-100 (AI-calculated)
    pub risk_score: u8,
    /// The module requesting the action
    pub requesting_module: String,
    /// User ID context
    pub user_id: Option<String>,
    /// Organisation ID context
    pub organisation_id: Option<String>,
    /// Additional metadata
    pub metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PolicyDecision {
    /// Whether the action is permitted
    pub permitted: bool,
    /// The policy rule that was applied
    pub applied_rule: String,
    /// Human-readable reason
    pub reason: String,
    /// ISO 27001 control reference
    pub iso_control: String,
    /// Timestamp (Unix ms — caller provides)
    pub timestamp_ms: u64,
    /// Whether this decision should be audited
    pub audit_required: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SecurityContext {
    /// Current user's role
    pub user_role: String,
    /// Whether MFA has been verified in this session
    pub mfa_verified: bool,
    /// Session age in seconds
    pub session_age_seconds: u64,
    /// Whether the request comes from a trusted network
    pub trusted_network: bool,
    /// Number of failed attempts in last hour
    pub failed_attempts_last_hour: u32,
}

// ============================================================
// POLICY CONSTANTS
// ============================================================

/// Maximum risk score allowed for any AI action
const MAX_RISK_SCORE: u8 = 50;

/// Maximum session age for sensitive operations (15 minutes)
const MAX_SESSION_AGE_SENSITIVE: u64 = 900;

/// Maximum failed attempts before lockout
const MAX_FAILED_ATTEMPTS: u32 = 5;

// ============================================================
// ALLOWED ACTIONS — Hardcoded whitelist
// The AI can ONLY perform actions in this list.
// Default deny: anything not listed is BLOCKED.
// ============================================================

const ALLOWED_READ_ACTIONS: &[&str] = &[
    "read_public_cache",
    "read_user_preferences",
    "read_module_config",
    "read_notification_settings",
    "read_search_index",
    "read_file_metadata",
    "read_app_store_listings",
    "read_system_metrics",
];

const ALLOWED_WRITE_ACTIONS: &[&str] = &[
    "write_user_preferences",
    "write_notification",
    "write_search_index",
    "write_ai_suggestion",
    "write_analytics_event",
    "adjust_ui_theme",
    "prefetch_module",
    "cache_file_metadata",
];

const ALLOWED_SYSTEM_ACTIONS: &[&str] = &[
    "schedule_background_task",
    "clear_expired_cache",
    "compress_old_logs",
    "send_notification",
    "update_search_ranking",
];

/// Actions that are ALWAYS blocked regardless of context
const BLOCKED_ACTIONS: &[&str] = &[
    "modify_kernel_scheduler",
    "modify_security_policy",
    "delete_user_data",
    "modify_user_permissions",
    "access_other_user_files",
    "modify_audit_logs",
    "disable_mfa",
    "modify_encryption_keys",
    "access_vault_secrets",
    "modify_rbac_roles",
    "execute_arbitrary_code",
    "modify_network_config",
    "access_admin_panel",
    "modify_compliance_settings",
];

// ============================================================
// CORE POLICY ENGINE
// ============================================================

/// Main policy validation function
/// Called by the AI orchestration layer before any action
#[wasm_bindgen]
pub fn validate_ai_action(
    request_json: &str,
    context_json: &str,
    timestamp_ms: u64,
) -> String {
    // Parse request — fail closed on bad JSON
    let request: AiRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => {
            return serde_json::to_string(&PolicyDecision {
                permitted: false,
                applied_rule: "PARSE_ERROR".to_string(),
                reason: format!("Invalid request JSON: {}", e),
                iso_control: "A.8.16".to_string(),
                timestamp_ms,
                audit_required: true,
            }).unwrap_or_default();
        }
    };

    // Parse security context — fail closed on bad JSON
    let context: SecurityContext = match serde_json::from_str(context_json) {
        Ok(c) => c,
        Err(e) => {
            return serde_json::to_string(&PolicyDecision {
                permitted: false,
                applied_rule: "PARSE_ERROR".to_string(),
                reason: format!("Invalid context JSON: {}", e),
                iso_control: "A.8.16".to_string(),
                timestamp_ms,
                audit_required: true,
            }).unwrap_or_default();
        }
    };

    let decision = evaluate_policy(&request, &context, timestamp_ms);
    serde_json::to_string(&decision).unwrap_or_default()
}

/// Evaluate the policy — pure deterministic logic
fn evaluate_policy(
    request: &AiRequest,
    context: &SecurityContext,
    timestamp_ms: u64,
) -> PolicyDecision {

    // --------------------------------------------------------
    // RULE 1: Hard block — always denied actions
    // --------------------------------------------------------
    if BLOCKED_ACTIONS.contains(&request.action.as_str()) {
        return PolicyDecision {
            permitted: false,
            applied_rule: "HARD_BLOCK".to_string(),
            reason: format!(
                "Action '{}' is permanently blocked. AI cannot modify security-critical resources.",
                request.action
            ),
            iso_control: "A.9.4.1".to_string(),
            timestamp_ms,
            audit_required: true,
        };
    }

    // --------------------------------------------------------
    // RULE 2: Risk score threshold
    // --------------------------------------------------------
    if request.risk_score > MAX_RISK_SCORE {
        return PolicyDecision {
            permitted: false,
            applied_rule: "RISK_SCORE_EXCEEDED".to_string(),
            reason: format!(
                "Risk score {} exceeds maximum allowed {}. Human review required.",
                request.risk_score, MAX_RISK_SCORE
            ),
            iso_control: "A.8.16".to_string(),
            timestamp_ms,
            audit_required: true,
        };
    }

    // --------------------------------------------------------
    // RULE 3: Account lockout check
    // --------------------------------------------------------
    if context.failed_attempts_last_hour >= MAX_FAILED_ATTEMPTS {
        return PolicyDecision {
            permitted: false,
            applied_rule: "ACCOUNT_LOCKOUT".to_string(),
            reason: format!(
                "Too many failed attempts ({}/{}). Account temporarily locked.",
                context.failed_attempts_last_hour, MAX_FAILED_ATTEMPTS
            ),
            iso_control: "A.9.4.3".to_string(),
            timestamp_ms,
            audit_required: true,
        };
    }

    // --------------------------------------------------------
    // RULE 4: Session age check for sensitive operations
    // --------------------------------------------------------
    let is_write = ALLOWED_WRITE_ACTIONS.contains(&request.action.as_str())
        || ALLOWED_SYSTEM_ACTIONS.contains(&request.action.as_str());

    if is_write && context.session_age_seconds > MAX_SESSION_AGE_SENSITIVE {
        return PolicyDecision {
            permitted: false,
            applied_rule: "SESSION_EXPIRED".to_string(),
            reason: format!(
                "Session age {}s exceeds {}s limit for write operations. Re-authentication required.",
                context.session_age_seconds, MAX_SESSION_AGE_SENSITIVE
            ),
            iso_control: "A.9.4.2".to_string(),
            timestamp_ms,
            audit_required: false,
        };
    }

    // --------------------------------------------------------
    // RULE 5: MFA required for system actions
    // --------------------------------------------------------
    if ALLOWED_SYSTEM_ACTIONS.contains(&request.action.as_str()) && !context.mfa_verified {
        return PolicyDecision {
            permitted: false,
            applied_rule: "MFA_REQUIRED".to_string(),
            reason: "System-level actions require MFA verification.".to_string(),
            iso_control: "A.9.4.2".to_string(),
            timestamp_ms,
            audit_required: false,
        };
    }

    // --------------------------------------------------------
    // RULE 6: Role-based action restrictions
    // --------------------------------------------------------
    if context.user_role == "user" && ALLOWED_SYSTEM_ACTIONS.contains(&request.action.as_str()) {
        return PolicyDecision {
            permitted: false,
            applied_rule: "INSUFFICIENT_ROLE".to_string(),
            reason: format!(
                "Role '{}' cannot perform system actions. Requires 'power_user' or higher.",
                context.user_role
            ),
            iso_control: "A.9.2.3".to_string(),
            timestamp_ms,
            audit_required: false,
        };
    }

    // --------------------------------------------------------
    // RULE 7: Whitelist check — default deny
    // --------------------------------------------------------
    let is_allowed = ALLOWED_READ_ACTIONS.contains(&request.action.as_str())
        || ALLOWED_WRITE_ACTIONS.contains(&request.action.as_str())
        || ALLOWED_SYSTEM_ACTIONS.contains(&request.action.as_str());

    if !is_allowed {
        return PolicyDecision {
            permitted: false,
            applied_rule: "NOT_IN_WHITELIST".to_string(),
            reason: format!(
                "Action '{}' is not in the permitted actions whitelist. Default deny.",
                request.action
            ),
            iso_control: "A.9.4.1".to_string(),
            timestamp_ms,
            audit_required: true,
        };
    }

    // --------------------------------------------------------
    // PERMITTED — all rules passed
    // --------------------------------------------------------
    PolicyDecision {
        permitted: true,
        applied_rule: "WHITELIST_APPROVED".to_string(),
        reason: format!(
            "Action '{}' approved. Risk score: {}/{}.",
            request.action, request.risk_score, MAX_RISK_SCORE
        ),
        iso_control: "A.9.4.1".to_string(),
        timestamp_ms,
        audit_required: request.risk_score > 30,   // Audit medium-risk actions
    }
}

// ============================================================
// CRYPTO-SHREDDING HELPERS
// ============================================================

/// Validate a GDPR deletion request
/// Returns true if the deletion is valid and should proceed
#[wasm_bindgen]
pub fn validate_gdpr_deletion(
    user_id: &str,
    requesting_user_id: &str,
    requester_role: &str,
    timestamp_ms: u64,
) -> String {
    #[derive(Serialize)]
    struct DeletionDecision {
        permitted: bool,
        reason: String,
        action: String,
        iso_control: String,
        gdpr_article: String,
        timestamp_ms: u64,
    }

    // Only the user themselves or an admin can request deletion
    let permitted = user_id == requesting_user_id
        || requester_role == "org_admin"
        || requester_role == "super_admin";

    let decision = DeletionDecision {
        permitted,
        reason: if permitted {
            "GDPR deletion request validated. Proceed with crypto-shredding.".to_string()
        } else {
            "Deletion request denied: requester is not the data subject or an authorised admin.".to_string()
        },
        action: if permitted {
            "DELETE_VAULT_KEY".to_string()
        } else {
            "DENY".to_string()
        },
        iso_control: "A.8.3".to_string(),
        gdpr_article: "Article 17 — Right to erasure".to_string(),
        timestamp_ms,
    };

    serde_json::to_string(&decision).unwrap_or_default()
}

// ============================================================
// TESTS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_context(role: &str, mfa: bool, risk: u8) -> (AiRequest, SecurityContext) {
        let req = AiRequest {
            action: "read_public_cache".to_string(),
            target_resource: "cache:public".to_string(),
            risk_score: risk,
            requesting_module: "com.infinity-os.shell".to_string(),
            user_id: Some("user-123".to_string()),
            organisation_id: Some("org-456".to_string()),
            metadata: None,
        };
        let ctx = SecurityContext {
            user_role: role.to_string(),
            mfa_verified: mfa,
            session_age_seconds: 300,
            trusted_network: true,
            failed_attempts_last_hour: 0,
        };
        (req, ctx)
    }

    #[test]
    fn test_allowed_read_action() {
        let (req, ctx) = make_context("user", false, 10);
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(decision.permitted);
    }

    #[test]
    fn test_blocked_action_always_denied() {
        let (mut req, ctx) = make_context("super_admin", true, 0);
        req.action = "modify_kernel_scheduler".to_string();
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(!decision.permitted);
        assert_eq!(decision.applied_rule, "HARD_BLOCK");
    }

    #[test]
    fn test_high_risk_score_denied() {
        let (mut req, ctx) = make_context("user", false, 75);
        req.action = "read_public_cache".to_string();
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(!decision.permitted);
        assert_eq!(decision.applied_rule, "RISK_SCORE_EXCEEDED");
    }

    #[test]
    fn test_unknown_action_denied() {
        let (mut req, ctx) = make_context("super_admin", true, 0);
        req.action = "some_unknown_action".to_string();
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(!decision.permitted);
        assert_eq!(decision.applied_rule, "NOT_IN_WHITELIST");
    }

    #[test]
    fn test_system_action_requires_mfa() {
        let (mut req, ctx) = make_context("power_user", false, 10);
        req.action = "schedule_background_task".to_string();
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(!decision.permitted);
        assert_eq!(decision.applied_rule, "MFA_REQUIRED");
    }

    #[test]
    fn test_account_lockout() {
        let (req, mut ctx) = make_context("user", false, 10);
        ctx.failed_attempts_last_hour = 10;
        let decision = evaluate_policy(&req, &ctx, 0);
        assert!(!decision.permitted);
        assert_eq!(decision.applied_rule, "ACCOUNT_LOCKOUT");
    }

    #[test]
    fn test_gdpr_deletion_self() {
        let result = validate_gdpr_deletion("user-123", "user-123", "user", 0);
        let decision: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(decision["permitted"], true);
    }

    #[test]
    fn test_gdpr_deletion_unauthorized() {
        let result = validate_gdpr_deletion("user-123", "user-456", "user", 0);
        let decision: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(decision["permitted"], false);
    }
}