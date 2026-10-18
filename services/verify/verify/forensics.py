"""Document forensics v1: magic bytes, PDF producer, EXIF software tag, sha256.

Photoshop / Canva / GIMP is 'review' (blocks auto-approve). It is not a hard fail.
"""
from __future__ import annotations

import hashlib
import re

_EDITORS = ("photoshop", "canva", "gimp")


def _magic(data: bytes) -> str:
    if data.startswith(b"%PDF"):
        return "pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"RIFF") and b"WEBP" in data[:16]:
        return "webp"
    return "unknown"


def forensics_check(data: bytes | None) -> dict:
    if not data:
        return {"status": "review", "score": None, "evidence": {"reason": "missing_file"}}
    kind = _magic(data)
    digest = hashlib.sha256(data).hexdigest()
    if kind == "unknown":
        return {"status": "review", "score": 0.4, "evidence": {"reason": "unknown_type", "sha256": digest}}
    text = data.decode("latin1", errors="ignore").lower()
    producer = ""
    m = re.search(r"/producer\s*\(([^)]*)\)", text)
    if m:
        producer = m.group(1)
    software = ""
    sm = re.search(r"software\x00{0,2}([a-z0-9 ._-]{3,40})", text)
    if sm:
        software = sm.group(1)
    blob = f"{producer} {software} {text[:400]}"
    if any(ed in blob for ed in _EDITORS):
        return {"status": "review", "score": 0.3, "evidence": {"reason": "editor_software", "kind": kind, "sha256": digest}}
    return {"status": "pass", "score": 1, "evidence": {"kind": kind, "sha256": digest}}
