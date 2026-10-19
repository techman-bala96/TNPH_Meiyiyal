import json

from cryptography.hazmat.primitives.asymmetric import rsa

from verify.engine import evaluate
from verify.qr import sign_myqr
from verify.registry import Registry
from verify.risk import decide

PEPPER = "pepper"
RULES = {
    "identity": {"required": True, "weight": 25, "params": {}},
    "face": {"required": True, "weight": 20, "params": {}},
    "degree": {"required": True, "weight": 10, "params": {}},
    "name": {"required": True, "weight": 10, "params": {}},
    "forensics": {"required": True, "weight": 5, "params": {}},
    "duplicates": {"required": True, "weight": 0, "params": {}},
    "registry": {"required": False, "weight": 0, "params": {"provider": "none", "tier": "degree", "reg_field": "licence"}},
}


def test_degree_engineer_can_pass_without_a_council():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = sign_myqr(private, json.dumps({"uid": "999900001234", "name": "Priya Selvam"}).encode()).encode()
    selfie = b"\xff\xd8\xff" + b"selfie-bytes"
    cert = b"%PDF-1.4 Priya Selvam BE 2018 /Producer (iText) %%EOF"
    bundle = {
        "display_name": "Priya Selvam",
        "reg_data": {"degree": "BE", "reg_year": "2018"},
        "rules": RULES,
        "aadhaar_last4": "1234",
        "liveness_ok": True,
        "liveness_steps": ["blink", "turn-left"],
        "liveness_window_ok": True,
    }
    live = {"blink": [b"f1", b"f2"], "turn-left": [b"f3", b"f4"]}
    files = {"qr": token, "selfie": selfie, "portrait": selfie, "docs": {"degree_cert": cert}, "live": live}
    seen = []

    def observe(kind, digest):
        seen.append(kind)
        return "ok"

    registry = Registry(lambda *a: (_ for _ in ()).throw(AssertionError("network")), live=False)
    checks = evaluate(bundle, files, registry=registry, pepper=PEPPER, qr_public=private.public_key(), observe=observe,
                      face_provider="mock", liveness_provider="mock")
    by = {c["check"]: c for c in checks}
    assert by["identity"]["status"] == "pass"
    assert by["face"]["status"] == "pass"
    assert by["degree"]["status"] == "pass"
    assert by["forensics"]["status"] == "pass"
    assert by["name"]["status"] == "pass"
    assert "registry" not in by
    assert "aadhaar" in seen and "reg_no" not in seen
    decision, _, hard = decide(RULES, {k: {"status": v["status"], "evidence": v["evidence"]} for k, v in by.items()}, bundle["reg_data"], auto=True)
    assert decision == "auto_approve" and hard is None


def test_missing_qr_stays_review_so_it_cannot_auto_approve():
    bundle = {"display_name": "Priya Selvam", "reg_data": {"reg_year": "2018"}, "rules": RULES, "liveness_ok": False}
    files = {"docs": {"degree_cert": b"%PDF-1.4 Priya Selvam 2018"}}
    checks = evaluate(bundle, files, registry=Registry(lambda *a: "", live=False), pepper=PEPPER, qr_public=None, observe=lambda *a: "ok")
    by = {c["check"]: c["status"] for c in checks}
    assert by["identity"] == "review"
    assert by["face"] == "review"
