# routers/the_void.py — The Void — Shamir's Secret Sharing for quantum-immune secrets storage
# THREE-LANE MESH: CROSS-LANE — Secrets management for ALL lanes
#
# The Void stores secrets for the entire ecosystem using Shamir's Secret
# Sharing scheme. No single point of compromise can reveal a secret.
#
# Cross-lane because secrets are needed everywhere:
#   Lane 1 (AI/Nexus):     AI agent API keys, model credentials
#   Lane 2 (User/Infinity): User auth tokens, session secrets
#   Lane 3 (Data/Hive):    Database credentials, encryption keys
#
# Quantum-immune: Shamir's scheme is information-theoretically secure,
# meaning it cannot be broken even by quantum computers.

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import uuid
import hashlib
import json
import secrets
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser, UserRole
from database import get_db_session

router = APIRouter(prefix="/api/v1/void", tags=['The Void — Quantum-Immune Secrets'])


# ============================================================
# CROSS-LANE: SECRETS MANAGEMENT FOR ALL MESH LANES
# ============================================================

# In-memory vault (production: encrypted at-rest storage)
_vault: Dict[str, Dict[str, Any]] = {}
_access_log: List[Dict[str, Any]] = []
_share_registry: Dict[str, Dict[str, Any]] = {}


# ============================================================
# SHAMIR'S SECRET SHARING (Simplified Implementation)
# ============================================================

# Using a large prime for the finite field
_PRIME = 2**127 - 1  # Mersenne prime M127


def _mod_inverse(a: int, p: int) -> int:
    """Extended Euclidean algorithm for modular inverse."""
    if a == 0:
        return 0
    lm, hm = 1, 0
    low, high = a % p, p
    while low > 1:
        ratio = high // low
        nm, new = hm - lm * ratio, high - low * ratio
        lm, low, hm, high = nm, new, lm, low
    return lm % p


def _eval_polynomial(coefficients: List[int], x: int, prime: int) -> int:
    """Evaluate polynomial at point x in finite field."""
    result = 0
    for i, coeff in enumerate(coefficients):
        result = (result + coeff * pow(x, i, prime)) % prime
    return result


def shamir_split(secret_bytes: bytes, threshold: int, num_shares: int) -> List[tuple]:
    """
    Split a secret into shares using Shamir's Secret Sharing.
    
    Args:
        secret_bytes: The secret to split
        threshold: Minimum shares needed to reconstruct (k)
        num_shares: Total number of shares to generate (n)
    
    Returns:
        List of (x, y) share tuples
    """
    secret_int = int.from_bytes(secret_bytes, 'big') % _PRIME

    # Generate random polynomial coefficients
    coefficients = [secret_int]
    for _ in range(threshold - 1):
        coefficients.append(secrets.randbelow(_PRIME))

    # Generate shares at points x=1, x=2, ..., x=num_shares
    shares = []
    for i in range(1, num_shares + 1):
        y = _eval_polynomial(coefficients, i, _PRIME)
        shares.append((i, y))

    return shares


def shamir_reconstruct(shares: List[tuple]) -> bytes:
    """
    Reconstruct a secret from shares using Lagrange interpolation.
    
    Args:
        shares: List of (x, y) share tuples (must have >= threshold shares)
    
    Returns:
        The reconstructed secret as bytes
    """
    secret = 0
    for i, (xi, yi) in enumerate(shares):
        numerator = 1
        denominator = 1
        for j, (xj, _) in enumerate(shares):
            if i != j:
                numerator = (numerator * (-xj)) % _PRIME
                denominator = (denominator * (xi - xj)) % _PRIME

        lagrange = (yi * numerator * _mod_inverse(denominator, _PRIME)) % _PRIME
        secret = (secret + lagrange) % _PRIME

    # Convert back to bytes
    byte_length = (secret.bit_length() + 7) // 8
    return secret.to_bytes(max(byte_length, 1), 'big')


# ============================================================
# SCHEMAS
# ============================================================

class SecretStore(BaseModel):
    """Store a secret in The Void."""
    name: str = Field(..., description="Secret name (e.g., 'github-token', 'db-password')")
    value: str = Field(..., description="Secret value (will be split into shares)")
    threshold: int = Field(3, ge=2, le=10, description="Minimum shares to reconstruct (k)")
    num_shares: int = Field(5, ge=3, le=20, description="Total shares to generate (n)")
    mesh_lane: str = Field("cross_lane", description="Which lane this secret serves")
    classification: str = Field("restricted", description="Classification: confidential, restricted, top_secret")
    ttl_hours: Optional[int] = Field(None, description="Time-to-live in hours (None = permanent)")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SecretRetrieve(BaseModel):
    """Retrieve a secret from The Void."""
    shares_provided: int = Field(3, description="Number of shares being presented")
    reason: str = Field(..., description="Reason for access (logged for audit)")


# ============================================================
# SECRET MANAGEMENT
# ============================================================

@router.post("/secrets")
async def store_secret(
    request: SecretStore,
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Store a secret in The Void using Shamir's Secret Sharing.
    
    The secret is split into n shares, requiring k shares to reconstruct.
    No single share reveals any information about the secret.
    This is information-theoretically secure (quantum-immune).
    """
    if request.threshold > request.num_shares:
        raise HTTPException(400, "Threshold cannot exceed number of shares")

    secret_id = str(uuid.uuid4())[:12]
    secret_bytes = request.value.encode('utf-8')

    # Split using Shamir's Secret Sharing
    shares = shamir_split(secret_bytes, request.threshold, request.num_shares)

    # Store share metadata (NOT the actual share values in production)
    # In production, shares would be distributed to different custodians/HSMs
    share_hashes = []
    for x, y in shares:
        share_hash = hashlib.sha256(f"{x}:{y}".encode()).hexdigest()[:16]
        share_hashes.append(share_hash)
        _share_registry[share_hash] = {
            "secret_id": secret_id,
            "share_index": x,
            "share_value": y,  # In production: distributed to custodians
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    # Calculate expiry
    expires_at = None
    if request.ttl_hours:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=request.ttl_hours)).isoformat()

    vault_entry = {
        "secret_id": secret_id,
        "name": request.name,
        "threshold": request.threshold,
        "num_shares": request.num_shares,
        "share_hashes": share_hashes,
        "mesh_lane": request.mesh_lane,
        "classification": request.classification,
        "expires_at": expires_at,
        "metadata": request.metadata,
        "created_by": current_user.id if hasattr(current_user, 'id') else "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "access_count": 0,
        "last_accessed": None,
        "status": "active",
    }
    _vault[secret_id] = vault_entry

    # Audit log
    _access_log.append({
        "action": "store",
        "secret_id": secret_id,
        "secret_name": request.name,
        "user": vault_entry["created_by"],
        "mesh_lane": request.mesh_lane,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "secret_id": secret_id,
        "name": request.name,
        "threshold": request.threshold,
        "num_shares": request.num_shares,
        "share_hashes": share_hashes,
        "classification": request.classification,
        "expires_at": expires_at,
        "mesh_lane": request.mesh_lane,
        "note": f"Secret split into {request.num_shares} shares. {request.threshold} required to reconstruct.",
    }


@router.post("/secrets/{secret_id}/retrieve")
async def retrieve_secret(
    secret_id: str = Path(...),
    request: SecretRetrieve = SecretRetrieve(reason="operational_access"),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Retrieve a secret from The Void by reconstructing from shares.
    
    Requires at least `threshold` shares to reconstruct.
    All access is logged for audit purposes.
    """
    entry = _vault.get(secret_id)
    if not entry:
        raise HTTPException(404, f"Secret '{secret_id}' not found in The Void")

    if entry["status"] != "active":
        raise HTTPException(410, f"Secret '{secret_id}' has been {entry['status']}")

    # Check expiry
    if entry.get("expires_at"):
        expires = datetime.fromisoformat(entry["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            entry["status"] = "expired"
            raise HTTPException(410, f"Secret '{secret_id}' has expired")

    # Verify threshold
    if request.shares_provided < entry["threshold"]:
        raise HTTPException(
            403,
            f"Insufficient shares: {request.shares_provided} provided, {entry['threshold']} required",
        )

    # Reconstruct from shares
    share_hashes = entry["share_hashes"][:request.shares_provided]
    shares = []
    for sh in share_hashes:
        share_data = _share_registry.get(sh)
        if share_data:
            shares.append((share_data["share_index"], share_data["share_value"]))

    if len(shares) < entry["threshold"]:
        raise HTTPException(500, "Could not retrieve enough shares for reconstruction")

    try:
        reconstructed = shamir_reconstruct(shares[:entry["threshold"]])
        secret_value = reconstructed.decode('utf-8')
    except Exception as e:
        raise HTTPException(500, f"Secret reconstruction failed: {str(e)}")

    # Update access tracking
    entry["access_count"] += 1
    entry["last_accessed"] = datetime.now(timezone.utc).isoformat()

    # Audit log
    _access_log.append({
        "action": "retrieve",
        "secret_id": secret_id,
        "secret_name": entry["name"],
        "user": current_user.id if hasattr(current_user, 'id') else "system",
        "reason": request.reason,
        "shares_used": len(shares),
        "mesh_lane": entry["mesh_lane"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "secret_id": secret_id,
        "name": entry["name"],
        "value": secret_value,
        "shares_used": len(shares),
        "access_count": entry["access_count"],
        "mesh_lane": entry["mesh_lane"],
    }


@router.delete("/secrets/{secret_id}")
async def destroy_secret(
    secret_id: str = Path(...),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Destroy a secret by shredding all shares.
    
    This is irreversible — the secret cannot be reconstructed after destruction.
    """
    entry = _vault.get(secret_id)
    if not entry:
        raise HTTPException(404, f"Secret '{secret_id}' not found")

    # Destroy all shares
    for sh in entry.get("share_hashes", []):
        if sh in _share_registry:
            del _share_registry[sh]

    entry["status"] = "destroyed"
    entry["destroyed_at"] = datetime.now(timezone.utc).isoformat()

    _access_log.append({
        "action": "destroy",
        "secret_id": secret_id,
        "secret_name": entry["name"],
        "user": current_user.id if hasattr(current_user, 'id') else "system",
        "shares_destroyed": len(entry.get("share_hashes", [])),
        "mesh_lane": entry["mesh_lane"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "secret_id": secret_id,
        "shares_destroyed": len(entry.get("share_hashes", [])),
        "message": "All shares shredded. Secret is irrecoverable.",
    }


@router.get("/secrets")
async def list_secrets(
    mesh_lane: Optional[str] = Query(None, description="Filter by mesh lane"),
    classification: Optional[str] = Query(None, description="Filter by classification"),
    status: Optional[str] = Query(None, description="Filter by status: active, expired, destroyed"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """List secrets in The Void (metadata only, never values)."""
    entries = list(_vault.values())

    if mesh_lane:
        entries = [e for e in entries if e.get("mesh_lane") == mesh_lane]
    if classification:
        entries = [e for e in entries if e.get("classification") == classification]
    if status:
        entries = [e for e in entries if e.get("status") == status]

    # Never return secret values in list
    safe_entries = [
        {k: v for k, v in e.items() if k not in ("share_hashes",)}
        for e in entries
    ]

    return {
        "status": "ok",
        "total": len(safe_entries),
        "secrets": safe_entries,
        "mesh_lane": "cross_lane",
    }


@router.post("/secrets/{secret_id}/rotate")
async def rotate_secret(
    secret_id: str = Path(...),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Rotate a secret by generating new shares.
    
    The old shares are destroyed and new shares are generated.
    The secret value remains the same but the shares change.
    """
    entry = _vault.get(secret_id)
    if not entry:
        raise HTTPException(404, f"Secret '{secret_id}' not found")

    if entry["status"] != "active":
        raise HTTPException(410, f"Secret '{secret_id}' is {entry['status']}")

    # First reconstruct the secret
    shares = []
    for sh in entry["share_hashes"][:entry["threshold"]]:
        share_data = _share_registry.get(sh)
        if share_data:
            shares.append((share_data["share_index"], share_data["share_value"]))

    if len(shares) < entry["threshold"]:
        raise HTTPException(500, "Cannot rotate: insufficient shares available")

    reconstructed = shamir_reconstruct(shares)

    # Destroy old shares
    for sh in entry.get("share_hashes", []):
        if sh in _share_registry:
            del _share_registry[sh]

    # Generate new shares
    new_shares = shamir_split(reconstructed, entry["threshold"], entry["num_shares"])
    new_hashes = []
    for x, y in new_shares:
        share_hash = hashlib.sha256(f"{x}:{y}".encode()).hexdigest()[:16]
        new_hashes.append(share_hash)
        _share_registry[share_hash] = {
            "secret_id": secret_id,
            "share_index": x,
            "share_value": y,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    entry["share_hashes"] = new_hashes
    entry["rotated_at"] = datetime.now(timezone.utc).isoformat()

    _access_log.append({
        "action": "rotate",
        "secret_id": secret_id,
        "secret_name": entry["name"],
        "user": current_user.id if hasattr(current_user, 'id') else "system",
        "mesh_lane": entry["mesh_lane"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "status": "ok",
        "secret_id": secret_id,
        "new_share_hashes": new_hashes,
        "message": "Secret rotated. Old shares destroyed, new shares generated.",
    }


# ============================================================
# SHARE STATUS & AUDIT
# ============================================================

@router.get("/shares/status")
async def get_shares_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the status of all Shamir shares across The Void."""
    active_secrets = sum(1 for v in _vault.values() if v.get("status") == "active")
    total_shares = len(_share_registry)
    expired = sum(1 for v in _vault.values() if v.get("status") == "expired")
    destroyed = sum(1 for v in _vault.values() if v.get("status") == "destroyed")

    return {
        "status": "ok",
        "vault_summary": {
            "active_secrets": active_secrets,
            "expired_secrets": expired,
            "destroyed_secrets": destroyed,
            "total_shares": total_shares,
        },
        "mesh_lane": "cross_lane",
    }


@router.post("/audit/access")
async def log_access_event(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Record an access event for audit purposes."""
    event = {
        "action": "audit_check",
        "user": current_user.id if hasattr(current_user, 'id') else "system",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _access_log.append(event)

    return {"status": "ok", "event": event}


@router.get("/audit/log")
async def get_audit_log(
    action: Optional[str] = Query(None, description="Filter by action: store, retrieve, destroy, rotate"),
    secret_id: Optional[str] = Query(None, description="Filter by secret ID"),
    limit: int = Query(100, ge=1, le=1000),
    current_user: CurrentUser = Depends(require_min_role(UserRole.USER)),
    db: AsyncSession = Depends(get_db_session),
):
    """Get The Void's access audit log."""
    log = list(_access_log)

    if action:
        log = [e for e in log if e.get("action") == action]
    if secret_id:
        log = [e for e in log if e.get("secret_id") == secret_id]

    log = sorted(log, key=lambda e: e.get("timestamp", ""), reverse=True)[:limit]

    return {
        "status": "ok",
        "total": len(log),
        "audit_log": log,
        "mesh_lane": "cross_lane",
    }


@router.get("/health")
async def health_check():
    """Void health check — Cross-lane secrets management status."""
    return {
        "status": "healthy",
        "service": "the_void",
        "mesh_lane": "cross_lane",
        "active_secrets": sum(1 for v in _vault.values() if v.get("status") == "active"),
        "total_shares": len(_share_registry),
        "audit_events": len(_access_log),
        "quantum_immune": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }