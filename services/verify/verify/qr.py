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
import zlib

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from .names import fold


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


def read_qr(token: str, public_key: RSAPublicKey | None, pepper: str, uidai_key: RSAPublicKey | None = None) -> dict:
    text = (token or "").strip()
    secure = read_secure_qr(text, uidai_key, pepper)
    if secure is not None:
        return secure
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


# ---------------------------------------------------------------------------------------------
# UIDAI Secure QR (the QR printed on e-Aadhaar / Aadhaar letters since 2019, read by mAadhaar).
# Format (UIDAI "Secure QR Code Specification" v2): the QR text is a big decimal integer.
#   int -> big-endian bytes -> gzip/zlib-inflate -> fields separated by byte 255.
#   V2: "V2", email/mobile indicator, reference id, name, dob, gender, care-of, district, landmark,
#       house, location, pincode, post office, state, street, sub-district, VTC, last-4 of mobile,
#       then the JPEG-2000 photo, optional email/mobile SHA-256 hashes, and the last 256 bytes are a
#       SHA256withRSA signature over everything before them.
#   V1 (older) has no "V2" marker and no mobile last-4.
# reference id = last 4 Aadhaar digits + a timestamp. The full Aadhaar number is never in the QR.
# Signature check needs UIDAI's public certificate (free download from uidai.gov.in, see HANDOFF).
# Without it the payload is parsed and shown to the admin, but the check stays "review".
# ---------------------------------------------------------------------------------------------

V2_FIELDS = ["version", "email_mobile", "reference_id", "name", "dob", "gender", "care_of", "district", "landmark", "house",
             "location", "pincode", "post_office", "state", "street", "sub_district", "vtc", "mobile_last4"]
V1_FIELDS = V2_FIELDS[1:-1]


def load_uidai_key(path: str | None) -> RSAPublicKey | None:
    if not path:
        return None
    try:
        raw = open(path, "rb").read()
    except OSError:
        return None
    for loader in (lambda b: x509.load_pem_x509_certificate(b).public_key(), lambda b: x509.load_der_x509_certificate(b).public_key(),
                   lambda b: load_pem_public_key(b)):
        try:
            key = loader(raw)
            if isinstance(key, RSAPublicKey):
                return key
        except ValueError:
            continue
    return None


def decode_secure_qr(text: str) -> dict | None:
    """Return parsed fields + signed/signature bytes, or None when this is not a Secure QR."""
    s = (text or "").strip()
    if not s.isdigit() or len(s) < 200:
        return None
    n = int(s)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    try:
        data = zlib.decompress(raw, 47)  # 32 + 15: accept gzip or zlib headers
    except zlib.error:
        return None
    if len(data) < 300:
        return None
    signed, signature = data[:-256], data[-256:]
    v2 = signed.startswith(b"V2\xff")
    names = V2_FIELDS if v2 else V1_FIELDS
    parts = signed.split(b"\xff", len(names))
    if len(parts) <= len(names):
        return None
    fields = {k: parts[i].decode("iso-8859-1", errors="ignore") for i, k in enumerate(names)}
    rest = parts[len(names)]
    indicator = fields.get("email_mobile", "0")
    hashes = 0
    if indicator in ("1", "2"):
        hashes = 32
    elif indicator == "3":
        hashes = 64
    photo = rest[: len(rest) - hashes] if hashes else rest
    return {"fields": fields, "photo": photo, "signed": signed, "signature": signature, "version": "V2" if v2 else "V1"}


def read_secure_qr(text: str, uidai_key: RSAPublicKey | None, pepper: str) -> dict | None:
    parsed = decode_secure_qr(text)
    if parsed is None:
        return None
    f = parsed["fields"]
    ref = f.get("reference_id", "")
    last4 = ref[:4] if ref[:4].isdigit() else ""
    evidence = {"format": "uidai_secure_qr", "version": parsed["version"], "last4": last4, "name": f.get("name", ""),
                "dob": f.get("dob", ""), "gender": f.get("gender", ""), "has_photo": bool(parsed["photo"]),
                # reference id = last4 + a timestamp that changes per download, so the identity
                # fingerprint is last4 + folded name + date of birth (HMAC, never stored in clear).
                "hmac": hmac_uid(f"{last4}|{fold(f.get('name', ''))}|{f.get('dob', '')}", pepper) if last4 else ""}
    if not last4:
        return {"status": "fail", "score": 0, "evidence": {**evidence, "hard": "true", "reason": "bad_reference"}}
    if uidai_key is None:
        return {"status": "review", "score": 0.5, "evidence": {**evidence, "reason": "uidai_cert_missing"}, "photo": parsed["photo"]}
    try:
        uidai_key.verify(parsed["signature"], parsed["signed"], padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature:
        return {"status": "fail", "score": 0, "evidence": {**evidence, "hard": "true", "reason": "bad_signature"}}
    return {"status": "pass", "score": 1, "evidence": {**evidence, "reason": "uidai_signature"}, "photo": parsed["photo"]}


def encode_secure_qr_for_tests(private_key, fields: dict, photo: bytes = b"\x00\x00\x00\x0cjP  ", v2: bool = True) -> str:
    """Build a synthetic Secure QR (same layout, our own key). Tests only."""
    names = V2_FIELDS if v2 else V1_FIELDS
    vals = dict(fields)
    if v2:
        vals.setdefault("version", "V2")
    vals.setdefault("email_mobile", "0")
    body = b"\xff".join(str(vals.get(k, "")).encode("iso-8859-1") for k in names) + b"\xff" + photo
    sig = private_key.sign(body, padding.PKCS1v15(), hashes.SHA256())
    data = zlib.compress(body + sig)
    return str(int.from_bytes(data, "big"))
