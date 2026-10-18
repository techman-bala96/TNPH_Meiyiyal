"""Face check v1. Deterministic average-hash, not a face-recognition model.

No reference photo, or a liveness challenge the worker did not complete, is
'review' (cannot auto-approve). Identical bytes pass. A far hash is a hard fail.
"""
from __future__ import annotations


def average_hash(data: bytes, n: int = 64) -> int:
    buckets = [0] * n
    if not data:
        return 0
    for i, b in enumerate(data):
        buckets[i % n] += b
    avg = sum(buckets) / n
    bits = 0
    for i, v in enumerate(buckets):
        if v >= avg:
            bits |= 1 << i
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def face_check(selfie: bytes | None, reference: bytes | None, liveness_ok: bool) -> dict:
    if not selfie or not reference:
        return {"status": "review", "score": None, "evidence": {"reason": "no_reference"}}
    if not liveness_ok:
        return {"status": "review", "score": 0.5, "evidence": {"reason": "liveness"}}
    dist = hamming(average_hash(selfie), average_hash(reference))
    if selfie == reference or dist <= 4:
        return {"status": "pass", "score": 1, "evidence": {"hamming": dist}}
    if dist <= 12:
        return {"status": "review", "score": 0.6, "evidence": {"reason": "distance", "hamming": dist}}
    return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "mismatch", "hamming": dist}}
