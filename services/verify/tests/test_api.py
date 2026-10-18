from fastapi.testclient import TestClient

from verify import main


def test_health_is_open():
    client = TestClient(main.app)
    res = client.get("/verify/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert "tnmc" in body["registries"]
    assert "bctnpy" in body["registries"]


def test_run_requires_a_configured_key(monkeypatch):
    monkeypatch.delenv("VERIFY_SERVICE_KEY", raising=False)
    client = TestClient(main.app)
    res = client.post("/verify/cases/abc/run")
    assert res.status_code == 503


def test_run_rejects_a_bad_key_and_accepts_the_right_one(monkeypatch):
    monkeypatch.setenv("VERIFY_SERVICE_KEY", "local-test-key")
    called = {}

    def fake(case_id):
        called["id"] = case_id
        return {"decision": "queue"}

    monkeypatch.setattr(main, "run_case", fake)
    client = TestClient(main.app)
    assert client.post("/verify/cases/abc/run", headers={"authorization": "Bearer no"}).status_code == 401
    ok = client.post("/verify/cases/abc/run", headers={"authorization": "Bearer local-test-key"})
    assert ok.status_code == 200
    assert ok.json()["decision"] == "queue"
    assert called["id"] == "abc"


def test_official_urls_survive_the_guard():
    for url in main.URLS.values():
        assert main.guard_url(url) == url
