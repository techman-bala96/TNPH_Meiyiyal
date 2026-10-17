import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from agent import auth, main

KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJWKS:
    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": KEY.public_key()})()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(auth, "_jwks", lambda: FakeJWKS())
    main._hits.clear()
    return TestClient(main.app)


def tok(role="authenticated", exp=3600, aud="authenticated", key=KEY):
    return jwt.encode({"sub": "u1", "role": role, "aud": aud, "exp": int(time.time()) + exp}, key, algorithm="ES256", headers={"kid": "k"})


def test_health(client):
    assert client.get("/agent/health").json()["ok"]


def test_requires_token(client):
    assert client.post("/agent/parse", json={"text": "child doctor"}).status_code == 401


@pytest.mark.parametrize("bad", [tok(exp=-10), tok(aud="other"), tok(role="anon"), tok(key=ec.generate_private_key(ec.SECP256R1())), "garbage"])
def test_rejects_bad_tokens(client, bad):
    assert client.post("/agent/parse", json={"text": "x"}, headers={"Authorization": f"Bearer {bad}"}).status_code in (401, 403)


def test_parse_ok(client):
    r = client.post("/agent/parse", json={"text": "child doctor online", "lang": "en"}, headers={"Authorization": f"Bearer {tok()}"})
    assert r.status_code == 200 and r.json()["node"].endswith("paediatrics") and r.json()["filters"]["online_only"]


def test_follow_up_round_trip(client):
    h = {"Authorization": f"Bearer {tok()}"}
    a = client.post("/agent/parse", json={"text": "I need a doctor"}, headers=h).json()
    b = client.post("/agent/parse", json={"text": "heart doctor", "pending": a["pending"]}, headers=h).json()
    assert a["action"] == "ask" and b["node"].endswith("cardiology")


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(main, "RATE", 2)
    h = {"Authorization": f"Bearer {tok()}"}
    codes = [client.post("/agent/parse", json={"text": "doctor"}, headers=h).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_text_length_limit(client):
    assert client.post("/agent/parse", json={"text": "a" * 600}, headers={"Authorization": f"Bearer {tok()}"}).status_code == 422
