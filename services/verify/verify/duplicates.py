"""Duplicate identity.

'ok' and 'self' pass. 'banned' (an admin blocked this identity) and 'active' (an approved professional already
holds it) are a hard fail. 'claimed_pending' (another unverified account holds it) and 'previously_rejected'
go to a person: never auto-approved, but never an automatic ban either, because the earlier account may be the
impostor and this one the genuine owner.
"""
from __future__ import annotations

HARD = ("banned", "active")
REVIEW = ("claimed_pending", "previously_rejected")


def duplicate_check(observed: list[str]) -> dict:
    bad = [o for o in observed if o in HARD]
    if bad:
        return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": bad[0]}}
    unsure = [o for o in observed if o in REVIEW]
    if unsure:
        return {"status": "review", "score": 0.5, "evidence": {"reason": unsure[0]}}
    return {"status": "pass", "score": 1, "evidence": {"reason": "clear"}}
