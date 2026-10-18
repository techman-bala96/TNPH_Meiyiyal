"""Decision formula. Keep this in lockstep with public.verification_decide."""
from __future__ import annotations


def decide(rules: dict, checks: dict, reg_data: dict | None, *, auto: bool, approve: float = 20, reject: float = 60) -> tuple[str, float, str | None]:
    """Return (decision, risk, hard_reason). decision is auto_approve | queue | reject."""
    reg_data = reg_data or {}
    risk = 0.0
    all_pass = True
    hard: str | None = None
    for key, rule in rules.items():
        required = bool(rule.get("required", True))
        params = rule.get("params") or {}
        if not required and key != "duplicates":
            if key != "registry":
                continue
            provider = params.get("provider") or "none"
            field = params.get("reg_field") or "reg_no"
            filled = bool(str(reg_data.get(field) or "").strip())
            if not filled or provider in ("none", ""):
                continue
        chk = checks.get(key)
        weight = float(rule.get("weight") or 0)
        if chk is None:
            all_pass = False
            risk += weight * 0.5
            continue
        status = chk.get("status")
        evidence = chk.get("evidence") or {}
        if status == "fail" and (key in ("identity", "registry", "duplicates") or (key == "face" and str(evidence.get("hard")) == "true")):
            hard = hard or f"{key}:{evidence.get('reason', status)}"
        if status != "pass":
            all_pass = False
        risk += weight * (0 if status == "pass" else 1 if status == "fail" else 0.5)
    if hard:
        return "reject", risk, hard
    if risk > reject:
        return "reject", risk, "risk"
    if auto and all_pass and risk <= approve:
        return "auto_approve", risk, None
    return "queue", risk, None
