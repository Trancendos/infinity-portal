"""
c2pa_signing.py — C2PA Content Provenance Signing Module
EU AI Act Compliance: Article 50 — Transparency for AI-generated content
Deadline: August 2, 2026

Uses the official c2pa-python library from the Content Authenticity Initiative.
Supports both file-based and stream-based signing operations.

Configuration via environment variables:
  C2PA_ENABLED=true
  C2PA_CERT_PATH=/path/to/cert.pem
  C2PA_KEY_PATH=/path/to/key.pem  (or extracted from PKCS#12)
  C2PA_CERT_PASSWORD=  (for PKCS#12 certs)
  C2PA_CLAIM_GENERATOR=InfinityOS/3.0.0
  C2PA_TIMESTAMP_URL=http://timestamp.digicert.com
"""

import os
import io
import json
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple

logger = logging.getLogger("infinity-os.c2pa")

# Configuration
C2PA_ENABLED = os.getenv("C2PA_ENABLED", "false").lower() == "true"
C2PA_CERT_PATH = os.getenv("C2PA_CERT_PATH", "")
C2PA_KEY_PATH = os.getenv("C2PA_KEY_PATH", "")
C2PA_CERT_PASSWORD = os.getenv("C2PA_CERT_PASSWORD", "")
C2PA_CLAIM_GENERATOR = os.getenv("C2PA_CLAIM_GENERATOR", "InfinityOS/3.0.0")
C2PA_TIMESTAMP_URL = os.getenv("C2PA_TIMESTAMP_URL", "http://timestamp.digicert.com")

# Try to import c2pa library
_c2pa_available = False
try:
    from c2pa import Builder, Reader, Signer, C2paSigningAlg, C2paSignerInfo
    _c2pa_available = True
    logger.info("C2PA library loaded successfully")
except ImportError:
    logger.warning("c2pa-python not installed — C2PA signing unavailable. Install with: pip install c2pa-python")


def is_available() -> bool:
    """Check if C2PA signing is available and configured."""
    return _c2pa_available and C2PA_ENABLED and bool(C2PA_CERT_PATH)


def _load_signer() -> Optional[Any]:
    """Load the C2PA signer from certificate and key files."""
    if not _c2pa_available:
        return None

    try:
        cert_data = None
        key_data = None

        if C2PA_CERT_PATH.endswith(".p12") or C2PA_CERT_PATH.endswith(".pfx"):
            # PKCS#12 format — contains both cert and key
            with open(C2PA_CERT_PATH, "rb") as f:
                p12_data = f.read()
            # c2pa-python can handle PKCS#12 directly via SignerInfo
            signer_info = C2paSignerInfo(
                alg=C2paSigningAlg.PS256,
                cert=p12_data,
                key=p12_data,
                timestamp_url=C2PA_TIMESTAMP_URL,
            )
        else:
            # PEM format — separate cert and key files
            with open(C2PA_CERT_PATH, "rb") as f:
                cert_data = f.read()

            key_path = C2PA_KEY_PATH or C2PA_CERT_PATH.replace("-cert.pem", "-key.pem").replace("cert.pem", "key.pem")
            with open(key_path, "rb") as f:
                key_data = f.read()

            signer_info = C2paSignerInfo(
                alg=C2paSigningAlg.PS256,
                cert=cert_data,
                key=key_data,
                timestamp_url=C2PA_TIMESTAMP_URL,
            )

        return Signer.from_info(signer_info)

    except FileNotFoundError as e:
        logger.error(f"C2PA certificate file not found: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to load C2PA signer: {e}")
        return None


def build_manifest_json(
    request_id: str,
    model_used: str,
    prompt_hash: str,
    system_id: str,
    organisation_id: str,
    user_id: str,
    task_type: str = "general",
    risk_level: str = "MINIMAL_RISK",
) -> str:
    """Build a C2PA manifest JSON for AI-generated content.

    Includes EU AI Act required assertions:
    - AI generation disclosure (Art. 50)
    - Model provenance information
    - Training/mining restrictions
    - Risk classification
    """
    manifest = {
        "claim_generator": C2PA_CLAIM_GENERATOR,
        "title": f"AI Generation {request_id}",
        "assertions": [
            # AI Generation Disclosure (EU AI Act Art. 50)
            {
                "label": "c2pa.actions",
                "data": {
                    "actions": [
                        {
                            "action": "c2pa.created",
                            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
                            "softwareAgent": {
                                "name": "Infinity OS AI Engine",
                                "version": "3.0.0",
                            },
                        }
                    ]
                },
            },
            # Training/Mining Restrictions
            {
                "label": "cawg.training-mining",
                "data": {
                    "entries": {
                        "cawg.ai_inference": {"use": "allowed"},
                        "cawg.ai_generative_training": {"use": "notAllowed"},
                        "cawg.data_mining": {"use": "notAllowed"},
                    }
                },
            },
            # Custom: AI System Provenance (Infinity OS specific)
            {
                "label": "org.infinityos.ai-provenance",
                "data": {
                    "request_id": request_id,
                    "model_used": model_used,
                    "prompt_hash": prompt_hash,
                    "system_id": system_id,
                    "organisation_id": organisation_id,
                    "user_id": user_id,
                    "task_type": task_type,
                    "risk_level": risk_level,
                    "eu_ai_act_classification": risk_level,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "platform": "Infinity OS",
                    "platform_version": "3.0.0",
                },
            },
        ],
    }

    return json.dumps(manifest)


def sign_content(
    content: str,
    request_id: str,
    model_used: str,
    prompt: str,
    system_id: str,
    organisation_id: str,
    user_id: str,
    task_type: str = "general",
    risk_level: str = "MINIMAL_RISK",
) -> Dict[str, Any]:
    """Sign AI-generated content with C2PA provenance manifest.

    Returns a dict with:
      - signing_status: "SIGNED", "UNSIGNED" (no cert), or "FAILED"
      - content_hash: SHA-256 of the content
      - manifest_data: The C2PA manifest JSON
      - signed_manifest: The signed manifest bytes (if signing succeeded)
      - c2pa_manifest_url: URL to retrieve the manifest
    """
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()

    manifest_json = build_manifest_json(
        request_id=request_id,
        model_used=model_used,
        prompt_hash=prompt_hash,
        system_id=system_id,
        organisation_id=organisation_id,
        user_id=user_id,
        task_type=task_type,
        risk_level=risk_level,
    )

    result = {
        "signing_status": "UNSIGNED",
        "content_hash": content_hash,
        "prompt_hash": prompt_hash,
        "manifest_data": json.loads(manifest_json),
        "signed_manifest": None,
        "c2pa_manifest_url": f"/api/v1/ai/provenance/{request_id}",
    }

    if not is_available():
        logger.debug(f"C2PA signing not available for request {request_id} — returning unsigned manifest")
        return result

    try:
        signer = _load_signer()
        if not signer:
            result["signing_status"] = "FAILED"
            result["error"] = "Could not load C2PA signer"
            return result

        # For text content, we create a minimal JSON document to sign
        # C2PA is designed for media files, so we wrap text in a JSON container
        content_doc = json.dumps({
            "type": "ai-generated-text",
            "request_id": request_id,
            "content_hash": content_hash,
            "content_length": len(content),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }).encode("utf-8")

        source_stream = io.BytesIO(content_doc)
        dest_stream = io.BytesIO()

        with Builder(manifest_json) as builder:
            signed_bytes = builder.sign(
                signer, "application/json", source_stream, dest_stream
            )

        result["signing_status"] = "SIGNED"
        result["signed_manifest"] = dest_stream.getvalue().hex()[:200]  # Store truncated for DB
        logger.info(f"C2PA manifest signed for request {request_id}")

    except Exception as e:
        logger.error(f"C2PA signing failed for request {request_id}: {e}")
        result["signing_status"] = "FAILED"
        result["error"] = str(e)

    return result


def verify_manifest(manifest_data: bytes, content_type: str = "application/json") -> Dict[str, Any]:
    """Verify a C2PA manifest and return validation results."""
    if not _c2pa_available:
        return {"valid": False, "error": "c2pa-python not installed"}

    try:
        stream = io.BytesIO(manifest_data)
        with Reader(content_type, stream) as reader:
            manifest_store = json.loads(reader.json())
            return {
                "valid": True,
                "active_manifest": manifest_store.get("active_manifest"),
                "manifests": manifest_store.get("manifests", {}),
                "validation_status": manifest_store.get("validation_status", []),
            }
    except Exception as e:
        return {"valid": False, "error": str(e)}
