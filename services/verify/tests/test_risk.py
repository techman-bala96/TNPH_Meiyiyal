from verify.risk import decide

RULES = {
    "identity": {"required": True, "weight": 25, "params": {}},
    "face": {"required": True, "weight": 20, "params": {}},
    "registry": {"required": True, "weight": 30, "params": {"provider": "tnmc", "reg_field": "reg_no"}},
    "degree": {"required": True, "weight": 10, "params": {}},
    "name": {"required": True, "weight": 10, "params": {}},
    "forensics": {"required": True, "weight": 5, "params": {}},
    "duplicates": {"required": True, "weight": 0, "params": {}},
}


def chk(status, **evidence):
    return {"status": status, "evidence": evidence}


def all_pass():
    return {k: chk("pass") for k in RULES}


def test_all_pass_auto_approves():
    decision, risk, hard = decide(RULES, all_pass(), {"reg_no": "TN1"}, auto=True)
    assert decision == "auto_approve" and risk == 0 and hard is None


def test_auto_off_queues():
    decision, _, _ = decide(RULES, all_pass(), {"reg_no": "TN1"}, auto=False)
    assert decision == "queue"


def test_registry_review_queues():
    checks = all_pass()
    checks["registry"] = chk("review", reason="not_found")
    decision, risk, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "queue" and hard is None and risk == 15


def test_registry_fail_rejects():
    checks = all_pass()
    checks["registry"] = chk("fail", reason="suspended")
    decision, _, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "reject" and hard.startswith("registry:")


def test_identity_fail_rejects():
    checks = all_pass()
    checks["identity"] = chk("fail", reason="bad_signature")
    decision, _, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "reject" and hard.startswith("identity:")


def test_face_fail_without_hard_does_not_hard_reject():
    checks = all_pass()
    checks["face"] = chk("fail", reason="blur")
    decision, _, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert hard is None and decision == "queue"


def test_face_hard_mismatch_rejects():
    checks = all_pass()
    checks["face"] = chk("fail", hard="true", reason="mismatch")
    decision, _, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "reject" and hard.startswith("face:")


def test_risk_over_60_rejects():
    checks = {
        "identity": chk("review"),
        "face": chk("fail"),
        "registry": chk("review"),
        "degree": chk("fail"),
        "name": chk("fail"),
        "forensics": chk("fail"),
        "duplicates": chk("pass"),
    }
    decision, risk, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "reject" and hard == "risk" and risk > 60


def test_missing_check_blocks_auto():
    checks = all_pass()
    del checks["degree"]
    decision, risk, _ = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "queue" and risk == 5


def test_optional_registry_skipped_when_empty():
    rules = {**RULES, "registry": {"required": False, "weight": 30, "params": {"provider": "cmda", "reg_field": "licence", "optional": True}}}
    checks = all_pass()
    del checks["registry"]
    decision, _, _ = decide(rules, checks, {}, auto=True)
    assert decision == "auto_approve"


def test_optional_registry_counts_when_filled():
    rules = {**RULES, "registry": {"required": False, "weight": 30, "params": {"provider": "cmda", "reg_field": "licence"}}}
    checks = all_pass()
    checks["registry"] = chk("review", reason="not_found")
    decision, _, _ = decide(rules, checks, {"licence": "SE/1"}, auto=True)
    assert decision == "queue"


def test_provider_none_never_gates():
    rules = {**RULES, "registry": {"required": False, "weight": 0, "params": {"provider": "none", "reg_field": "reg_no", "tier": "degree"}}}
    checks = all_pass()
    del checks["registry"]
    decision, _, _ = decide(rules, checks, {"reg_no": "IDA1"}, auto=True)
    assert decision == "auto_approve"


def test_duplicate_fail_rejects():
    checks = all_pass()
    checks["duplicates"] = chk("fail", hard="true", reason="active")
    decision, _, hard = decide(RULES, checks, {"reg_no": "TN1"}, auto=True)
    assert decision == "reject" and hard.startswith("duplicates:")
