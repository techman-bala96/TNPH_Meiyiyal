"""Server speech-to-text adapters for browsers without Web Speech (Firefox, many iOS PWAs) or for better Tamil.

AGENT_STT_PROVIDER:
  ""      off (default): /agent/stt answers 503 and the app stays on the browser recogniser
  mock    test double: audio bytes "MOCK:<text>" transcribe to <text>; anything else to ""
  google  Google Cloud Speech-to-Text v1 (speech:recognize) with AGENT_STT_KEY (API key), ta-IN / en-IN, WEBM_OPUS
  openai  OpenAI-compatible /audio/transcriptions (e.g. Whisper): AGENT_STT_URL (…/v1), AGENT_STT_KEY, AGENT_STT_MODEL
Audio is never stored; it is forwarded once and dropped.
"""
from __future__ import annotations

import base64
import os
from typing import Protocol

import httpx

MAX_BYTES = 1_000_000  # ~60 s of Opus speech


class SttError(Exception):
    pass


class SttHook(Protocol):
    name: str

    def transcribe(self, audio: bytes, mime: str, lang: str) -> str: ...


class MockStt:
    name = "mock"

    def transcribe(self, audio: bytes, mime: str, lang: str) -> str:
        return audio[5:].decode("utf-8", "ignore").strip()[:500] if audio.startswith(b"MOCK:") else ""


class GoogleStt:
    name = "google"

    def __init__(self, key: str, transport: httpx.BaseTransport | None = None):
        self.key = key
        self.client = httpx.Client(timeout=15, transport=transport)

    def transcribe(self, audio: bytes, mime: str, lang: str) -> str:
        enc = "OGG_OPUS" if "ogg" in mime else "WEBM_OPUS"
        body = {"config": {"encoding": enc, "sampleRateHertz": 48000, "languageCode": "ta-IN" if lang == "ta" else "en-IN",
                           "alternativeLanguageCodes": ["en-IN"] if lang == "ta" else ["ta-IN"], "enableAutomaticPunctuation": False, "model": "latest_short"},
                "audio": {"content": base64.b64encode(audio).decode()}}
        try:
            r = self.client.post("https://speech.googleapis.com/v1/speech:recognize", params={"key": self.key}, json=body)
            r.raise_for_status()
            res = r.json().get("results") or []
            return " ".join(x["alternatives"][0]["transcript"].strip() for x in res if x.get("alternatives")).strip()[:500]
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
            raise SttError(type(e).__name__) from e


class OpenAICompatStt:
    def __init__(self, url: str, key: str, model: str, transport: httpx.BaseTransport | None = None):
        self.url = url.rstrip("/") + "/audio/transcriptions"
        self.key, self.model, self.name = key, model, f"openai:{model}"
        self.client = httpx.Client(timeout=20, transport=transport)

    def transcribe(self, audio: bytes, mime: str, lang: str) -> str:
        ext = "ogg" if "ogg" in mime else "mp4" if "mp4" in mime else "webm"
        try:
            r = self.client.post(self.url, headers={"authorization": f"Bearer {self.key}"},
                                 data={"model": self.model, "language": lang, "response_format": "json"},
                                 files={"file": (f"speech.{ext}", audio, mime or "audio/webm")})
            r.raise_for_status()
            return str(r.json().get("text", "")).strip()[:500]
        except (httpx.HTTPError, ValueError) as e:
            raise SttError(type(e).__name__) from e


def load_stt() -> SttHook | None:
    p = os.environ.get("AGENT_STT_PROVIDER", "").strip().lower()
    if not p or p == "none":
        return None
    if p == "mock":
        return MockStt()
    if p == "google":
        key = os.environ.get("AGENT_STT_KEY", "")
        if not key:
            raise RuntimeError("AGENT_STT_PROVIDER=google needs AGENT_STT_KEY")
        return GoogleStt(key)
    if p == "openai":
        url, key, model = os.environ.get("AGENT_STT_URL", ""), os.environ.get("AGENT_STT_KEY", ""), os.environ.get("AGENT_STT_MODEL", "whisper-1")
        if not (url and key):
            raise RuntimeError("AGENT_STT_PROVIDER=openai needs AGENT_STT_URL and AGENT_STT_KEY")
        return OpenAICompatStt(url, key, model)
    raise RuntimeError(f"unknown AGENT_STT_PROVIDER '{p}' (use mock, google or openai)")
