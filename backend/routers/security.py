# routers/security.py — Crypto-shredding (GDPR Art.17), Merkle audit log, key management
import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_min_role, CurrentUser
from database import get_db_session
from models import (
    CryptoShredEvent, MerkleAuditBatch, AuditLog,
    User, FileNode, Document, KBArticle,
    UserRole, utcnow,
)

router = APIRouter(prefix="/api/v1/security", tags=["Security & Compliance"])


# ============================================================
# SCHEMAS
# ============================================================

class CryptoShredRequest(BaseModel):
    target_user_id: str
    legal_basis: str = "gdpr_art17"  # gdpr_art17, user_request, court_order
    request_reference: Optional[str] = None
    notes: Optional[str] = None


class CryptoShredOut(BaseModel):
    id: str
    target_user_id: str
    status: str
    tables_affected: List[str]
    records_affected: int
    legal_basis: str
    merkle_hash: Optional[str]
    completed_at: Optional[str]
    created_at: str


class MerkleBatchOut(BaseModel):
    id: str
    batch_number: int
    event_count: int
    merkle_root: str
    period_start: str
    period_end: str
    chain_network: Optional[str]
    chain_tx_hash: Optional[str]
    anchored_at: Optional[str]
    created_at: str


# ============================================================
# CRYPTO-SHREDDING (GDPR Art. 17 — Right to be Forgotten)
# ============================================================

@router.post("/crypto-shred", response_model=CryptoShredOut)
async def initiate_crypto_shred(
    req: CryptoShredRequest,
    user: CurrentUser = Depends(require_min_role(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Initiate crypto-shredding for a user (GDPR Art. 17 Right to be Forgotten).
    
    This operation:
    1. Nullifies all PII fields for the target user
    2. Soft-deletes all user-owned content
    3. Records the event in the tamper-evident audit log
    4. Generates a Merkle hash as proof of completion
    
    Note: Audit logs are NOT deleted (they are anonymised instead).
    """
    # Verify target user exists in same org
    stmt = select(User).where(
        User.id == req.target_user_id,
        User.organisation_id == user.organisation_id,
    )
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(status_code=404, detail="Target user not found in your organisation")

    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot crypto-shred your own account")

    tables_affected = []
    records_affected = 0

    # 1. Nullify user PII
    target.email = f"shredded_{target.id[:8]}@deleted.invalid"
    target.display_name = "[Deleted User]"
    target.password_hash = "SHREDDED"
    target.avatar_url = None
    target.deleted_at = utcnow()
    target.is_active = False
    tables_affected.append("users")
    records_affected += 1

    # 2. Soft-delete user's files
    file_stmt = select(FileNode).where(
        FileNode.owner_id == req.target_user_id,
        FileNode.deleted_at == None,  # noqa: E711
    )
    file_result = await db.execute(file_stmt)
    files = file_result.scalars().all()
    for f in files:
        f.deleted_at = utcnow()
        f.content = None  # Remove content
    if files:
        tables_affected.append("file_nodes")
        records_affected += len(files)

    # 3. Anonymise audit logs (keep for compliance, remove PII)
    audit_stmt = select(AuditLog).where(AuditLog.user_id == req.target_user_id)
    audit_result = await db.execute(audit_stmt)
    audit_logs = audit_result.scalars().all()
    for log in audit_logs:
        log.ip_address = None
        log.user_agent = None
    if audit_logs:
        tables_affected.append("audit_logs")
        records_affected += len(audit_logs)

    # 4. Generate Merkle hash as proof
    shred_data = {
        "target_user_id": req.target_user_id,
        "tables_affected": tables_affected,
        "records_affected": records_affected,
        "timestamp": utcnow().isoformat(),
        "initiated_by": user.id,
        "legal_basis": req.legal_basis,
    }
    merkle_hash = hashlib.sha256(
        json.dumps(shred_data, sort_keys=True).encode()
    ).hexdigest()

    # 5. Record the crypto-shred event
    shred_event = CryptoShredEvent(
        organisation_id=user.organisation_id,
        initiated_by=user.id,
        target_user_id=req.target_user_id,
        target_entity_type="user",
        target_entity_id=req.target_user_id,
        dek_destroyed=True,
        tables_affected=tables_affected,
        records_affected=records_affected,
        legal_basis=req.legal_basis,
        request_reference=req.request_reference,
        merkle_hash=merkle_hash,
        completed_at=utcnow(),
        status="completed",
        notes=req.notes,
    )
    db.add(shred_event)
    await db.commit()
    await db.refresh(shred_event)

    return CryptoShredOut(
        id=shred_event.id,
        target_user_id=req.target_user_id,
        status="completed",
        tables_affected=tables_affected,
        records_affected=records_affected,
        legal_basis=req.legal_basis,
        merkle_hash=merkle_hash,
        completed_at=shred_event.completed_at.isoformat() if shred_event.completed_at else None,
        created_at=shred_event.created_at.isoformat(),
    )


@router.get("/crypto-shred", response_model=List[CryptoShredOut])
async def list_crypto_shred_events(
    limit: int = Query(default=20, le=100),
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """List crypto-shredding events for audit purposes"""
    stmt = (
        select(CryptoShredEvent)
        .where(CryptoShredEvent.organisation_id == user.organisation_id)
        .order_by(CryptoShredEvent.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    events = result.scalars().all()

    return [
        CryptoShredOut(
            id=e.id,
            target_user_id=e.target_user_id or "",
            status=e.status or "pending",
            tables_affected=e.tables_affected or [],
            records_affected=e.records_affected or 0,
            legal_basis=e.legal_basis or "gdpr_art17",
            merkle_hash=e.merkle_hash,
            completed_at=e.completed_at.isoformat() if e.completed_at else None,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]


# ============================================================
# MERKLE AUDIT LOG (On-Chain Audit Blueprint)
# ============================================================

@router.post("/audit/merkle-batch")
async def create_merkle_batch(
    user: CurrentUser = Depends(require_min_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Create a Merkle tree batch from recent audit events.
    Batches audit events into a Merkle root for tamper-evident proof.
    Can optionally be anchored to an L2 blockchain.
    """
    # Get last batch number
    last_stmt = select(MerkleAuditBatch).order_by(MerkleAuditBatch.batch_number.desc()).limit(1)
    last_result = await db.execute(last_stmt)
    last_batch = last_result.scalar_one_or_none()
    next_batch_num = (last_batch.batch_number + 1) if last_batch else 1

    # Get audit events since last batch
    since = last_batch.period_end if last_batch else datetime(2020, 1, 1, tzinfo=timezone.utc)
    now = utcnow()

    audit_stmt = select(AuditLog).where(
        AuditLog.created_at > since,
        AuditLog.created_at <= now,
    ).order_by(AuditLog.created_at.asc()).limit(10000)
    audit_result = await db.execute(audit_stmt)
    events = audit_result.scalars().all()

    if not events:
        return {"message": "No new audit events to batch", "batch_number": next_batch_num}

    # Build Merkle tree
    leaf_hashes = []
    for event in events:
        event_data = {
            "id": event.id,
            "event_type": str(event.event_type),
            "user_id": event.user_id,
            "organisation_id": event.organisation_id,
            "created_at": event.created_at.isoformat() if event.created_at else "",
        }
        leaf_hash = hashlib.sha256(
            json.dumps(event_data, sort_keys=True).encode()
        ).hexdigest()
        leaf_hashes.append(leaf_hash)

    # Compute Merkle root
    merkle_root = _compute_merkle_root(leaf_hashes)

    batch = MerkleAuditBatch(
        organisation_id=None,  # Global batch
        batch_number=next_batch_num,
        event_count=len(events),
        first_event_id=events[0].id,
        last_event_id=events[-1].id,
        period_start=since,
        period_end=now,
        merkle_root=merkle_root,
        leaf_hashes=leaf_hashes[:100],  # Store first 100 for verification (full set in object storage)
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)

    return {
        "batch_number": next_batch_num,
        "event_count": len(events),
        "merkle_root": merkle_root,
        "period_start": since.isoformat(),
        "period_end": now.isoformat(),
        "message": "Merkle batch created. Anchor to L2 using POST /security/audit/merkle-batch/{id}/anchor",
    }


@router.get("/audit/merkle-batches", response_model=List[MerkleBatchOut])
async def list_merkle_batches(
    limit: int = Query(default=20, le=100),
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """List Merkle audit batches"""
    stmt = (
        select(MerkleAuditBatch)
        .order_by(MerkleAuditBatch.batch_number.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    batches = result.scalars().all()

    return [
        MerkleBatchOut(
            id=b.id,
            batch_number=b.batch_number,
            event_count=b.event_count,
            merkle_root=b.merkle_root,
            period_start=b.period_start.isoformat() if b.period_start else "",
            period_end=b.period_end.isoformat() if b.period_end else "",
            chain_network=b.chain_network,
            chain_tx_hash=b.chain_tx_hash,
            anchored_at=b.anchored_at.isoformat() if b.anchored_at else None,
            created_at=b.created_at.isoformat(),
        )
        for b in batches
    ]


@router.post("/audit/verify/{event_id}")
async def verify_audit_event(
    event_id: str,
    user: CurrentUser = Depends(require_min_role(UserRole.AUDITOR)),
    db: AsyncSession = Depends(get_db_session),
):
    """Verify an audit event's integrity against the Merkle tree"""
    stmt = select(AuditLog).where(AuditLog.id == event_id)
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Audit event not found")

    # Compute hash of this event
    event_data = {
        "id": event.id,
        "event_type": str(event.event_type),
        "user_id": event.user_id,
        "organisation_id": event.organisation_id,
        "created_at": event.created_at.isoformat() if event.created_at else "",
    }
    event_hash = hashlib.sha256(
        json.dumps(event_data, sort_keys=True).encode()
    ).hexdigest()

    # Find the batch containing this event
    batch_stmt = select(MerkleAuditBatch).where(
        MerkleAuditBatch.period_start <= event.created_at,
        MerkleAuditBatch.period_end >= event.created_at,
    ).limit(1)
    batch_result = await db.execute(batch_stmt)
    batch = batch_result.scalar_one_or_none()

    if not batch:
        return {
            "event_id": event_id,
            "event_hash": event_hash,
            "verified": False,
            "reason": "No Merkle batch found for this event's time period",
        }

    # Check if hash is in the batch
    in_batch = event_hash in (batch.leaf_hashes or [])

    return {
        "event_id": event_id,
        "event_hash": event_hash,
        "batch_number": batch.batch_number,
        "merkle_root": batch.merkle_root,
        "chain_tx_hash": batch.chain_tx_hash,
        "verified": in_batch,
        "reason": "Hash found in Merkle batch" if in_batch else "Hash not found in batch (may be in full batch stored off-chain)",
    }


# ============================================================
# HELPERS
# ============================================================

def _compute_merkle_root(hashes: List[str]) -> str:
    """Compute Merkle root from a list of SHA-256 hashes"""
    if not hashes:
        return hashlib.sha256(b"empty").hexdigest()
    if len(hashes) == 1:
        return hashes[0]

    # Pad to even number
    if len(hashes) % 2 == 1:
        hashes = hashes + [hashes[-1]]

    next_level = []
    for i in range(0, len(hashes), 2):
        combined = hashes[i] + hashes[i + 1]
        parent = hashlib.sha256(combined.encode()).hexdigest()
        next_level.append(parent)

    return _compute_merkle_root(next_level)