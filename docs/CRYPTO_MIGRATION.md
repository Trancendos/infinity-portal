# Crypto Migration Plan — Infinity OS

**Version:** 1.0  
**ISO 27001:** A.10.1 — Cryptographic controls  
**Last Updated:** 2025-01-09  
**Status:** Planning

---

## Executive Summary

This document provides a phased migration plan from current cryptographic primitives to post-quantum cryptography (PQC), aligned with the Trancendos 2060 roadmap and NIST PQC standardisation timeline.

---

## Current Cryptographic Inventory

| Component | Algorithm | Key Size | Location | Quantum Safe? |
|-----------|-----------|----------|----------|---------------|
| **TLS Certificates** | RSA-2048 / ECDSA P-256 | 2048/256 bit | Let's Encrypt / Cloudflare | ❌ No |
| **JWT Signing** | HMAC-SHA256 | 256 bit (symmetric) | `backend/auth.py` | ✅ Yes (symmetric) |
| **Vault Transit** | AES-256-GCM96 | 256 bit | `infrastructure/vault/config.hcl` | ✅ Yes (symmetric) |
| **Vault Unseal** | Shamir's Secret Sharing | 256 bit | Vault init | ⚠️ Partial |
| **Password Hashing** | bcrypt | cost=12 | `workers/identity/src/index.ts` | ✅ Yes |
| **WebAuthn** | ECDSA P-256 / Ed25519 | 256 bit | `packages/webauthn/src/index.ts` | ❌ No |
| **File Encryption** | AES-256-GCM | 256 bit | Backend file router | ✅ Yes (symmetric) |
| **IPFS Swarm Key** | AES-256 (PSK) | 256 bit | `scripts/deploy.sh` | ✅ Yes (symmetric) |
| **Agent mTLS** | ECDSA P-256 | 256 bit | `packages/agent-sdk/` | ❌ No |
| **API Key Hashing** | SHA-256 | 256 bit | Backend auth | ✅ Yes |
| **CORS/CSP Nonces** | CSPRNG | 128 bit | `backend/main.py` | ✅ Yes |

### Risk Assessment

| Risk Level | Components | Count |
|------------|-----------|-------|
| 🔴 **High** (asymmetric, quantum-vulnerable) | TLS, WebAuthn, Agent mTLS | 3 |
| 🟡 **Medium** (needs monitoring) | Vault unseal | 1 |
| 🟢 **Low** (symmetric, quantum-safe) | JWT, Vault Transit, File Encryption, Passwords, IPFS | 7 |

---

## Migration Phases

### Phase 1: Inventory & Preparation (2025 — Current)

**Status:** ✅ In Progress

**Actions:**
- [x] Complete cryptographic inventory (this document)
- [x] Identify quantum-vulnerable components
- [ ] Establish crypto-agility in code (abstraction layers)
- [ ] Monitor NIST PQC standardisation progress
- [ ] Evaluate hybrid TLS support in Cloudflare

**Crypto-Agility Pattern:**
```python
# backend/crypto.py — Abstraction layer for crypto operations
from enum import Enum

class CryptoAlgorithm(Enum):
    # Current
    AES_256_GCM = "aes-256-gcm"
    ECDSA_P256 = "ecdsa-p256"
    RSA_2048 = "rsa-2048"
    # Future PQC
    KYBER_768 = "kyber-768"
    DILITHIUM_3 = "dilithium-3"
    FALCON_512 = "falcon-512"

class CryptoProvider:
    """Pluggable crypto provider — swap algorithms without code changes."""

    def __init__(self, signing_algo: CryptoAlgorithm, kex_algo: CryptoAlgorithm):
        self.signing_algo = signing_algo
        self.kex_algo = kex_algo

    def sign(self, data: bytes) -> bytes:
        # Dispatch to appropriate algorithm
        ...

    def verify(self, data: bytes, signature: bytes) -> bool:
        ...

    def key_exchange(self, peer_public: bytes) -> bytes:
        ...
```

---

### Phase 2: Hybrid Cryptography (2026–2028)

**Goal:** Run classical + PQC algorithms in parallel for all asymmetric operations.

**Actions:**
- [ ] Implement hybrid TLS: X25519 + Kyber768 (draft-ietf-tls-hybrid-design)
- [ ] Upgrade WebAuthn to support hybrid signatures (ECDSA + Dilithium)
- [ ] Vault Transit: Add Kyber KEM alongside existing AES-256-GCM
- [ ] Agent mTLS: Hybrid certificates (ECDSA + Dilithium)
- [ ] JWT signing: Migrate to ES256K (secp256k1) as bridge step

**TLS Configuration (when Cloudflare supports):**
```yaml
# infrastructure/cloudflare/tls-hybrid.yml
tls:
  min_version: "1.3"
  cipher_suites:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
  key_exchange:
    - X25519Kyber768  # Hybrid: classical + PQC
    - X25519           # Fallback: classical only
```

**Timeline:**
- 2026 Q1: Implement crypto-agility abstraction layer
- 2026 Q3: Enable hybrid TLS (if Cloudflare supports)
- 2027 Q1: Hybrid WebAuthn signatures
- 2027 Q3: Hybrid agent mTLS
- 2028 Q1: Full hybrid coverage verified

---

### Phase 3: Pure Post-Quantum (2029–2031)

**Goal:** Migrate all asymmetric operations to pure PQC algorithms.

**Actions:**
- [ ] TLS certificates: Pure Dilithium5 signatures
- [ ] WebAuthn: Pure Falcon-512 or Dilithium3 signatures
- [ ] JWT: Falcon-512 signatures (if standardised) or Dilithium3
- [ ] Agent mTLS: Pure Dilithium3 certificates
- [ ] Vault: Default to Kyber for all key encapsulation

**Algorithm Selection:**

| Use Case | Algorithm | NIST Standard | Key Size | Signature Size |
|----------|-----------|---------------|----------|----------------|
| **Digital Signatures** | ML-DSA (Dilithium3) | FIPS 204 | 1.3 KB | 2.4 KB |
| **Key Encapsulation** | ML-KEM (Kyber768) | FIPS 203 | 1.2 KB | 1.1 KB |
| **Hash Signatures** | SLH-DSA (SPHINCS+) | FIPS 205 | 32 B | 7.9 KB |
| **Lightweight Sigs** | FN-DSA (Falcon-512) | Draft | 0.9 KB | 0.7 KB |

---

### Phase 4: Quantum Key Distribution Pilot (2032+)

**Goal:** Evaluate QKD for highest-security channels.

**Actions:**
- [ ] Evaluate QKD hardware vendors (Toshiba, ID Quantique, Thales)
- [ ] Pilot QKD for Vault-to-Vault communication
- [ ] Assess QKD-as-a-Service offerings
- [ ] Maintain PQC fallback where QKD unavailable

---

## Monitoring & Compliance

### Crypto Health Dashboard

Monitor via Prometheus/Grafana:

```promql
# Track algorithm usage across services
infinity_os_crypto_operations_total{algorithm="ecdsa-p256"}
infinity_os_crypto_operations_total{algorithm="dilithium-3"}

# Alert on deprecated algorithm usage after migration deadline
infinity_os_crypto_deprecated_usage_total > 0
```

### Compliance Mapping

| Standard | Requirement | Current Status |
|----------|------------|----------------|
| **ISO 27001 A.10.1** | Cryptographic controls policy | ✅ This document |
| **GDPR Art. 32** | Encryption of personal data | ✅ AES-256-GCM |
| **SOC 2 CC6.1** | Logical access security | ✅ JWT + WebAuthn |
| **NIST SP 800-131A** | Transitioning crypto algorithms | ⚠️ In progress |
| **EU AI Act** | Security of AI systems | ✅ Agent mTLS |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-09 | Created crypto migration plan | Proactive PQC readiness |
| 2025-01-09 | Prioritise crypto-agility over immediate PQC | PQC standards still maturing |
| 2025-01-09 | Keep symmetric algorithms (AES-256) | Already quantum-safe |
| 2025-01-09 | Target hybrid by 2028 | Aligns with NIST timeline |

---

## References

- [NIST Post-Quantum Cryptography](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [FIPS 203 — ML-KEM (Kyber)](https://csrc.nist.gov/pubs/fips/203/final)
- [FIPS 204 — ML-DSA (Dilithium)](https://csrc.nist.gov/pubs/fips/204/final)
- [FIPS 205 — SLH-DSA (SPHINCS+)](https://csrc.nist.gov/pubs/fips/205/final)
- [Cloudflare PQC Support](https://blog.cloudflare.com/post-quantum-for-all/)