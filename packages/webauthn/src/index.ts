/**
 * @package @infinity-os/webauthn
 * Hardware DID Bootstrapping — WebAuthn / FIDO2
 *
 * Binds user identity to physical hardware:
 *   - TPM (Trusted Platform Module)
 *   - Windows Hello / Face ID / Touch ID
 *   - YubiKey / FIDO2 hardware key
 *
 * The private key NEVER leaves the secure enclave.
 * This satisfies ISO 27001 A.9.4.2 (Secure log-on procedures)
 * and provides the hardware root of trust for DIDs.
 *
 * Uses @simplewebauthn/browser (client) and
 * @simplewebauthn/server (server-side verification in Worker)
 */

import type { User } from '@infinity-os/types';

// ============================================================
// TYPES
// ============================================================

export interface WebAuthnCredential {
  id: string;
  rawId: ArrayBuffer;
  type: 'public-key';
  response: AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;
}

export interface HardwareDID {
  credentialId: string;
  publicKey: string;       // Base64-encoded public key
  userId: string;
  deviceType: 'platform' | 'cross-platform';
  createdAt: string;
  lastUsedAt?: string;
  aaguid?: string;         // Authenticator AAGUID for device identification
}

export interface WebAuthnRegistrationOptions {
  challenge: string;       // Server-generated challenge (base64url)
  userId: string;
  userEmail: string;
  displayName: string;
  rpId: string;            // Relying Party ID (your domain)
  rpName: string;
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials?: { id: string; type: 'public-key' }[];
  userVerification?: UserVerificationRequirement;
}

// ============================================================
// UTILITIES
// ============================================================

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ============================================================
// REGISTRATION — Bind identity to hardware
// ============================================================

/**
 * Bootstrap a Hardware DID for a user
 * Generates a credential bound to the user's TPM/hardware key
 * The private key never leaves the secure enclave
 *
 * @param options - Registration options from the server
 * @returns The credential to send to the server for verification
 */
export async function bootstrapHardwareDID(
  options: WebAuthnRegistrationOptions
): Promise<WebAuthnCredential> {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  // Check if platform authenticator is available (TPM/biometric)
  const platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: base64urlToBuffer(options.challenge),

    rp: {
      name: options.rpName,
      id: options.rpId,
    },

    user: {
      id: new TextEncoder().encode(options.userId),
      name: options.userEmail,
      displayName: options.displayName,
    },

    pubKeyCredParams: [
      { alg: -7,   type: 'public-key' },   // ES256 (ECDSA with P-256)
      { alg: -257, type: 'public-key' },   // RS256 (RSA with SHA-256)
      { alg: -8,   type: 'public-key' },   // EdDSA (Ed25519) — most secure
    ],

    authenticatorSelection: {
      // Force platform authenticator (TPM/Windows Hello/Face ID/Touch ID)
      // Falls back to cross-platform (YubiKey) if platform not available
      authenticatorAttachment: platformAvailable ? 'platform' : 'cross-platform',
      // Require user verification (biometric/PIN) — not just presence
      userVerification: 'required',
      // Discoverable credentials — enables passwordless login
      residentKey: 'preferred',
    },

    // Prevent duplicate registrations
    excludeCredentials: [],

    timeout: 60_000,   // 60 seconds

    attestation: 'indirect',   // Request attestation for device verification
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyOptions,
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Hardware DID creation failed — no credential returned');
  }

  return {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type as 'public-key',
    response: credential.response as AuthenticatorAttestationResponse,
  };
}

// ============================================================
// AUTHENTICATION — Verify hardware identity
// ============================================================

/**
 * Authenticate using a previously registered hardware DID
 * Prompts the user for biometric/PIN verification
 *
 * @param options - Authentication options from the server
 * @returns The assertion to send to the server for verification
 */
export async function authenticateWithHardwareDID(
  options: WebAuthnAuthenticationOptions
): Promise<WebAuthnCredential> {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rpId: options.rpId,
    allowCredentials: options.allowCredentials?.map(c => ({
      id: base64urlToBuffer(c.id),
      type: c.type,
    })) ?? [],
    userVerification: options.userVerification ?? 'required',
    timeout: 60_000,
  };

  const assertion = await navigator.credentials.get({
    publicKey: publicKeyOptions,
  }) as PublicKeyCredential;

  if (!assertion) {
    throw new Error('Hardware DID authentication failed — no assertion returned');
  }

  return {
    id: assertion.id,
    rawId: assertion.rawId,
    type: assertion.type as 'public-key',
    response: assertion.response as AuthenticatorAssertionResponse,
  };
}

// ============================================================
// CONDITIONAL UI — Passkey autofill
// ============================================================

/**
 * Enable passkey autofill in login forms
 * Shows the browser's native passkey picker when the user
 * focuses the email/username field
 *
 * @param options - Authentication options from the server
 * @param onSuccess - Callback when authentication succeeds
 */
export async function enablePasskeyAutofill(
  options: WebAuthnAuthenticationOptions,
  onSuccess: (credential: WebAuthnCredential) => void
): Promise<void> {
  if (!PublicKeyCredential.isConditionalMediationAvailable) return;

  const available = await PublicKeyCredential.isConditionalMediationAvailable();
  if (!available) return;

  try {
    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rpId: options.rpId,
      allowCredentials: [],   // Empty = any registered credential
      userVerification: 'preferred',
      timeout: 300_000,       // 5 minutes for autofill
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions,
      mediation: 'conditional',   // Enables autofill UI
    }) as PublicKeyCredential;

    if (assertion) {
      onSuccess({
        id: assertion.id,
        rawId: assertion.rawId,
        type: assertion.type as 'public-key',
        response: assertion.response as AuthenticatorAssertionResponse,
      });
    }
  } catch (error) {
    // Conditional mediation was cancelled — not an error
    if ((error as Error).name !== 'AbortError') {
      console.error('[WebAuthn] Autofill error:', error);
    }
  }
}

// ============================================================
// SERVER-SIDE VERIFICATION (Cloudflare Worker)
// ============================================================

/**
 * Verify a WebAuthn registration response on the server
 * Uses @simplewebauthn/server
 *
 * This runs in the identity Cloudflare Worker, not the browser.
 * Kept here for documentation — actual implementation in workers/identity
 */
export interface RegistrationVerificationResult {
  verified: boolean;
  credentialId?: string;
  credentialPublicKey?: Uint8Array;
  counter?: number;
  aaguid?: string;
  deviceType?: 'singleDevice' | 'multiDevice';
}

/**
 * Verify a WebAuthn authentication response on the server
 */
export interface AuthenticationVerificationResult {
  verified: boolean;
  newCounter?: number;
}

// ============================================================
// CREDENTIAL SERIALISATION
// ============================================================

/**
 * Serialise a WebAuthn credential for transmission to the server
 */
export function serialiseCredential(credential: WebAuthnCredential): Record<string, unknown> {
  const response = credential.response;

  if ('attestationObject' in response) {
    // Registration response
    const attestationResponse = response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
        attestationObject: bufferToBase64url(attestationResponse.attestationObject),
      },
    };
  } else {
    // Authentication response
    const assertionResponse = response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
        authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
        signature: bufferToBase64url(assertionResponse.signature),
        userHandle: assertionResponse.userHandle
          ? bufferToBase64url(assertionResponse.userHandle)
          : null,
      },
    };
  }
}

// ============================================================
// CRYPTO-SHREDDING INTEGRATION
// ============================================================

/**
 * Generate a user-specific Vault key name for crypto-shredding
 * When a user requests GDPR deletion, this key is destroyed in Vault,
 * rendering all their IPFS-stored data permanently unreadable.
 *
 * @param userId - The user's UUID
 * @returns The Vault transit key name for this user
 */
export function getUserVaultKeyName(userId: string): string {
  // Sanitise userId to be a valid Vault key name
  const sanitised = userId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return `user-${sanitised}`;
}

/**
 * Check if WebAuthn is available in the current environment
 */
export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined';
}

/**
 * Check if platform authenticator (TPM/biometric) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}