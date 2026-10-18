"""Aadhaar QR. MYQR1 is a test envelope so CI can prove sign / tamper / last-4.

A real UIDAI Secure QR is not validated here (no UIDAI certificate). Unrecognised
payloads are 'review', never a pass and never a hard reject. The full number is
not returned — only the last 4 digits and an HMAC.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def sign_myqr(private_key, payload: bytes) -> str:
    sig = private_key.sign(payload, padding.PKCS1v15(), hashes.SHA256())
    return f"MYQR1.{_b64(payload)}.{_b64(sig)}"


def hmac_uid(uid: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), uid.encode(), hashlib.sha256).hexdigest()


def read_qr(token: str, public_key: RSAPublicKey | None, pepper: str) -> dict:
    text = (token or "").strip()
    if not text.startswith("MYQR1."):
        return {"status": "review", "score": None, "evidence": {"reason": "unrecognised_qr"}}
    parts = text.split(".")
    # No UIDAI certificate in v1. A test key is injected by tests; without one this is review.
    if public_key is None or len(parts) != 3:
        return {"status": "review", "score": None, "evidence": {"reason": "unrecognised_qr"}}
    try:
        payload, sig = _unb64(parts[1]), _unb64(parts[2])
        public_key.verify(sig, payload, padding.PKCS1v15(), hashes.SHA256())
        data = json.loads(payload.decode())
        uid = str(data.get("uid") or "")
        if not uid.isdigit() or len(uid) != 12 or uid[0] in "01":
            return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "bad_uid"}}
        return {
            "status": "pass",
            "score": 1,
            "evidence": {"last4": uid[-4:], "hmac": hmac_uid(uid, pepper), "name": str(data.get("name") or "")},
        }
    except (InvalidSignature, ValueError, json.JSONDecodeError, UnicodeError):
        return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "bad_signature"}}
