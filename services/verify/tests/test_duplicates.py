from verify.duplicates import duplicate_check


def test_clear_and_self_pass():
    assert duplicate_check(["ok"])["status"] == "pass"
    assert duplicate_check(["self", "ok"])["status"] == "pass"


def test_active_and_banned_are_hard_fails():
    active = duplicate_check(["ok", "active"])
    assert active["status"] == "fail" and active["evidence"]["hard"] == "true"
    banned = duplicate_check(["banned"])
    assert banned["evidence"]["reason"] == "banned"


def test_pending_or_rejected_holder_goes_to_review_not_ban():
    for o in ("claimed_pending", "previously_rejected"):
        r = duplicate_check(["ok", o])
        assert r["status"] == "review" and r["evidence"]["reason"] == o and "hard" not in r["evidence"]
    assert duplicate_check(["previously_rejected", "active"])["status"] == "fail"
