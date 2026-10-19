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


def test_dispatch_claims_runs_and_records(monkeypatch):
    monkeypatch.setenv("VERIFY_SERVICE_KEY", "k")
    monkeypatch.setattr(main, "_db", lambda: ("http://db", {}))
    jobs = [[{"job_id": "j1", "case_id": "c1"}], [{"job_id": "j2", "case_id": "c2"}], []]
    calls = []

    def rpc(client, base, headers, fn, body):
        calls.append((fn, body))
        if fn == "verification_claim_job":
            return jobs.pop(0)
        return None

    def run(case_id):
        if case_id == "c2":
            raise RuntimeError("storage down")
        return {}

    monkeypatch.setattr(main, "_rpc", rpc)
    monkeypatch.setattr(main, "run_case", run)
    res = TestClient(main.app).post("/verify/dispatch", headers={"authorization": "Bearer k"})
    assert res.json() == {"done": 1, "failed": 1}
    finishes = [b for f, b in calls if f == "verification_job_finish"]
    assert finishes[0]["_ok"] is True and finishes[1]["_ok"] is False and "storage down" in finishes[1]["_error"]


def test_maintenance_deletes_through_storage_api(monkeypatch):
    monkeypatch.setenv("VERIFY_SERVICE_KEY", "k")
    monkeypatch.setattr(main, "_db", lambda: ("http://db", {}))
    marked = []

    def rpc(client, base, headers, fn, body):
        if fn == "verification_purge_due":
            return [{"case_id": "c1", "paths": ["u/qr.txt", "u/selfie.jpg"]}]
        marked.append(body)

    deleted = []

    def fake_delete(client, base, headers, bucket, paths):
        deleted.append(("DELETE", bucket, {"prefixes": paths}))
        return True

    monkeypatch.setattr(main, "_rpc", rpc)
    monkeypatch.setattr(main, "_storage_delete", fake_delete)
    assert TestClient(main.app).post("/verify/maintenance", headers={"authorization": "Bearer k"}).json() == {"purged": 1}
    assert deleted[0][0] == "DELETE" and deleted[0][2] == {"prefixes": ["u/qr.txt", "u/selfie.jpg"]}
    assert marked == [{"_case": "c1"}]
    assert TestClient(main.app).post("/verify/maintenance").status_code == 401
