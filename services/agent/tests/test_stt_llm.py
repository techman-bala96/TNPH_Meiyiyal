import json

import httpx
import pytest

from agent import llm as llm_mod
from agent import main
from agent import stt as stt_mod
from tests.test_api import client, tok  # noqa: F401  (fixture + token helper)


def test_mock_llm_maps_everyday_phrases(lex):
    m = llm_mod.MockLLM()
    assert m.interpret("my dog is not eating", "en", lex)["node"] == "professionals--doctor--veterinary"
    assert m.interpret("எங்க மாடு சாப்பிடலை", "ta", lex)["node"] == "professionals--doctor--veterinary"
    assert m.interpret("need help with patta urgently now", "en", lex) == {"node": "professionals--lawyer--property-land", "filters": {"online_only": True}}
    assert m.interpret("hello there", "en", lex) is None


def test_openai_llm_validated_and_fails_closed(lex):
    seen = {}

    def ok(req: httpx.Request):
        seen["body"] = json.loads(req.content)
        seen["auth"] = req.headers["authorization"]
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"node": "professionals--engineer--civil", "filters": {"online_only": true, "sort": "cheap"}}'}}]})
    m = llm_mod.OpenAICompatLLM("https://llm.example/v1", "k-test", "small", transport=httpx.MockTransport(ok))
    out = llm_mod.validated(m.interpret("my wall has cracks", "en", lex), lex)
    assert out == {"node": "professionals--engineer--civil", "filters": {"online_only": True}}
    assert seen["auth"] == "Bearer k-test" and seen["body"]["response_format"] == {"type": "json_object"}
    assert "professionals--engineer--civil" in seen["body"]["messages"][0]["content"]
    # invented slug is dropped; HTTP errors and junk → None
    bad = llm_mod.OpenAICompatLLM("https://x/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": '{"node":"professionals--astrologer"}'}}]})))
    assert llm_mod.validated(bad.interpret("x", "en", lex), lex) is None
    down = llm_mod.OpenAICompatLLM("https://x/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert down.interpret("x", "en", lex) is None
    junk = llm_mod.OpenAICompatLLM("https://x/v1", "k", "m", transport=httpx.MockTransport(lambda r: httpx.Response(200, text="nope")))
    assert junk.interpret("x", "en", lex) is None


def test_load_llm_env(monkeypatch):
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "mock"); assert llm_mod.load_llm().name == "mock"
    monkeypatch.setenv("AGENT_LLM_PROVIDER", "openai")
    with pytest.raises(RuntimeError):
        llm_mod.load_llm()
    monkeypatch.setenv("AGENT_LLM_URL", "https://x/v1"); monkeypatch.setenv("AGENT_LLM_KEY", "k"); monkeypatch.setenv("AGENT_LLM_MODEL", "m")
    assert llm_mod.load_llm().name == "openai:m"
    monkeypatch.setenv("AGENT_LLM_PROVIDER", ""); assert llm_mod.load_llm().name == "none"


def test_parse_uses_mock_llm_when_grammar_is_stuck(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(main, "llm", llm_mod.MockLLM())
    r = client.post("/agent/parse", json={"text": "I can't sleep at night", "lang": "en"}, headers={"authorization": f"Bearer {tok()}"}).json()
    assert r["source"] == "llm:mock"
    assert r["node"] and r["node"].startswith("professionals--doctor--psychology-counselling")


def test_stt_route(client, monkeypatch):  # noqa: F811
    h = {"authorization": f"Bearer {tok()}"}
    monkeypatch.setattr(main, "stt", None)
    assert client.post("/agent/stt", content=b"x", headers={**h, "content-type": "audio/webm"}).status_code == 503
    monkeypatch.setattr(main, "stt", stt_mod.MockStt())
    r = client.post("/agent/stt?lang=ta", content="MOCK:குழந்தை மருத்துவர்".encode(), headers={**h, "content-type": "audio/webm;codecs=opus"})
    assert r.status_code == 200 and r.json() == {"text": "குழந்தை மருத்துவர்", "provider": "mock"}
    assert client.post("/agent/stt", content=b"MOCK:x", headers={**h, "content-type": "text/plain"}).status_code == 415
    assert client.post("/agent/stt", content=b"", headers={**h, "content-type": "audio/webm"}).status_code == 400
    assert client.post("/agent/stt", content=b"0" * (stt_mod.MAX_BYTES + 1), headers={**h, "content-type": "audio/webm"}).status_code == 413
    assert client.post("/agent/stt", content=b"MOCK:x", headers={"content-type": "audio/webm"}).status_code == 401


def test_google_and_openai_stt_adapters():
    seen = {}

    def g(req: httpx.Request):
        seen["g"] = (req.url.params.get("key"), json.loads(req.content)["config"])
        return httpx.Response(200, json={"results": [{"alternatives": [{"transcript": "child doctor "}]}, {"alternatives": [{"transcript": "near Madurai"}]}]})
    gs = stt_mod.GoogleStt("gk", transport=httpx.MockTransport(g))
    assert gs.transcribe(b"opus", "audio/webm", "ta") == "child doctor near Madurai"
    assert seen["g"][0] == "gk" and seen["g"][1]["languageCode"] == "ta-IN" and seen["g"][1]["encoding"] == "WEBM_OPUS"
    with pytest.raises(stt_mod.SttError):
        stt_mod.GoogleStt("gk", transport=httpx.MockTransport(lambda r: httpx.Response(403))).transcribe(b"a", "audio/webm", "en")

    def o(req: httpx.Request):
        seen["o"] = (req.headers["authorization"], req.headers["content-type"])
        return httpx.Response(200, json={"text": " lawyer in Salem "})
    os_ = stt_mod.OpenAICompatStt("https://stt.example/v1", "ok", "whisper-1", transport=httpx.MockTransport(o))
    assert os_.transcribe(b"a", "audio/ogg", "en") == "lawyer in Salem"
    assert seen["o"][0] == "Bearer ok" and seen["o"][1].startswith("multipart/form-data")


def test_load_stt_env(monkeypatch):
    monkeypatch.delenv("AGENT_STT_PROVIDER", raising=False); assert stt_mod.load_stt() is None
    monkeypatch.setenv("AGENT_STT_PROVIDER", "mock"); assert stt_mod.load_stt().name == "mock"
    monkeypatch.setenv("AGENT_STT_PROVIDER", "google")
    monkeypatch.delenv("AGENT_STT_KEY", raising=False)
    with pytest.raises(RuntimeError):
        stt_mod.load_stt()
    monkeypatch.setenv("AGENT_STT_KEY", "k"); assert stt_mod.load_stt().name == "google"
