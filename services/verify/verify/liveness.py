"""Active liveness. The server picks 2-3 random steps (blink, turn left/right, smile, nod) with a
nonce and a 3-minute window. The app records a few camera frames per step and uploads them to
the private kyc bucket. This module decides pass / review / fail from those frames.

LIVENESS_PROVIDER:
- heuristic (default): checks the frames exist for every step, were captured inside the window,
  are real images, and that the picture actually changes within and between steps (a printed
  photo or a single still re-uploaded gives near-zero change). This catches replays of one still
  image; it is NOT certified anti-spoofing (no depth, no screen-replay or mask detection).
- mock: dev/test only. Pass when every step has at least 2 distinct frames.
- vendor: hand the frames to a KYC vendor's liveness API (LIVENESS_VENDOR_URL + LIVENESS_VENDOR_KEY).
  The vendor reply must contain {"live": true|false, "score": 0..1}.
A missing camera (worker uploaded a file instead) is always "review".
"""
from __future__ import annotations

import io
import json
import os
import urllib.request


def _image_stats(data: bytes):
    from PIL import Image, ImageOps  # noqa: PLC0415

    img = Image.open(io.BytesIO(data))
    img = ImageOps.grayscale(img).resize((48, 48))
    return list(img.getdata())


def _diff(a: list[int], b: list[int]) -> float:
    return sum(abs(x - y) for x, y in zip(a, b, strict=False)) / max(len(a), 1)


def liveness_check(steps: list[str], frames: dict[str, list[bytes]], *, window_ok: bool, provider: str | None = None,
                   min_change: float = 2.0, vendor=None) -> dict:
    provider = (provider or os.environ.get("LIVENESS_PROVIDER") or "heuristic").lower()
    base = {"provider": provider, "steps": steps}
    if not steps:
        return {"status": "review", "score": None, "evidence": {**base, "reason": "no_challenge"}}
    if not window_ok:
        return {"status": "review", "score": None, "evidence": {**base, "reason": "window"}}
    missing = [s for s in steps if len(frames.get(s) or []) < 2]
    if missing:
        return {"status": "review", "score": None, "evidence": {**base, "reason": "missing_frames", "missing": missing}}
    if provider == "mock":
        distinct = all(len(set(frames[s])) >= 2 for s in steps)
        return {"status": "pass" if distinct else "review", "score": 1 if distinct else 0.5,
                "evidence": {**base, "reason": "mock" if distinct else "identical_frames"}}
    if provider == "vendor":
        try:
            res = (vendor or _vendor_call)(steps, frames)
        except Exception:  # noqa: BLE001
            return {"status": "review", "score": None, "evidence": {**base, "reason": "vendor_error"}}
        live = bool(res.get("live"))
        return {"status": "pass" if live else "review", "score": res.get("score"), "evidence": {**base, "reason": "vendor"}}
    try:
        stats = {s: [_image_stats(f) for f in frames[s]] for s in steps}
    except Exception:  # noqa: BLE001
        return {"status": "review", "score": None, "evidence": {**base, "reason": "bad_image"}}
    within = []
    for s in steps:
        seq = stats[s]
        within.append(max(_diff(seq[i], seq[i + 1]) for i in range(len(seq) - 1)))
    between = [_diff(stats[steps[i]][-1], stats[steps[i + 1]][0]) for i in range(len(steps) - 1)]
    moved = [w >= min_change for w in within]
    ev = {**base, "within": [round(w, 2) for w in within], "between": [round(b, 2) for b in between]}
    if all(w < 0.5 for w in within) and all(b < 0.5 for b in between):
        return {"status": "fail", "score": 0, "evidence": {**ev, "reason": "static_image"}}
    if all(moved):
        return {"status": "pass", "score": 0.8, "evidence": {**ev, "reason": "motion"}}
    return {"status": "review", "score": 0.4, "evidence": {**ev, "reason": "little_motion"}}


def _vendor_call(steps, frames) -> dict:
    url, key = os.environ.get("LIVENESS_VENDOR_URL", ""), os.environ.get("LIVENESS_VENDOR_KEY", "")
    if not url or not key:
        raise RuntimeError("vendor not configured")
    import base64  # noqa: PLC0415

    body = json.dumps({"steps": steps, "frames": {s: [base64.b64encode(f).decode() for f in frames[s]] for s in steps}}).encode()
    req = urllib.request.Request(url, data=body, headers={"content-type": "application/json", "authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 (operator-configured URL)
        return json.loads(r.read().decode())
