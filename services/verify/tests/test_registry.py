import pytest

from verify.registry import HOSTS, URLS, Registry, RegistryError, guard_url, parse_registry_html

ACTIVE = """
<table>
<tr><td>TNMC 87654</td><td>Kavitha Raman</td><td>Active</td></tr>
<tr><td>TNMC 00001</td><td>Other Person</td><td>Suspended</td></tr>
</table>
"""
MISSING = "<table><tr><td>nobody</td></tr></table>"


def test_allow_list_blocks_user_urls():
    with pytest.raises(RegistryError):
        guard_url("http://169.254.169.254/latest")
    with pytest.raises(RegistryError):
        guard_url("https://evil.example/rmp/search")
    with pytest.raises(RegistryError):
        guard_url("https://www.tamilnadumedicalcouncil.org.evil.com/rmp/search")
    with pytest.raises(RegistryError):
        guard_url("https://user:pass@www.tamilnadumedicalcouncil.org/rmp/search")
    for url in URLS.values():
        assert guard_url(url) == url
    assert "www.tamilnadumedicalcouncil.org" in HOSTS
    assert "nmc.org.in" in HOSTS


def test_parse_active_suspended_and_missing():
    ok = parse_registry_html(ACTIVE, "TNMC 87654", "Kavitha Raman")
    assert ok["status"] == "pass"
    bad = parse_registry_html(ACTIVE, "TNMC 00001", "Other Person")
    assert bad["status"] == "fail" and bad["evidence"]["reason"] == "suspended"
    missing = parse_registry_html(MISSING, "TNMC 87654", "Kavitha Raman")
    assert missing["status"] == "review" and missing["evidence"]["reason"] == "not_found"
    assert parse_registry_html("", "TNMC 87654", "Kavitha")["status"] == "review"


def test_live_off_does_not_call_transport():
    def boom(url, reg):
        raise AssertionError("network")

    reg = Registry(boom, live=False, now=lambda: 1000)
    result = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert result["status"] == "review"
    assert result["evidence"]["reason"] == "live_off"


def test_timeout_and_error_are_review():
    def timeout(url, reg):
        raise TimeoutError("slow")

    reg = Registry(timeout, live=True, now=lambda: 1000)
    assert reg.lookup("tnmc", "X", "Y")["evidence"]["reason"] == "timeout"

    def crash(url, reg):
        raise RuntimeError("reset")

    reg = Registry(crash, live=True, now=lambda: 5000)
    assert reg.lookup("nmc", "X", "Y")["evidence"]["reason"] == "error"


def test_rate_limit_skips_transport():
    calls = {"n": 0}

    def fetch(url, reg):
        calls["n"] += 1
        return ACTIVE

    clock = {"t": 0.0}

    def now():
        return clock["t"]

    reg = Registry(fetch, live=True, now=now)
    first = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert first["status"] == "pass" and calls["n"] == 1
    clock["t"] = 1
    limited = reg.lookup("tnmc", "OTHER", "Nobody")
    assert limited["evidence"]["reason"] == "rate_limit" and calls["n"] == 1
    clock["t"] = 10
    again = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert again["status"] == "pass" and calls["n"] == 1


def test_chain_stops_on_fail_and_falls_through_review():
    def fetch(url, reg):
        if "nmc.org.in" in url:
            return "<p>TNMC 87654 Kavitha Raman Active</p>"
        return "<p>no rows</p>"

    reg = Registry(fetch, live=True, now=lambda: 100)
    found = reg.lookup_chain(["tnmc", "nmc"], "TNMC 87654", "Kavitha Raman")
    assert found["status"] == "pass"
    assert found["evidence"]["provider"] == "nmc"


def test_manual_provider_is_review():
    reg = Registry(lambda *a: "nope", live=True, now=lambda: 0)
    assert reg.lookup("manual", "EL1", "Priya")["evidence"]["reason"] == "manual"
    assert reg.lookup("siddha-board", "S1", "Priya")["evidence"]["reason"] == "no_adapter"
