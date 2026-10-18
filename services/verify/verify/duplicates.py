"""Duplicate identity. 'ok' and 'self' pass. 'banned' and 'active' are a hard fail."""
from __future__ import annotations


def duplicate_check(observed: list[str]) -> dict:
    bad = [o for o in observed if o in ("banned", "active")]
    if bad:
        return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": bad[0]}}
    return {"status": "pass", "score": 1, "evidence": {"reason": "clear"}}
