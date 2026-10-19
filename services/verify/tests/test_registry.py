import pytest

from verify.registry import ADAPTERS, HOSTS, URLS, Registry, RegistryError, build_request, guard_url, merge_adapters, parse_registry_html

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
    def boom(req):
        raise AssertionError("network")

    reg = Registry(boom, live=False, now=lambda: 1000)
    result = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert result["status"] == "review"
    assert result["evidence"]["reason"] == "live_off"


def test_timeout_and_error_are_review():
    def timeout(req):
        raise TimeoutError("slow")

    reg = Registry(timeout, live=True, now=lambda: 1000)
    assert reg.lookup("tnmc", "TNMC 1", "Y")["evidence"]["reason"] == "timeout"

    def crash(req):
        raise RuntimeError("reset")

    reg = Registry(crash, live=True, now=lambda: 5000)
    assert reg.lookup("nmc", "NMC 1", "Y")["evidence"]["reason"] == "error"


def test_rate_limit_skips_transport():
    calls = {"n": 0}

    def fetch(req):
        calls["n"] += 1
        return ACTIVE

    clock = {"t": 0.0}

    def now():
        return clock["t"]

    reg = Registry(fetch, live=True, now=now, allow_unconfirmed=True)
    first = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert first["status"] == "pass" and calls["n"] == 1
    clock["t"] = 1
    limited = reg.lookup("tnmc", "OTHER", "Nobody")
    assert limited["evidence"]["reason"] == "rate_limit" and calls["n"] == 1
    clock["t"] = 10
    again = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert again["status"] == "pass" and calls["n"] == 1


def test_chain_stops_on_fail_and_falls_through_review():
    def fetch(req):
        if "nmc.org.in" in req["url"]:
            return "<p>TNMC 87654 Kavitha Raman Active</p>"
        return "<p>no rows</p>"

    reg = Registry(fetch, live=True, now=lambda: 100, allow_unconfirmed=True)
    found = reg.lookup_chain(["tnmc", "nmc"], "TNMC 87654", "Kavitha Raman")
    assert found["status"] == "pass"
    assert found["evidence"]["provider"] == "nmc"


def test_manual_provider_is_review():
    reg = Registry(lambda *a: "nope", live=True, now=lambda: 0)
    assert reg.lookup("manual", "EL1", "Priya")["evidence"]["reason"] == "manual"
    assert reg.lookup("siddha-board", "S1", "Priya")["evidence"]["reason"] == "no_adapter"


def test_the_registration_number_is_sent():
    sent = []

    def fetch(req):
        sent.append(req)
        return ACTIVE

    reg = Registry(fetch, live=True, now=lambda: 50, allow_unconfirmed=True)
    reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert sent[0]["method"] == "GET" and "TNMC 87654" in sent[0]["params"].values()
    reg2 = Registry(fetch, live=True, now=lambda: 50, allow_unconfirmed=True)
    reg2.lookup("rci", "A12345", "Kavitha Raman")
    assert sent[1]["method"] == "POST" and sent[1]["data"] == {"crrno": "A12345"}


def test_unconfirmed_adapter_cannot_pass_or_hard_fail():
    reg = Registry(lambda req: ACTIVE, live=True, now=lambda: 9)
    ok = reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")
    assert ok["status"] == "review" and ok["evidence"]["reason"] == "unconfirmed_adapter" and ok["evidence"]["parsed"] == "pass"
    bad = Registry(lambda req: ACTIVE, live=True, now=lambda: 99).lookup("tnmc", "TNMC 00001", "Other Person")
    assert bad["status"] == "review" and bad["evidence"]["parsed"] == "fail"


def test_confirmed_override_and_host_lock():
    adapters = merge_adapters({"tnmc": {"confirmed": True, "field": "q"}, "nmc": {"url": "https://evil.example/x"}})
    assert adapters["tnmc"]["confirmed"] is True and adapters["tnmc"]["field"] == "q"
    assert adapters["nmc"]["url"].startswith("https://nmc.org.in")
    reg = Registry(lambda req: ACTIVE, live=True, now=lambda: 1, adapters=adapters)
    assert reg.lookup("tnmc", "TNMC 87654", "Kavitha Raman")["status"] == "pass"


def test_captcha_site_is_manual_and_empty_number_is_review():
    reg = Registry(lambda req: (_ for _ in ()).throw(AssertionError("no call")), live=True, now=lambda: 1)
    assert reg.lookup("coa", "CA/2010/12345", "Ar. Meena")["evidence"]["reason"] == "captcha"
    assert reg.lookup("tnmc", "  ", "X")["evidence"]["reason"] == "no_number"
    assert build_request(ADAPTERS["coa"], "CA/1")["data"] == {"reg_no": "CA/1"}
