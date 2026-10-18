"""Face match adapter. FACE_PROVIDER selects it:

- none (default): no model is installed, so the check is "review" and can never auto-approve.
- mock: dev/test only. Pass when there is a probe and a reference and liveness passed. It does
  not look at faces. Never set it in production.
- hash: the old v1 byte average-hash (kept for the existing tests); not face recognition.
- insightface: optional real model (pip install -r requirements-face.txt; downloads the
  buffalo_l ArcFace model on first use, CPU). Cosine similarity between the selfie and the
  reference face. Thresholds FACE_PASS (0.45) / FACE_REVIEW (0.30) are starting points only;
  we have NOT measured accuracy. Calibrate on a consented labelled set before trusting it.

No reference photo, or a liveness result that is not pass, is "review".
"""
from __future__ import annotations

import os


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


def _hash_check(selfie: bytes, reference: bytes) -> dict:
    dist = hamming(average_hash(selfie), average_hash(reference))
    if selfie == reference or dist <= 4:
        return {"status": "pass", "score": 1, "evidence": {"hamming": dist, "provider": "hash"}}
    if dist <= 12:
        return {"status": "review", "score": 0.6, "evidence": {"reason": "distance", "hamming": dist, "provider": "hash"}}
    return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "mismatch", "hamming": dist, "provider": "hash"}}


class InsightFaceMatcher:
    _app = None

    def __init__(self, embed=None):
        self._embed = embed  # injectable for tests

    def embed(self, image: bytes):
        if self._embed:
            return self._embed(image)
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415  (optional dependency)
        from insightface.app import FaceAnalysis  # noqa: PLC0415
        if InsightFaceMatcher._app is None:
            app = FaceAnalysis(name=os.environ.get("FACE_MODEL", "buffalo_l"), providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=-1, det_size=(640, 640))
            InsightFaceMatcher._app = app
        img = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return None
        faces = InsightFaceMatcher._app.get(img)
        if len(faces) != 1:
            return None
        return faces[0].normed_embedding

    def compare(self, a: bytes, b: bytes) -> dict:
        ea, eb = self.embed(a), self.embed(b)
        if ea is None or eb is None:
            return {"status": "review", "score": None, "evidence": {"reason": "no_single_face", "provider": "insightface"}}
        sim = float(sum(float(x) * float(y) for x, y in zip(ea, eb, strict=False)))
        hi, lo = float(os.environ.get("FACE_PASS", "0.45")), float(os.environ.get("FACE_REVIEW", "0.30"))
        ev = {"similarity": round(sim, 4), "provider": "insightface", "calibrated": False}
        if sim >= hi:
            return {"status": "pass", "score": sim, "evidence": ev}
        if sim >= lo:
            return {"status": "review", "score": sim, "evidence": {**ev, "reason": "similarity"}}
        # Not calibrated, so a low score is review, not a hard reject.
        return {"status": "review", "score": sim, "evidence": {**ev, "reason": "low_similarity"}}


def face_check(selfie: bytes | None, reference: bytes | None, liveness_ok: bool, provider: str | None = None, matcher=None) -> dict:
    provider = (provider or os.environ.get("FACE_PROVIDER") or "none").lower()
    if not selfie or not reference:
        return {"status": "review", "score": None, "evidence": {"reason": "no_reference", "provider": provider}}
    if not liveness_ok:
        return {"status": "review", "score": 0.5, "evidence": {"reason": "liveness", "provider": provider}}
    if provider == "none":
        return {"status": "review", "score": None, "evidence": {"reason": "no_face_model", "provider": "none"}}
    if provider == "mock":
        return {"status": "pass", "score": 1, "evidence": {"reason": "mock", "provider": "mock"}}
    if provider == "insightface":
        try:
            return (matcher or InsightFaceMatcher()).compare(selfie, reference)
        except ImportError:
            return {"status": "review", "score": None, "evidence": {"reason": "model_not_installed", "provider": "insightface"}}
    return _hash_check(selfie, reference)
